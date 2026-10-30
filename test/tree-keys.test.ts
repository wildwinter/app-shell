// The tree pattern's keys (tree-keys.ts): one tab stop, the arrows between rows, Right and Left to open,
// close, step in, and step out. Lifted from Storyletter's navigator for Patterpad's scene folders.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { rove, treeKey, treeRows, wireTreeKeys } from "../src/tree-keys.js";

afterEach(() => { document.body.replaceChildren(); });

/** A drawn tree: each entry [key, level, expanded?]. */
function drawTree(rows: [string, number, boolean?][]): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("role", "tree");
  for (const [key, level, expanded] of rows) {
    const b = document.createElement("button");
    b.setAttribute("role", "treeitem");
    b.setAttribute("aria-level", String(level));
    if (expanded !== undefined) b.setAttribute("aria-expanded", String(expanded));
    b.dataset["navKey"] = key;
    b.tabIndex = -1;
    host.append(b);
  }
  document.body.append(host);
  return host;
}
const row = (host: HTMLElement, key: string): HTMLElement => host.querySelector<HTMLElement>(`[data-nav-key="${key}"]`)!;

describe("treeKey", () => {
  const host = (): HTMLElement => drawTree([["act1", 1, true], ["docks", 2], ["act2", 1, false], ["end", 1]]);

  it("steps up and down, and goes to the ends", () => {
    const h = host(), rows = treeRows(h);
    expect(treeKey(rows, row(h, "act1"), "ArrowDown")).toBe(row(h, "docks"));
    expect(treeKey(rows, row(h, "act1"), "ArrowUp")).toBe(row(h, "act1"));
    expect(treeKey(rows, row(h, "docks"), "End")).toBe(row(h, "end"));
    expect(treeKey(rows, row(h, "end"), "Home")).toBe(row(h, "act1"));
  });

  it("Right opens a closed row or steps into an open one; Left closes or steps out", () => {
    const h = host(), rows = treeRows(h);
    expect(treeKey(rows, row(h, "act2"), "ArrowRight")).toBe("toggle");
    expect(treeKey(rows, row(h, "act1"), "ArrowRight")).toBe(row(h, "docks"));
    expect(treeKey(rows, row(h, "act1"), "ArrowLeft")).toBe("toggle");
    expect(treeKey(rows, row(h, "docks"), "ArrowLeft")).toBe(row(h, "act1"));
    expect(treeKey(rows, row(h, "docks"), "Enter")).toBeUndefined();
  });
});

describe("wireTreeKeys and rove", () => {
  it("keeps one tab stop and moves the focus with the arrows", () => {
    const h = drawTree([["a", 1], ["b", 1]]);
    rove(h, row(h, "a"), true);
    expect(row(h, "a").tabIndex).toBe(0);
    wireTreeKeys(h, () => {});
    row(h, "a").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(row(h, "b"));
    expect(row(h, "a").tabIndex).toBe(-1);
    expect(row(h, "b").tabIndex).toBe(0);
  });

  it("hands a toggle to the caller, and leaves modified keys alone", () => {
    const h = drawTree([["f", 1, false], ["x", 1]]);
    const toggle = vi.fn((r: HTMLElement) => r.setAttribute("aria-expanded", "true"));
    wireTreeKeys(h, toggle);
    row(h, "f").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(toggle).toHaveBeenCalledOnce();
    row(h, "f").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", metaKey: true, bubbles: true }));
    expect(document.activeElement).not.toBe(row(h, "x"));
  });
});
