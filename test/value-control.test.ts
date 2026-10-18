// @vitest-environment jsdom
// The quality's value control (value-control.ts): the ladder with the current rung marked, the unset state
// naming its fallback, a stray value shown for what it is, and the reorder note's one wording.

import { describe, expect, it, vi } from "vitest";
import { defaultLabel, fallbackText, rungStrip, stageGateNote } from "../src/value-control.js";

const rungs = (strip: HTMLElement): string[] => [...strip.querySelectorAll(".shell-rung")].map((r) => r.textContent ?? "");
const marked = (strip: HTMLElement, cls: string): string[] => [...strip.querySelectorAll(`.shell-rung.${cls}`)].map((r) => r.textContent ?? "");
const STAGES = ["arrival", "act-1", "act-2"];

describe("rungStrip", () => {
  it("draws the ladder in order with the current stage marked, and picks another", () => {
    const onPick = vi.fn();
    const strip = rungStrip({ stages: STAGES, value: "act-1", onPick });
    expect(rungs(strip)).toEqual(STAGES);
    expect(marked(strip, "on")).toEqual(["act-1"]);
    (strip.querySelectorAll("button")[2] as HTMLButtonElement).click();
    expect(onPick).toHaveBeenCalledWith("act-2");
    (strip.querySelectorAll("button")[1] as HTMLButtonElement).click();
    expect(onPick).toHaveBeenCalledTimes(1);   // the current stage is not picked again
  });

  it("unset, marks the stage it falls back to and leads with default (x), which clears", () => {
    const onClear = vi.fn();
    const strip = rungStrip({ stages: STAGES, value: undefined, decl: { type: "quality", stages: STAGES, default: "act-1" }, onPick: vi.fn(), onClear });
    expect(rungs(strip)).toEqual(["default (act-1)", ...STAGES]);
    expect(marked(strip, "on")).toEqual(["default (act-1)"]);
    expect(marked(strip, "fallback")).toEqual(["act-1"]);
    const set = rungStrip({ stages: STAGES, value: "act-2", onPick: vi.fn(), onClear });
    (set.querySelector(".shell-rung-default") as HTMLButtonElement).click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows a value that is no longer a stage after the ladder, until a rung is picked", () => {
    const strip = rungStrip({ stages: STAGES, value: "finale", onPick: vi.fn() });
    expect(rungs(strip)).toEqual([...STAGES, "finale"]);
    expect(marked(strip, "stray")).toEqual(["finale"]);
  });

  it("is read-only without onPick", () => {
    const strip = rungStrip({ stages: STAGES, value: "arrival" });
    expect(strip.querySelectorAll("button")).toHaveLength(0);
    expect(marked(strip, "on")).toEqual(["arrival"]);
  });
});

describe("what an unset value falls back to", () => {
  it("is the declaration's own default, else its type's", () => {
    expect(fallbackText({ type: "boolean" })).toBe("False");
    expect(fallbackText({ type: "number" })).toBe("0");
    expect(fallbackText({ type: "enum", values: ["red", "blue"] })).toBe("red");
    expect(fallbackText({ type: "quality", stages: STAGES })).toBe("arrival");
    expect(fallbackText({ type: "flags" })).toBe("none");
    expect(fallbackText({ type: "text" })).toBe("empty");
    expect(fallbackText({ type: "enum", values: ["red", "blue"], default: "blue" })).toBe("blue");
    expect(fallbackText({ type: "enum", values: ["red"], default: "" })).toBe("none");
    expect(defaultLabel({ type: "boolean", default: true })).toBe("default (True)");
  });
});

describe("stageGateNote", () => {
  it("says how many gates a reorder changes the meaning of, and nothing for none", () => {
    expect(stageGateNote(0)).toBe("");
    expect(stageGateNote(1)).toBe("1 gate compares against this ladder, and it now reads the new order.");
    expect(stageGateNote(3)).toBe("3 gates compare against this ladder, and each now reads the new order.");
  });
});

describe("rungStrip in a document of its own", () => {
  it("builds in the given document, with plain rollovers", () => {
    const doc = document.implementation.createHTMLDocument("frame");
    const strip = rungStrip({ stages: STAGES, value: "act-1", onPick: vi.fn(), doc });
    expect(strip.ownerDocument).toBe(doc);
    expect(rungs(strip)).toEqual(STAGES);
    expect((strip.querySelectorAll("button")[0] as HTMLButtonElement).title).toBe('Set to "arrival"');
    expect((strip.querySelectorAll("button")[0] as HTMLButtonElement).type).toBe("button");
  });
});
