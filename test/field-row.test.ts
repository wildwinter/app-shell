// @vitest-environment jsdom
// The field row (value-control.ts fieldRow / fieldRows): one control per declared type, the purpose under it,
// the unset state naming its fallback, the declaration's own checks said in words, commit as typed with Escape
// restoring, and a row that keeps its element and focus across a host's redraw.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldRow, fieldRows, fieldValueProblem, type FieldRowOptions } from "../src/value-control.js";

afterEach(() => { document.body.replaceChildren(); });

const type = (field: HTMLInputElement | HTMLTextAreaElement, text: string): void => {
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
};
const key = (field: HTMLElement, k: string): void => { field.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); };
const flick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe("fieldRow controls by type", () => {
  it("text commits as typed, blank clears, and the blank says what holds", () => {
    const onCommit = vi.fn();
    const { el } = fieldRow({ decl: { name: "mood", type: "text", default: "calm" }, value: undefined, onCommit });
    const input = el.querySelector("input")!;
    expect(input.placeholder).toBe("default (calm)");
    type(input, "tense");
    expect(onCommit).toHaveBeenLastCalledWith("tense");
    type(input, "");
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });

  it("Escape puts back what the field held at focus, and commits it", () => {
    const onCommit = vi.fn();
    const { el } = fieldRow({ decl: { name: "mood", type: "text" }, value: "calm", onCommit });
    document.body.append(el);
    const input = el.querySelector("input")!;
    input.focus();
    type(input, "calmer");
    key(input, "Escape");
    expect(input.value).toBe("calm");
    expect(onCommit).toHaveBeenLastCalledWith("calm");
  });

  it("multiline is a text area", () => {
    const { el } = fieldRow({ decl: { name: "note", type: "multiline" }, value: "one\ntwo", onCommit: vi.fn() });
    const area = el.querySelector("textarea")!;
    expect(area.value).toBe("one\ntwo");
  });

  it("a number commits as a number, and text that is not one is said and not committed", () => {
    const onCommit = vi.fn();
    const { el } = fieldRow({ decl: { name: "weight", type: "number" }, value: 2, onCommit });
    const input = el.querySelector("input")!;
    expect(input.placeholder).toBe("default (0)");
    type(input, "3.5");
    expect(onCommit).toHaveBeenLastCalledWith(3.5);
    type(input, "lots");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(el.querySelector(".shell-fieldrow-problem")!.textContent).toBe("Not a number.");
  });

  it("boolean and enum are selects that lead with default (x)", () => {
    const onCommit = vi.fn();
    const b = fieldRow({ decl: { name: "lit", type: "boolean", default: true }, value: undefined, onCommit }).el.querySelector("select")!;
    expect([...b.options].map((o) => o.text)).toEqual(["default (True)", "True", "False"]);
    b.value = "false"; b.dispatchEvent(new Event("change"));
    expect(onCommit).toHaveBeenLastCalledWith(false);
    const e = fieldRow({ decl: { name: "kind", type: "enum", values: ["a", "b"] }, value: "b", onCommit }).el.querySelector("select")!;
    expect([...e.options].map((o) => o.text)).toEqual(["default (a)", "a", "b"]);
    expect(e.value).toBe("b");
    e.value = ""; e.dispatchEvent(new Event("change"));
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });

  it("an enum value that is no longer a value stays visible and is said", () => {
    const { el } = fieldRow({ decl: { name: "kind", type: "enum", values: ["a", "b"] }, value: "z", onCommit: vi.fn() });
    expect(el.querySelector("select")!.value).toBe("z");
    expect(el.querySelector(".shell-fieldrow-problem")!.textContent).toBe('"z" is not one of the values.');
  });

  it("flags pick from the declared values, keep their order, and clear back to the default", () => {
    const onCommit = vi.fn();
    const handle = fieldRow({ decl: { name: "tags", type: "flags", values: ["x", "y", "z"] }, value: undefined, onCommit });
    const chips = (): string[] => [...handle.el.querySelectorAll(".shell-flag")].map((c) => `${c.textContent}${c.classList.contains("on") ? "*" : ""}`);
    expect(chips()).toEqual(["default (none)*", "x", "y", "z"]);
    (handle.el.querySelectorAll(".shell-flag")[3] as HTMLButtonElement).click();
    expect(onCommit).toHaveBeenLastCalledWith(["z"]);
    (handle.el.querySelectorAll(".shell-flag")[1] as HTMLButtonElement).click();
    expect(onCommit).toHaveBeenLastCalledWith(["x", "z"]);
    (handle.el.querySelectorAll(".shell-flag")[3] as HTMLButtonElement).click();
    expect(onCommit).toHaveBeenLastCalledWith(["x"]);
    (handle.el.querySelector(".shell-flag-default") as HTMLButtonElement).click();
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });

  it("an unset flags value starts from the declared default, marked as the fallback", () => {
    const { el } = fieldRow({ decl: { name: "tags", type: "flags", values: ["x", "y"], default: ["y"] }, value: undefined, onCommit: vi.fn() });
    expect(el.querySelector(".shell-flag.fallback")!.textContent).toBe("y");
  });

  it("a held flag the declaration does not offer is struck, said, and dropped on a click", () => {
    const onCommit = vi.fn();
    const { el } = fieldRow({ decl: { name: "tags", type: "flags", values: ["x"] }, value: ["x", "gone"], onCommit });
    expect(el.querySelector(".shell-flag.stray")!.textContent).toBe("gone");
    expect(el.querySelector(".shell-fieldrow-problem")!.textContent).toBe('"gone" is not one of the values.');
    (el.querySelector(".shell-flag.stray") as HTMLButtonElement).click();
    expect(onCommit).toHaveBeenLastCalledWith(["x"]);
  });

  it("a quality is the rung strip", () => {
    const onCommit = vi.fn();
    const { el } = fieldRow({ decl: { name: "act", type: "quality", stages: ["one", "two"] }, value: "one", onCommit });
    expect([...el.querySelectorAll(".shell-rung")].map((r) => r.textContent)).toEqual(["default (one)", "one", "two"]);
    (el.querySelectorAll(".shell-rung")[2] as HTMLButtonElement).click();
    expect(onCommit).toHaveBeenLastCalledWith("two");
  });

  it("shows the purpose under the control, and the app's own message", () => {
    const { el } = fieldRow({ decl: { name: "mood", type: "text", purpose: "How the room feels" }, value: "", problem: "Nobody reads this.", onCommit: vi.fn() });
    expect(el.querySelector(".shell-fieldrow-purpose")!.textContent).toBe("How the room feels");
    expect(el.querySelector(".shell-fieldrow-problem")!.textContent).toBe("Nobody reads this.");
    expect(el.querySelector(".shell-fieldrow-label")!.textContent).toBe("mood");
  });

  it("is read-only without onCommit, and when disabled", () => {
    expect(fieldRow({ decl: { name: "a", type: "text" }, value: "x" }).el.querySelector("input")!.disabled).toBe(true);
    expect(fieldRow({ decl: { name: "a", type: "enum", values: ["x"] }, value: "x", onCommit: vi.fn(), disabled: true }).el.querySelector("select")!.disabled).toBe(true);
    expect(fieldRow({ decl: { name: "a", type: "flags", values: ["x"] }, value: ["x"] }).el.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("fieldValueProblem", () => {
  it("says nothing of an unset value or a fitting one", () => {
    expect(fieldValueProblem({ type: "number" }, undefined)).toBe("");
    expect(fieldValueProblem({ type: "quality", stages: ["a"] }, "a")).toBe("");
    expect(fieldValueProblem({ type: "quality", stages: ["a"] }, "b")).toBe('"b" is not one of the stages.');
    expect(fieldValueProblem({ type: "flags", values: ["a"] }, ["b", "c"])).toBe('"b", "c" are not among the values.');
  });
});

describe("fieldRows across a redraw", () => {
  const opts = (value: unknown, onCommit = vi.fn()): FieldRowOptions => ({ decl: { name: "mood", type: "text" }, value, onCommit });

  it("hands back the same element for the same key, updated", () => {
    const rows = fieldRows();
    const a = rows.row("n1:mood", opts("calm"));
    const b = rows.row("n1:mood", opts("tense"));
    expect(b).toBe(a);
    expect(a.querySelector("input")!.value).toBe("tense");
    expect(rows.row("n2:mood", opts("calm"))).not.toBe(a);
  });

  it("keeps the author's text and gives the focus and caret back when a redraw moves the row", async () => {
    const rows = fieldRows();
    const host = document.createElement("div");
    document.body.append(host);
    const onCommit = vi.fn((v: unknown) => {
      // The host redraws on every commit, as Patterpad's inspector does: it clears, then rebuilds.
      host.replaceChildren();
      host.append(rows.row("n1:mood", { ...opts(v), onCommit }));
      rows.sweep();
    });
    host.append(rows.row("n1:mood", { ...opts("1"), onCommit }));
    const input = host.querySelector("input")!;
    input.focus();
    input.value = "1.";
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flick();
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("1.");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    key(input, "Escape");
    expect(input.value).toBe("1");   // Escape still restores the value at the first focus, not the refocus
  });

  it("survives a blur fired as the host clears its view, before the row is asked for again (Chromium)", async () => {
    const rows = fieldRows();
    const host = document.createElement("div");
    document.body.append(host);
    const onCommit = vi.fn((v: unknown) => {
      host.querySelector("input")!.blur();   // Chromium's synchronous blur as the focused field leaves the page
      host.replaceChildren();
      host.append(rows.row("k", { ...opts(v), onCommit }));
      rows.sweep();
    });
    host.append(rows.row("k", { ...opts(""), onCommit }));
    const input = host.querySelector("input")!;
    input.focus();
    type(input, "a");
    await flick(); await flick();
    expect(document.activeElement).toBe(input);
    type(input, "ab");
    await flick(); await flick();
    expect(document.activeElement).toBe(input);
    expect(onCommit).toHaveBeenLastCalledWith("ab");
  });

  it("does not take the focus back from somewhere the author has gone since", async () => {
    const rows = fieldRows();
    const host = document.createElement("div");
    const other = document.createElement("input");
    document.body.append(host, other);
    host.append(rows.row("k", opts("a")));
    const input = host.querySelector("input")!;
    input.focus();
    host.replaceChildren();
    other.focus();
    host.append(rows.row("k", opts("b")));
    await flick();
    expect(document.activeElement).toBe(other);
    expect(input.value).toBe("b");
  });

  it("sweeps rows a redraw no longer asks for", () => {
    const rows = fieldRows();
    const a = rows.row("k", opts("a"));
    rows.sweep();
    rows.sweep();
    expect(rows.row("k", opts("a"))).not.toBe(a);
  });
});

describe("a value's own help", () => {
  it("shows the chosen enum value's, the fallback's when unset, each chosen flag's, and the stage's, following each change", () => {
    const tone = fieldRow({ decl: { name: "tone", type: "enum", values: ["calm", "tense"], valueHelp: { calm: "Unhurried.", tense: "Clipped." } }, value: "tense", onCommit: () => {} });
    const help = (el: HTMLElement): string => el.querySelector(".shell-fieldrow-valuehelp")?.textContent ?? "";
    expect(help(tone.el)).toBe("Clipped.");
    const sel = tone.el.querySelector("select")!;
    sel.value = ""; sel.dispatchEvent(new Event("change"));
    expect(help(tone.el)).toBe("Unhurried.");
    const marks = fieldRow({ decl: { name: "marks", type: "flags", values: ["night", "rain"], valueHelp: { night: "After dark.", rain: "Wet." } }, value: ["night", "rain"], onCommit: () => {} });
    expect(help(marks.el)).toBe("night: After dark.\nrain: Wet.");
    const act = fieldRow({ decl: { name: "act", type: "quality", stages: ["setup", "turn"], valueHelp: { turn: "The middle." } }, value: "turn", onCommit: () => {} });
    expect(help(act.el)).toBe("The middle.");
    const plain = fieldRow({ decl: { name: "tone", type: "enum", values: ["a"] }, value: "a", onCommit: () => {} });
    expect(plain.el.querySelector<HTMLElement>(".shell-fieldrow-valuehelp")!.hidden).toBe(true);
  });
});
