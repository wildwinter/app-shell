// The property list (property-list.ts): defaultControl per type with the one
// "(none)" label, add-then-focus, the dup guard, extras, reorder.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultControl, mountPropertyList, PROPERTY_TYPES } from "../src/property-list.js";

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => document.body.replaceChildren());

const options = (sel: HTMLElement): string[] => [...sel.querySelectorAll("option")].map((o) => o.textContent ?? "");
const change = (sel: HTMLSelectElement, v: string): void => { sel.value = v; sel.dispatchEvent(new Event("change")); };

describe("defaultControl", () => {
  it("boolean: a picker with (none) / True / False, stored as a string by default", () => {
    const p = { name: "a", type: "boolean", default: "" };
    const sel = defaultControl(p) as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    expect(options(sel)).toEqual(["(none)", "True", "False"]);
    change(sel, "true");
    expect(p.default).toBe("true");
    change(sel, "");
    expect(p.default).toBe("");
  });

  it("boolean and number, typed: real values, and none deletes the key", () => {
    const b: { name: string; type: string; default?: unknown } = { name: "a", type: "boolean", default: true };
    const sel = defaultControl(b, undefined, { typed: true }) as HTMLSelectElement;
    expect(sel.value).toBe("true");
    change(sel, "false");
    expect(b.default).toBe(false);
    change(sel, "");
    expect("default" in b).toBe(false);
    const n: { name: string; type: string; default?: unknown } = { name: "n", type: "number" };
    const input = defaultControl(n, undefined, { typed: true }) as HTMLInputElement;
    expect(input.type).toBe("number");
    input.value = "3"; input.dispatchEvent(new Event("input"));
    expect(n.default).toBe(3);
  });

  it("enum: (none) then the values; quality: (first stage) then the stages; flags: a note", () => {
    const e = { name: "e", type: "enum", values: ["red", "blue"], default: "blue" };
    const es = defaultControl(e) as HTMLSelectElement;
    expect(options(es)).toEqual(["(none)", "red", "blue"]);
    expect(es.value).toBe("blue");
    const q = { name: "q", type: "quality", stages: ["cold", "warm"] };
    expect(options(defaultControl(q))).toEqual(["(first stage)", "cold", "warm"]);
    const f = defaultControl({ name: "f", type: "flags" });
    expect(f.tagName).toBe("SPAN");
    expect(f.textContent).toBe("Starts empty");
    expect(f.dataset["tip"]).toBeDefined();
    expect(f.title).toBe("");
  });

  it("string: a text field, reporting through onChange", () => {
    const onChange = vi.fn();
    const p = { name: "s", type: "string", default: "" };
    const input = defaultControl(p, onChange) as HTMLInputElement;
    expect(input.type).toBe("text");
    input.value = "hello"; input.dispatchEvent(new Event("input"));
    expect(p.default).toBe("hello");
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe("mountPropertyList", () => {
  it("draws a row per declaration with the six types, and the empty sentence with none", () => {
    const host = document.createElement("div");
    document.body.append(host);
    mountPropertyList(host, []);
    expect(host.querySelector(".empty")?.textContent).toBe("No properties yet.");
    const host2 = document.createElement("div");
    mountPropertyList(host2, [{ name: "gold", type: "number", default: "" }]);
    const row = host2.querySelector(".set-row")!;
    expect(row.getAttribute("data-name")).toBe("gold");
    expect(options(row.querySelector(".set-type")!)).toEqual(PROPERTY_TYPES.map(([, l]) => l));
    expect([...row.querySelectorAll(".shell-icon")].map((b) => b.getAttribute("aria-label"))).toEqual(["Move up", "Move down", "Delete property"]);
    expect([...row.querySelectorAll(".shell-fieldcap")].map((c) => c.textContent)).toEqual(["Purpose"]);
  });

  it("add appends a blank row and focuses its name", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const decls: { name: string; type: string; default?: string }[] = [{ name: "a", type: "string", default: "" }];
    const onChange = vi.fn();
    mountPropertyList(host, decls, { onChange });
    host.querySelector<HTMLButtonElement>(".set-add")?.click();
    expect(decls).toEqual([{ name: "a", type: "string", default: "" }, { name: "", type: "number", default: "" }]);
    const rows = host.querySelectorAll(".set-row");
    expect(rows.length).toBe(2);
    expect(document.activeElement).toBe(rows[1]!.querySelector("input.set-name"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("flags duplicate names and reports the first through firstInvalid", () => {
    const host = document.createElement("div");
    const decls = [{ name: "gold", type: "number", default: "" }, { name: "Gold", type: "string", default: "" }];
    const h = mountPropertyList(host, decls);
    const names = [...host.querySelectorAll<HTMLInputElement>("input.set-name")];
    expect(names.every((n) => n.classList.contains("invalid"))).toBe(true);
    expect(h.firstInvalid()).toBe(names[0]);
    expect(h.firstDuplicate()).toBe(names[0]);
    names[1]!.value = "silver"; names[1]!.dispatchEvent(new Event("input"));
    expect(h.firstDuplicate()).toBeNull();
    expect(decls[1]?.name).toBe("silver");
  });

  it("reports an illegal name through firstInvalid too", () => {
    const host = document.createElement("div");
    const h = mountPropertyList(host, [{ name: "ok", type: "number", default: "" }]);
    const name = host.querySelector<HTMLInputElement>("input.set-name")!;
    name.value = "9lives"; name.dispatchEvent(new Event("input"));
    expect(h.firstDuplicate()).toBeNull();
    expect(h.firstInvalid()).toBe(name);
  });

  it("switching type resets the default and the values / stages; values feed the default picker", () => {
    const host = document.createElement("div");
    const decls: { name: string; type: string; default?: string; values?: string[]; stages?: string[] }[] = [{ name: "a", type: "string", default: "x" }];
    mountPropertyList(host, decls);
    change(host.querySelector<HTMLSelectElement>(".set-type")!, "enum");
    expect(decls[0]).toEqual({ name: "a", type: "enum", default: "", values: [] });
    expect(host.querySelector(".shell-fieldcap")?.textContent).toBe("Values");
    const tagInput = host.querySelector<HTMLInputElement>(".shell-tag-input")!;
    tagInput.value = "red"; tagInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(decls[0]?.values).toEqual(["red"]);
    expect(options(host.querySelector(".set-default")!)).toEqual(["(none)", "red"]);
    change(host.querySelector<HTMLSelectElement>(".set-type")!, "quality");
    expect(decls[0]).toEqual({ name: "a", type: "quality", default: "", stages: [] });
    expect(host.querySelector(".shell-fieldcap")?.textContent).toBe("Stages (in order)");
  });

  it("reorders and removes, and hangs extras on the line and in the details", () => {
    const host = document.createElement("div");
    const decls = [{ name: "a", type: "number", default: "" }, { name: "b", type: "number", default: "" }];
    const extraLine = vi.fn(() => [document.createElement("span")]);
    const extraDetails = vi.fn(() => [document.createElement("label"), null]);
    mountPropertyList(host, decls, { extraLine, extraDetails, purpose: false, addLabel: "+ Field", emptyText: "No fields yet." });
    expect(extraLine).toHaveBeenCalledTimes(2);
    expect(host.querySelector(".set-add")?.textContent).toBe("+ Field");
    expect(host.querySelector(".set-details")?.children.length).toBe(1);
    const down = host.querySelectorAll<HTMLButtonElement>(".shell-icon")[1]!;
    down.click();
    expect(decls.map((d) => d.name)).toEqual(["b", "a"]);
    host.querySelectorAll<HTMLButtonElement>(".shell-icon.danger")[0]!.click();
    expect(decls.map((d) => d.name)).toEqual(["a"]);
    host.querySelector<HTMLButtonElement>(".shell-icon.danger")?.click();
    expect(host.querySelector(".empty")?.textContent).toBe("No fields yet.");
  });
});
