// An extension's section folded to the fields a node sets: what counts as set (F1), the folded and open
// sections (F2, F3), the fold kept from node to node (F4), a cleared value's row kept until the node changes
// (F5), and a nested value set or not as a whole (F6).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { extensionFold, foldCaption, isSet, type FoldSectionOptions } from "../src/value-rows.js";
import type { ValueDecl } from "../src/value-rows.js";

afterEach(() => { document.body.replaceChildren(); });

const target: ValueDecl = { name: "target", type: "pick", from: [{ words: ["auto", "calm"] }] } as unknown as ValueDecl;
const hold: ValueDecl = { name: "hold", type: "boolean" };
const mood: ValueDecl = { name: "mood", type: "enum", values: ["neutral", "tense"] } as ValueDecl;
const beats: ValueDecl = { name: "beats", type: "number" };
const performance: ValueDecl = { name: "performance", type: "map", key: { type: "reference", to: "cast" }, of: { type: "record", fields: [{ name: "look", type: "text" }] } };
const camera: ValueDecl = { name: "camera", type: "record", fields: [{ name: "shot", type: "text" }, { name: "zoom", type: "number" }] };

describe("isSet", () => {
  it("is unset for nothing held and for each type's default", () => {
    expect(isSet(hold, undefined)).toBe(false);
    expect(isSet(hold, false)).toBe(false);
    expect(isSet(beats, 0)).toBe(false);
    expect(isSet(mood, "neutral")).toBe(false);   // an enum's first value, as Pattershot's style "auto"
    expect(isSet(target, "")).toBe(false);
    expect(isSet(performance, {})).toBe(false);
    expect(isSet({ name: "l", type: "list", of: { type: "text" } }, [])).toBe(false);
    expect(isSet(camera, {})).toBe(false);
    expect(isSet(camera, { shot: "", zoom: 0 })).toBe(false);
  });

  it("is set for anything else, compared deeply, and a declared default counts", () => {
    expect(isSet(hold, true)).toBe(true);
    expect(isSet(mood, "tense")).toBe(true);
    expect(isSet(target, "auto")).toBe(true);   // a pick's default is "", so a chosen word is set
    expect(isSet({ ...target, default: "auto" } as ValueDecl, "auto")).toBe(false);
    expect(isSet(performance, { c_ann: { look: "" } })).toBe(true);
    expect(isSet(camera, { zoom: 2 })).toBe(true);
    expect(isSet(camera, { shot: "", stray: 1 })).toBe(true);
  });
});

describe("the folded section", () => {
  const fields = [target, hold, { ...mood, group: "Feeling" } as ValueDecl, { ...beats, group: "Feeling" } as ValueDecl];
  const opts = (node: string, entry: Record<string, unknown> | undefined, extra: Partial<FoldSectionOptions> = {}): FoldSectionOptions => ({
    extension: "pattershot", caption: "Pattershot", node, fields, entry,
    row: (d) => { const r = document.createElement("div"); r.className = "row"; r.dataset["field"] = d.name; return r; },
    group: (g) => { const h = document.createElement("h4"); h.textContent = g; return h; },
    ...extra,
  });
  const shownOf = (sec: HTMLElement): string[] => [...sec.querySelectorAll<HTMLElement>(".row")].map((r) => r.dataset["field"]!);
  const headingsOf = (sec: HTMLElement): string[] => [...sec.querySelectorAll("h4")].map((h) => h.textContent ?? "");
  const capOf = (sec: HTMLElement): HTMLButtonElement => sec.querySelector<HTMLButtonElement>(".shell-fold-cap")!;

  it("folded, shows the caption alone with nothing set, and only the set fields with a count otherwise", () => {
    const fold = extensionFold();
    const empty = fold.section(opts("n1", { hold: false }));
    expect(shownOf(empty)).toEqual([]);
    expect(capOf(empty).textContent).toBe("Pattershot");
    expect(capOf(empty).getAttribute("aria-expanded")).toBe("false");
    const some = fold.section(opts("n2", { hold: true, beats: 3 }));
    expect(shownOf(some)).toEqual(["hold", "beats"]);
    expect(headingsOf(some)).toEqual(["Feeling"]);   // a group's heading only above a shown field of it
    expect(capOf(some).textContent).toBe("Pattershot (2 set)");
  });

  it("always shows the host's lead and tail", () => {
    const lead = document.createElement("p"); lead.textContent = "Locked by bob.";
    const tail = document.createElement("div"); tail.textContent = "stray";
    const sec = extensionFold().section(opts("n1", undefined, { lead: [lead], tail: [tail] }));
    expect(sec.textContent).toContain("Locked by bob.");
    expect(sec.textContent).toContain("stray");
  });

  it("opens to every field on a click, and stays open from node to node until folded again", () => {
    const fold = extensionFold();
    const sec = fold.section(opts("n1", { hold: true }));
    capOf(sec).click();
    expect(shownOf(sec)).toEqual(["target", "hold", "mood", "beats"]);
    expect(capOf(sec).getAttribute("aria-expanded")).toBe("true");
    expect(capOf(sec).textContent).toBe("Pattershot (1 set)");
    const next = fold.section(opts("n2", undefined));
    expect(shownOf(next)).toEqual(["target", "hold", "mood", "beats"]);
    capOf(next).click();
    expect(shownOf(next)).toEqual([]);
    expect(fold.section(opts("n3", { hold: true })).querySelectorAll(".row")).toHaveLength(1);
  });

  it("keeps a value cleared while folded on screen until the author leaves the node", () => {
    const fold = extensionFold();
    expect(shownOf(fold.section(opts("n1", { hold: true, beats: 3 })))).toEqual(["hold", "beats"]);
    fold.sweep();
    // The author clears beats; the host redraws the same node, and its scene beside it.
    expect(shownOf(fold.section(opts("n1", { hold: true })))).toEqual(["hold", "beats"]);
    fold.section(opts("scene", undefined));
    fold.sweep();
    // And sets mood: it joins.
    expect(shownOf(fold.section(opts("n1", { hold: true, mood: "tense" })))).toEqual(["hold", "mood", "beats"]);
    fold.sweep();
    // Another node, then back: only what is set.
    fold.section(opts("n2", undefined));
    fold.sweep();
    fold.sweep();
    expect(shownOf(fold.section(opts("n1", { hold: true })))).toEqual(["hold"]);
  });

  it("folds each extension on its own", () => {
    const fold = extensionFold();
    fold.setOpen("pattershot", true);
    expect(fold.isOpen("pattershot")).toBe(true);
    expect(fold.isOpen("other")).toBe(false);
    expect(shownOf(fold.section(opts("n1", undefined, { extension: "other" })))).toEqual([]);
  });

  it("words the caption one way", () => {
    expect(foldCaption("Pattershot", 0)).toBe("Pattershot");
    expect(foldCaption("Pattershot", 3)).toBe("Pattershot (3 set)");
  });
});
