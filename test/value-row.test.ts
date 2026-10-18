// @vitest-environment jsdom
// Rows for every type an extension's fields add (value-rows.ts): a reference picked from the host's
// nodes, a record field by field, a map keyed by the host's nodes or by text, a list with ids and without, the
// toolkit's checks said under the right row, and parts that keep their element and focus across a redraw.

import { afterEach, describe, expect, it, vi } from "vitest";
import { valueRow, valueRows, type ValueAdapter, type ValueDecl } from "../src/value-rows.js";

afterEach(() => { document.body.replaceChildren(); });

const type = (field: HTMLInputElement | HTMLTextAreaElement, text: string): void => {
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
};
const pick = (sel: HTMLSelectElement, value: string): void => { sel.value = value; sel.dispatchEvent(new Event("change", { bubbles: true })); };
const flick = (): Promise<void> => new Promise((r) => queueMicrotask(r));
const buttons = (root: HTMLElement, label: string): HTMLButtonElement[] =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.getAttribute("aria-label") === label);

const adapter: ValueAdapter = {
  nodes: (kind) => (kind === "tag" ? [{ id: "v_docks", label: "docks" }, { id: "v_market", label: "market" }]
    : kind === "card" ? [{ id: "c_1", label: "bell" }] : []),
};

const cue: ValueDecl = { name: "cue", type: "record", help: "A sound.", fields: [
  { name: "sound", type: "text", required: true }, { name: "gain", type: "number", min: 0, max: 1 },
] };

describe("valueRow", () => {
  it("draws a scalar as the field row, with help as its purpose and the toolkit's range check", () => {
    const { el } = valueRow({ decl: { name: "weight", type: "number", max: 10, help: "How heavy." }, value: 11, onCommit: () => {} });
    expect(el.querySelector(".shell-fieldrow-purpose")?.textContent).toBe("How heavy.");
    expect(el.querySelector(".shell-fieldrow-problem")?.textContent).toContain("above the most it may be, 10");
  });

  it("picks a reference from the host's nodes, keeps a gone one visible, and clears to none", () => {
    const onCommit = vi.fn();
    const { el } = valueRow({ decl: { name: "next", type: "reference", to: "card" }, value: "c_gone", onCommit, adapter });
    const sel = el.querySelector("select")!;
    expect([...sel.options].map((o) => o.text)).toEqual(["default (none)", "bell", "c_gone (gone)"]);
    expect(el.querySelector(".shell-fieldrow-problem")?.textContent).toContain("does not exist");
    pick(sel, "c_1");
    expect(onCommit).toHaveBeenLastCalledWith("c_1");
    pick(sel, "");
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });

  it("edits a record field by field, says a required field is missing, and clears when emptied", () => {
    const onCommit = vi.fn();
    const { el } = valueRow({ decl: cue, value: { gain: 0.5 }, onCommit });
    const parts = el.querySelectorAll(".shell-valuerow-part");
    expect(parts).toHaveLength(2);
    expect(parts[0]!.querySelector(".shell-fieldrow-problem")?.textContent).toBe("Required.");
    type(parts[0]!.querySelector("input")!, "bell");
    expect(onCommit).toHaveBeenLastCalledWith({ gain: 0.5, sound: "bell" });
    type(parts[1]!.querySelector("input")!, "");
    expect(onCommit).toHaveBeenLastCalledWith({ sound: "bell" });
  });

  it("adds a map entry from the host's nodes with the value's default, edits it, and removes it", () => {
    const onCommit = vi.fn();
    const decl: ValueDecl = { name: "perf", type: "map", key: { type: "reference", to: "tag" }, of: { type: "enum", values: ["smile", "frown"] } };
    const handle = valueRow({ decl, value: { v_docks: "frown" }, onCommit, adapter });
    const add = handle.el.querySelector<HTMLSelectElement>("select.shell-valuerow-key")!;
    expect([...add.options].map((o) => o.text)).toEqual(["Add...", "market"]);
    pick(add, "v_market");
    expect(onCommit).toHaveBeenLastCalledWith({ v_docks: "frown", v_market: "smile" });
    const captions = [...handle.el.querySelectorAll(".shell-valuerow-part .shell-fieldrow-label")].map((c) => c.textContent);
    expect(captions).toEqual(["docks", "market"]);
    buttons(handle.el, "Remove docks")[0]!.click();
    expect(onCommit).toHaveBeenLastCalledWith({ v_market: "smile" });
  });

  it("adds a map entry by typed key when the key is text", () => {
    const onCommit = vi.fn();
    const { el } = valueRow({ decl: { name: "notes", type: "map", key: { type: "text" }, of: { type: "number" } }, value: undefined, onCommit });
    const input = el.querySelector<HTMLInputElement>("input.shell-valuerow-key")!;
    type(input, "speed");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onCommit).toHaveBeenLastCalledWith({ speed: 0 });
  });

  it("adds, moves and removes list items, giving a new item of an id list a fresh id", () => {
    const onCommit = vi.fn();
    const decl: ValueDecl = { name: "beats", type: "list", id: "id", of: { type: "record", fields: [{ name: "id", type: "text" }, { name: "at", type: "number" }] } };
    const value = [{ id: "b2", at: 3 }, { id: "b1", at: 1 }];
    const { el } = valueRow({ decl, value, onCommit });
    buttons(el, "Add")[0]!.click();
    expect(onCommit).toHaveBeenLastCalledWith([...value, { at: 0, id: "item-3" }]);
    buttons(el, "Move down")[0]!.click();
    expect(onCommit).toHaveBeenLastCalledWith([{ id: "b1", at: 1 }, { id: "b2", at: 3 }, { at: 0, id: "item-3" }]);
    buttons(el, "Remove")[0]!.click();
    expect(onCommit).toHaveBeenLastCalledWith([{ id: "b2", at: 3 }, { at: 0, id: "item-3" }]);
  });

  it("keeps one set of item controls per item across a redraw, however deep the item is", () => {
    const decl: ValueDecl = { name: "beats", type: "list", id: "id", of: { type: "record", fields: [{ name: "id", type: "text" }, { name: "at", type: "number" }] } };
    const handle = valueRow({ decl, value: [{ id: "b1", at: 1 }, { id: "b2", at: 2 }], onCommit: () => {} });
    handle.update({ decl, value: [{ id: "b1", at: 5 }, { id: "b2", at: 2 }], onCommit: () => {} });
    expect(buttons(handle.el, "Move up")).toHaveLength(2);
    expect(buttons(handle.el, "Remove")).toHaveLength(2);
  });

  it("is read-only without onCommit", () => {
    const { el } = valueRow({ decl: { name: "words", type: "list", of: { type: "text" } }, value: ["a"] });
    expect(buttons(el, "Add")).toHaveLength(0);
    expect(el.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);
  });
});

describe("valueRows across a redraw", () => {
  it("hands back the same elements, and the author typing in a record's part keeps their place", async () => {
    const rows = valueRows();
    const host = document.body.appendChild(document.createElement("div"));
    let value: Record<string, unknown> = { sound: "be" };
    const draw = (): void => {
      host.replaceChildren(rows.row("c_1:cue", { decl: cue, value, onCommit: (v) => { value = v as Record<string, unknown>; draw(); } }));
      rows.sweep();
    };
    draw();
    const first = host.firstElementChild;
    const input = host.querySelector<HTMLInputElement>("input")!;
    input.focus();
    input.setSelectionRange(2, 2);
    type(input, "bell");
    await flick(); await flick();
    expect(host.firstElementChild).toBe(first);
    expect(document.activeElement).toBe(host.querySelector("input"));
    expect(value).toEqual({ sound: "bell" });
  });
});
