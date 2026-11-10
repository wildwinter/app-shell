// A pick with a pool takes any text, in a box that suggests (patterkit design/proposals/free-text-picks.md).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { valueRow, type ValueAdapter, type ValueDecl } from "../src/value-rows.js";

afterEach(() => { document.body.replaceChildren(); });

const look: ValueDecl = { name: "look", type: "pick", from: [{ words: ["away"] }, { to: "cast" }, { pool: "pointOfInterest" }], help: "Where they look." };
const adapter: ValueAdapter = {
  nodes: (kind) => (kind === "cast" ? [{ id: "TAM", label: "Old Tam" }, { id: "WREN", label: "Wren" }] : []),
  pool: (name) => (name === "pointOfInterest" ? ["the gate", "well", "TAM"] : []),
};

function setUp(value?: string) {
  const commits: unknown[] = [];
  const row = valueRow({ decl: look, value, adapter, onCommit: (v) => commits.push(v) });
  document.body.append(row.el);
  const input = row.el.querySelector<HTMLInputElement>("input[role=combobox]")!;
  const items = (): string[] => [...document.querySelectorAll(".shell-suggest-item")].map((i) => i.textContent ?? "");
  const groups = (): string[] => [...document.querySelectorAll(".shell-suggest-group")].map((i) => i.textContent ?? "");
  const key = (k: string): void => { input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); };
  const type = (text: string): void => { input.value = text; input.dispatchEvent(new Event("input")); };
  return { row, input, commits, items, groups, key, type };
}

describe("a pick with a pool", () => {
  it("is a box, not a dropdown, showing a cast member by name", () => {
    const { row, input } = setUp("TAM");
    expect(row.el.querySelector("select")).toBeNull();
    expect(input.value).toBe("Old Tam");
    expect(input.placeholder).toBe("default (auto)");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("suggests the fixed words, then the cast, then the pool less what the others offer", () => {
    const { input, items, groups } = setUp();
    input.dispatchEvent(new Event("focus"));
    expect(items()).toEqual(["away", "Old Tam", "Wren", "the gate", "well"]);
    expect(groups()).toEqual(["Cast", "Used in this project"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("filters as you type, anywhere in the name, case ignored, and Enter takes the highlighted one", () => {
    const { input, items, key, type, commits } = setUp();
    input.dispatchEvent(new Event("focus"));
    type("GATE");
    expect(items()).toEqual(["the gate"]);
    key("ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe(document.querySelector(".shell-suggest-item")!.id);
    key("Enter");
    expect(commits).toEqual(["the gate"]);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("takes any text, trimmed, and a cast member typed by name is held by id", () => {
    const { input, key, type, commits } = setUp();
    type("  the bell tower ");
    key("Enter");
    type("Wren");
    key("Enter");
    expect(commits).toEqual(["the bell tower", "WREN"]);
    expect(input.value).toBe("Wren");
  });

  it("keeps what's typed on leaving the box, and clearing it is automatic", () => {
    const { input, type, commits } = setUp("well");
    type("the well");
    input.dispatchEvent(new Event("blur"));
    type("");
    input.dispatchEvent(new Event("blur"));
    expect(commits).toEqual(["the well", undefined]);
  });

  it("closes on Escape and puts the text back, without closing the dialog it's in", () => {
    const { input, key, type, commits } = setUp("well");
    input.dispatchEvent(new Event("focus"));
    type("we");
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(input.value).toBe("well");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    key("Enter");
    expect(commits).toEqual([]);   // unchanged: nothing to say
  });

  it("raises no problem for a name no source holds", () => {
    const { row } = setUp("somewhere new");
    expect(row.el.querySelector<HTMLElement>(".shell-fieldrow-problem")!.hidden).toBe(true);
  });
});
