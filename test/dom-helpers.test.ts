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

  // A stage is renamed in place: values are stored by stage NAME, so a rename
  // is the one edit that has to reach every value naming it, and the caller
  // that knows where those are is told which name became which.
  describe("rename", () => {
    const labelOf = (w: HTMLElement, stage: string): HTMLElement =>
      [...w.querySelectorAll<HTMLElement>(".shell-tag")].find((c) => c.dataset["stage"] === stage)!
        .querySelector<HTMLElement>(".shell-tag-label")!;
    const editTo = (w: HTMLElement, stage: string, text: string, key = "Enter"): void => {
      labelOf(w, stage).click();
      const input = w.querySelector<HTMLInputElement>(".shell-stage-rename")!;
      input.value = text;
      input.dispatchEvent(new KeyboardEvent("keydown", { key }));
    };

    it("offers a rename on the stage's name, with a tip and no OS title", () => {
      const w = stageChips({ stages: ["seed", "bloom"] });
      const label = labelOf(w, "seed");
      expect(label.dataset["tip"]).toBe("Rename seed");
      expect(label.getAttribute("role")).toBe("button");
      expect(w.querySelector("[title]")).toBeNull();
    });

    it("renames in place on Enter, keeping the position, and tells onRename rather than onChange", () => {
      const holder = { stages: ["seed", "sprout", "bloom"] };
      const onChange = vi.fn();
      const onRename = vi.fn();
      const w = stageChips(holder, onChange, { onRename });
      editTo(w, "sprout", " shoot ");
      expect(holder.stages).toEqual(["seed", "shoot", "bloom"]);
      expect(chipLabels(w)).toEqual(["1. seed", "2. shoot", "3. bloom"]);
      expect(onRename).toHaveBeenCalledWith("sprout", "shoot");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps an enclosing <label> from taking the click, which would close the rename at once", () => {
      const w = stageChips({ stages: ["seed", "bloom"] });
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      labelOf(w, "seed").dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(w.querySelector(".shell-stage-rename")).not.toBeNull();
    });

    it("without onRename a rename is an ordinary change", () => {
      const holder = { stages: ["seed", "bloom"] };
      const onChange = vi.fn();
      const w = stageChips(holder, onChange);
      editTo(w, "seed", "bud");
      expect(holder.stages).toEqual(["bud", "bloom"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("leaves the ladder alone on Escape, a blank name, the same name or another stage's name", () => {
      const holder = { stages: ["seed", "bloom"] };
      const onRename = vi.fn();
      const w = stageChips(holder, undefined, { onRename });
      editTo(w, "seed", "bud", "Escape");
      editTo(w, "seed", "  ");
      editTo(w, "seed", "seed");
      editTo(w, "seed", "bloom");
      expect(holder.stages).toEqual(["seed", "bloom"]);
      expect(chipLabels(w)).toEqual(["1. seed", "2. bloom"]);
      expect(onRename).not.toHaveBeenCalled();
      expect(w.querySelector(".shell-stage-rename")).toBeNull();
    });

    it("tells onReorder after a move, as well as onChange", () => {
      const onChange = vi.fn();
      const onReorder = vi.fn();
      const w = stageChips({ stages: ["a", "b"] }, onChange, { onReorder });
      buttonsOf(w, "a").later.click();
      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });
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
