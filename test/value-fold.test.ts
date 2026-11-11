// An extension's section folded to the fields a node sets: what counts as set (F1), the folded and open
// sections (F2, F3), the fold kept from node to node (F4), a cleared value's row kept until the node changes
// (F5), and a nested value set or not as a whole (F6).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { extensionFold, fieldGroups, foldCaption, isSet, type FoldSectionOptions, type GroupRowsOptions } from "../src/value-rows.js";
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

  it("folded, is its caption alone, with a count when anything is set (closed means closed)", () => {
    const fold = extensionFold();
    const empty = fold.section(opts("n1", { hold: false }));
    expect(shownOf(empty)).toEqual([]);
    expect(capOf(empty).textContent).toBe("Pattershot");
    expect(capOf(empty).getAttribute("aria-expanded")).toBe("false");
    const some = fold.section(opts("n2", { hold: true, beats: 3 }));
    expect(shownOf(some)).toEqual([]);
    expect(headingsOf(some)).toEqual([]);
    expect(capOf(some).textContent).toBe("Pattershot (2 set)");
  });

  it("always shows the host's lead; the tail only when open, and counted as set", () => {
    const lead = document.createElement("p"); lead.textContent = "Locked by bob.";
    const tail = document.createElement("div"); tail.textContent = "stray";
    const fold = extensionFold();
    const sec = fold.section(opts("n1", { hold: true }, { lead: [lead], tail: [tail] }));
    expect(sec.textContent).toContain("Locked by bob.");
    expect(sec.textContent).not.toContain("stray");
    expect(capOf(sec).textContent).toBe("Pattershot (2 set)");
    capOf(sec).click();
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
    expect(fold.section(opts("n3", { hold: true })).querySelectorAll(".row")).toHaveLength(0);
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
    expect(foldCaption("Pattershot", 2, 1)).toBe("Pattershot (2 set, 1 problem)");
    expect(foldCaption("Pattershot", 0, 2)).toBe("Pattershot (2 problems)");
  });

  // "You see what's attached, and Add offers the rest" (patterkit design/proposals/inspector-one-door.md).
  it("says a node has something to draw when it sets a value, has a problem, or the section is open", () => {
    const fold = extensionFold();
    const of = (entry: Record<string, unknown> | undefined, extra: Partial<FoldSectionOptions> = {}): boolean =>
      fold.drawn({ extension: "pattershot", kind: "line", fields, entry, ...extra });
    expect(of(undefined)).toBe(false);
    expect(of({ hold: false })).toBe(false);                    // a default isn't set
    expect(of({ hold: true })).toBe(true);
    expect(of(undefined, { tail: [document.createElement("div")] })).toBe(true);
    expect(of({}, { problems: ["Target is required."] })).toBe(true);
    fold.setOpen("pattershot", true, "line");
    expect(of(undefined)).toBe(true);
    expect(of(undefined, { kind: "block" })).toBe(false);
  });

  it("remembers open by extension and kind of node, so a line's leaves the block's closed", () => {
    const fold = extensionFold();
    const line = fold.section(opts("n1", { hold: true }, { kind: "line" }));
    capOf(line).click();
    expect(fold.isOpen("pattershot", "line")).toBe(true);
    expect(fold.isOpen("pattershot", "block")).toBe(false);
    expect(shownOf(fold.section(opts("n2", undefined, { kind: "line" }))).length).toBe(4);
    expect(shownOf(fold.section(opts("b1", { hold: true }, { kind: "block" })))).toEqual([]);
  });

  it("counts a closed section's problems on its caption and says the first as its rollover", () => {
    const fold = extensionFold();
    const sec = fold.section(opts("n1", { hold: true }, { problems: ["Target is required.", "Mood is not one of its values."] }));
    expect(capOf(sec).textContent).toBe("Pattershot (1 set, 2 problems)");
    expect(capOf(sec).classList.contains("has-problem")).toBe(true);
    expect(capOf(sec).dataset["tip"]).toBe("Target is required.\nShow the Pattershot fields");
    capOf(sec).click();
    expect(capOf(sec).dataset["tip"]).toBe("Hide the Pattershot fields");
    expect(fold.section(opts("n2", undefined)).querySelector(".has-problem")).toBeNull();
  });

  it("tells the host when the caption opens or closes it", () => {
    const seen: boolean[] = [];
    const sec = extensionFold().section(opts("n1", undefined, { onToggle: (on) => seen.push(on) }));
    capOf(sec).click(); capOf(sec).click();
    expect(seen).toEqual([true, false]);
  });
});

// A group that starts closed (the manifest's `groups`, Pattershot's brief extension-closed-field-groups): its
// heading a disclosure counting what's set, with only the set fields under it, until opened.
describe("closed groups", () => {
  const style: ValueDecl = { name: "style", type: "text", group: "More" } as ValueDecl;
  const lens: ValueDecl = { name: "lens", type: "number", group: "More" } as ValueDecl;
  const fields = [target, { ...mood, group: "Feeling" } as ValueDecl, style, lens];
  const row = (d: ValueDecl): HTMLElement => { const r = document.createElement("div"); r.className = "row"; r.dataset["field"] = d.name; return r; };
  const group = (g: string): HTMLElement => { const h = document.createElement("h4"); h.textContent = g; return h; };
  const closed = (g: string): boolean => g === "More";
  const opts = (node: string, entry: Record<string, unknown> | undefined, extra: Partial<GroupRowsOptions> = {}): GroupRowsOptions =>
    ({ extension: "pattershot", node, fields, entry, row, group, closed, ...extra });
  const holder = (els: HTMLElement[]): HTMLElement => { const d = document.createElement("div"); d.append(...els); document.body.append(d); return d; };
  const shownOf = (h: HTMLElement): string[] => [...h.querySelectorAll<HTMLElement>(".row")].map((r) => r.dataset["field"]!);
  const capOf = (h: HTMLElement): HTMLButtonElement => h.querySelector<HTMLButtonElement>(".shell-group-cap")!;

  it("draws a closed group as its heading with a disclosure, and an open one as a plain heading", () => {
    const h = holder(fieldGroups().rows(opts("n1", undefined)));
    expect(shownOf(h)).toEqual(["target", "mood"]);
    expect([...h.querySelectorAll("h4")].map((x) => x.textContent)).toEqual(["Feeling", "More"]);
    expect(h.querySelectorAll(".shell-group-cap")).toHaveLength(1);
    expect(capOf(h).getAttribute("aria-expanded")).toBe("false");
    expect(capOf(h).closest("h4")?.classList.contains("shell-group")).toBe(true);
  });

  it("draws a field set here above the group's heading, so closed the group is its heading alone", () => {
    const h = holder(fieldGroups().rows(opts("n1", { lens: 35 })));
    expect(capOf(h).textContent).toBe("More");
    expect(shownOf(h)).toEqual(["target", "mood", "lens"]);
    // lens is before the heading, not under it.
    const lens = h.querySelector<HTMLElement>('[data-field="lens"]')!;
    const heading = capOf(h).closest("h4")!;
    expect(lens.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Opening reveals exactly what was hidden: the fields at their defaults.
    capOf(h).click();
    expect(shownOf(h)).toEqual(["target", "mood", "lens", "style"]);
  });

  it("moves nothing while a field is edited, and settles when the group closes", () => {
    const groups = fieldGroups();
    groups.setOpen("pattershot", "More", true);
    // Set inside the open group: it stays there across the host's redraws.
    expect(shownOf(holder(groups.rows(opts("n1", undefined))))).toEqual(["target", "mood", "style", "lens"]);
    expect(shownOf(holder(groups.rows(opts("n1", { style: "wide" }))))).toEqual(["target", "mood", "style", "lens"]);
    // Closed, it settles: style is above the heading now.
    groups.setOpen("pattershot", "More", false);
    const h = holder(groups.rows(opts("n1", { style: "wide" })));
    expect(shownOf(h)).toEqual(["target", "mood", "style"]);
  });

  it("draws no heading for a group whose every field is set", () => {
    const h = holder(fieldGroups().rows(opts("n1", { style: "wide", lens: 35 })));
    expect(shownOf(h)).toEqual(["target", "mood", "style", "lens"]);
    expect(capOf(h).closest("h4")!.hidden).toBe(true);
  });

  it("opens to every field on a click, and stays open from node to node and per extension", () => {
    const groups = fieldGroups();
    const h = holder(groups.rows(opts("n1", undefined)));
    capOf(h).click();
    expect(shownOf(h)).toEqual(["target", "mood", "style", "lens"]);
    expect(capOf(h).getAttribute("aria-expanded")).toBe("true");
    expect(groups.isOpen("pattershot", "More")).toBe(true);
    expect(shownOf(holder(groups.rows(opts("n2", undefined))))).toEqual(["target", "mood", "style", "lens"]);
    expect(shownOf(holder(groups.rows(opts("n2", undefined, { extension: "other" }))))).toEqual(["target", "mood"]);
  });

  it("keeps a value cleared above the heading there until the author leaves the node", () => {
    const groups = fieldGroups();
    expect(shownOf(holder(groups.rows(opts("n1", { style: "wide" }))))).toEqual(["target", "mood", "style"]);
    groups.sweep();
    expect(shownOf(holder(groups.rows(opts("n1", {}))))).toEqual(["target", "mood", "style"]);
    groups.sweep();
    groups.rows(opts("n2", undefined));
    groups.sweep();
    groups.sweep();
    expect(shownOf(holder(groups.rows(opts("n1", {}))))).toEqual(["target", "mood"]);
  });

  it("is plain headings when nothing is closed", () => {
    const h = holder(fieldGroups().rows(opts("n1", undefined, { closed: undefined })));
    expect(shownOf(h)).toEqual(["target", "mood", "style", "lens"]);
    expect(h.querySelectorAll(".shell-group-cap")).toHaveLength(0);
  });

  it("applies within an open section, and not while it's folded", () => {
    const fold = extensionFold();
    const sec = (entry: Record<string, unknown> | undefined): HTMLElement => holder([fold.section({
      extension: "pattershot", caption: "Pattershot", node: "n1", fields, entry, row, group, closed,
    })]);
    const folded = sec({ lens: 35 });
    expect(shownOf(folded)).toEqual([]);
    expect(folded.querySelectorAll(".shell-group-cap")).toHaveLength(0);
    fold.setOpen("pattershot", true);
    const open = sec({ lens: 35 });
    expect(shownOf(open)).toEqual(["target", "mood", "lens"]);
    expect(capOf(open).textContent).toBe("More");
    expect(fold.groups.isOpen("pattershot", "More")).toBe(false);
  });
});
