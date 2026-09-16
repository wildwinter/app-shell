// stageChips (ordered chips with move controls) and wireReorder (HTML5
// drag-to-reorder), both lifted into dom.ts from the app that had the better one.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageChips, wireReorder } from "../src/dom.js";

afterEach(() => { document.body.replaceChildren(); });

const chipLabels = (w: HTMLElement): string[] =>
  [...w.querySelectorAll<HTMLElement>(".shell-tag")].map((c) => c.firstChild?.textContent ?? "");
const buttonsOf = (w: HTMLElement, stage: string): { earlier: HTMLButtonElement; later: HTMLButtonElement; remove: HTMLButtonElement } => {
  const chip = [...w.querySelectorAll<HTMLElement>(".shell-tag")].find((c) => c.dataset["stage"] === stage)!;
  const [earlier, later, remove] = chip.querySelectorAll<HTMLButtonElement>("button");
  return { earlier: earlier!, later: later!, remove: remove! };
};

describe("stageChips", () => {
  it("renders the stages numbered, in order", () => {
    const w = stageChips({ stages: ["seed", "sprout", "bloom"] });
    expect(chipLabels(w)).toEqual(["1. seed", "2. sprout", "3. bloom"]);
  });

  it("moves a stage earlier and later in place and reports the change", () => {
    const holder = { stages: ["seed", "sprout", "bloom"] };
    const onChange = vi.fn();
    const w = stageChips(holder, onChange);
    buttonsOf(w, "bloom").earlier.click();
    expect(holder.stages).toEqual(["seed", "bloom", "sprout"]);
    expect(chipLabels(w)).toEqual(["1. seed", "2. bloom", "3. sprout"]);
    buttonsOf(w, "seed").later.click();
    expect(holder.stages).toEqual(["bloom", "seed", "sprout"]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("disables the move that would leave the list, and never types an OS title", () => {
    const w = stageChips({ stages: ["a", "b"] });
    expect(buttonsOf(w, "a").earlier.disabled).toBe(true);
    expect(buttonsOf(w, "a").later.disabled).toBe(false);
    expect(buttonsOf(w, "b").later.disabled).toBe(true);
    expect(w.querySelector("[title]")).toBeNull();
    expect(buttonsOf(w, "a").later.dataset["tip"]).toBe("Move a later");
  });

  it("adds on Enter (blank and duplicate ignored) and removes by the chip's button", () => {
    const holder: { stages?: string[] } = {};
    const w = stageChips(holder);
    const input = w.querySelector<HTMLInputElement>(".shell-tag-input")!;
    expect(input.placeholder).toBe("Add stage");
    input.value = "one"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.value = "one"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.value = "  "; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.value = "two"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "," }));
    expect(holder.stages).toEqual(["one", "two"]);
    buttonsOf(w, "one").remove.click();
    expect(holder.stages).toEqual(["two"]);
    expect(chipLabels(w)).toEqual(["1. two"]);
  });
});

describe("wireReorder", () => {
  const list = (axis: "x" | "y", onMove: (id: string, before: boolean, target: string) => void): HTMLElement[] => {
    const host = document.createElement("div");
    document.body.append(host);
    return ["a", "b", "c"].map((id) => {
      const row = document.createElement("div");
      host.append(row);
      wireReorder(row, id, axis, onMove);
      return row;
    });
  };
  const rect = (el: HTMLElement, r: Partial<DOMRect>): void => {
    el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON() { return {}; }, ...r } as DOMRect);
  };
  const drag = (type: string, init: DragEventInit & { clientX?: number; clientY?: number }): Event => {
    // jsdom has no DragEvent constructor; a MouseEvent carries the coordinates.
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(e, "dataTransfer", { value: null });
    return e;
  };

  it("marks the row above its midpoint as drop-before and calls onMove(id, true, target)", () => {
    const onMove = vi.fn();
    const [a, , c] = list("y", onMove);
    rect(c!, { top: 100, bottom: 120, height: 20 });
    expect(a!.draggable).toBe(true);
    expect(a!.dataset["reorderId"]).toBe("a");
    a!.dispatchEvent(drag("dragstart", {}));
    expect(a!.classList.contains("dragging")).toBe(true);
    c!.dispatchEvent(drag("dragover", { clientY: 104 }));
    expect(c!.classList.contains("drop-before")).toBe(true);
    c!.dispatchEvent(drag("drop", {}));
    expect(onMove).toHaveBeenCalledWith("a", true, "c");
    expect(c!.classList.contains("drop-before")).toBe(false);
    a!.dispatchEvent(drag("dragend", {}));
    expect(a!.classList.contains("dragging")).toBe(false);
  });

  it("marks below the midpoint as drop-after, and on the x axis reads clientX", () => {
    const onMove = vi.fn();
    const [a, b] = list("x", onMove);
    rect(b!, { left: 200, right: 300, width: 100 });
    a!.dispatchEvent(drag("dragstart", {}));
    b!.dispatchEvent(drag("dragover", { clientX: 280 }));
    expect(b!.classList.contains("drop-after")).toBe(true);
    b!.dispatchEvent(drag("drop", {}));
    expect(onMove).toHaveBeenCalledWith("a", false, "b");
    a!.dispatchEvent(drag("dragend", {}));
  });

  it("ignores a drag over itself and a drop with nothing carried", () => {
    const onMove = vi.fn();
    const [a, b] = list("y", onMove);
    b!.dispatchEvent(drag("drop", {}));
    expect(onMove).not.toHaveBeenCalled();
    a!.dispatchEvent(drag("dragstart", {}));
    a!.dispatchEvent(drag("dragover", { clientY: 5 }));
    expect(a!.classList.contains("drop-before") || a!.classList.contains("drop-after")).toBe(false);
    a!.dispatchEvent(drag("dragend", {}));
  });
});
