// A map's built-in entries (the manifest's `builtIn`, Pattershot's brief extension-section-closed-and-built-in-map-
// entries, D2 to D4): shown first with their names fixed; changed, the whole entry is the project's own; reset (or set
// back to built in) takes it out of the project's map; never removed; the adder refuses a built-in key.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mapEntries, recordMapGrid, recordMapSummary, valueRow, type ValueDecl } from "../src/value-rows.js";
import { setEntry } from "../src/map-entries.js";

afterEach(() => { document.body.replaceChildren(); });

const classes = {
  name: "relationshipClasses", type: "map", key: { type: "text" },
  of: { type: "record", fields: [
    { name: "gap", type: "number" },
    { name: "shot", type: "enum", values: ["full", "medium", "cu"] },
  ] },
  builtIn: { stranger: { gap: 2, shot: "full" }, friend: { gap: 0.5, shot: "medium" } },
} as unknown as ValueDecl;

const staging = {
  name: "staging", type: "map", key: { type: "text" },
  of: { type: "enum", values: ["full", "acting", "none"] },
  builtIn: { cinematic: "full", bark: "none" },
} as unknown as ValueDecl;

describe("mapEntries", () => {
  it("lists the built-in entries first, the project's own after, and a changed one in its built-in place", () => {
    expect(mapEntries(classes, { rival: { gap: 3, shot: "cu" }, friend: { gap: 0.8, shot: "medium" } })).toEqual([
      { key: "stranger", value: { gap: 2, shot: "full" }, builtIn: true, changed: false },
      { key: "friend", value: { gap: 0.8, shot: "medium" }, builtIn: true, changed: true },
      { key: "rival", value: { gap: 3, shot: "cu" }, builtIn: false, changed: false },
    ]);
    expect(mapEntries({ ...classes, builtIn: undefined } as ValueDecl, undefined)).toEqual([]);
  });

  it("takes a built-in entry set back to its built-in value out of the project's map", () => {
    expect(setEntry(staging, { cinematic: "acting" }, "cinematic", "full")).toBeUndefined();
    expect(setEntry(staging, undefined, "bark", "acting")).toEqual({ bark: "acting" });
    expect(setEntry(staging, undefined, "ambient", "none")).toEqual({ ambient: "none" });
  });

  it("summarises the built-in entries too", () => {
    // (A field at its default is left out, as the summary always does: "full" is the enum's first value.)
    expect(recordMapSummary(classes, { rival: { gap: 3 } })).toEqual(["stranger: 2", "friend: 0.5, medium", "rival: 3"]);
  });
});

describe("the record grid", () => {
  const tools = (root: HTMLElement, key: string): HTMLButtonElement[] =>
    [...root.querySelectorAll<HTMLButtonElement>(`tr[data-key="${key}"] .shell-recordgrid-tools button`)];

  it("draws each built-in entry with a reset, disabled until it's changed, and the project's own with a remove", () => {
    const g = recordMapGrid({ decl: classes, value: { friend: { gap: 0.8, shot: "medium" }, rival: { gap: 3, shot: "cu" } }, onCommit: () => {} });
    document.body.append(g.el);
    expect([...g.el.querySelectorAll<HTMLElement>("tbody tr")].map((r) => r.dataset["key"])).toEqual(["stranger", "friend", "rival"]);
    expect(tools(g.el, "stranger").map((b) => [b.dataset["tip"], b.disabled])).toEqual([["Reset stranger to built in", true]]);
    expect(tools(g.el, "friend").map((b) => [b.dataset["tip"], b.disabled])).toEqual([["Reset friend to built in", false]]);
    expect(tools(g.el, "rival").map((b) => b.dataset["tip"])).toEqual(["Remove rival"]);
    expect(g.el.querySelector('tr[data-key="stranger"]')!.classList.contains("shell-recordgrid-builtin")).toBe(true);
  });

  it("makes a changed built-in entry the project's own, whole, and a reset takes it back out", () => {
    const commits: unknown[] = [];
    const g = recordMapGrid({ decl: classes, value: undefined, onCommit: (v) => commits.push(v) });
    document.body.append(g.el);
    const shot = g.el.querySelector<HTMLSelectElement>('tr[data-key="stranger"] select')!;
    shot.value = "cu"; shot.dispatchEvent(new Event("change", { bubbles: true }));
    expect(commits.at(-1)).toEqual({ stranger: { gap: 2, shot: "cu" } });
    tools(g.el, "stranger")[0]!.click();
    expect(commits.at(-1)).toBeUndefined();
  });

  it("refuses a new key the extension has built in", () => {
    const commits: unknown[] = [];
    const g = recordMapGrid({ decl: classes, value: undefined, onCommit: (v) => commits.push(v) });
    document.body.append(g.el);
    const input = g.el.querySelector<HTMLInputElement>(".shell-recordgrid-add input")!;
    input.value = "friend"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(commits).toEqual([]);
    input.value = "rival"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(commits.at(-1)).toEqual({ rival: { gap: 0, shot: "full" } });
  });
});

describe("the stacked rows", () => {
  it("draws the built-in entries with a reset and no remove, and setting one back to built in resets it", () => {
    const commits: unknown[] = [];
    const row = valueRow({ decl: staging, value: { bark: "acting", ambient: "none" }, onCommit: (v) => commits.push(v) });
    document.body.append(row.el);
    const tips = [...row.el.querySelectorAll<HTMLButtonElement>(".shell-valuerow-controls button")].map((b) => [b.dataset["tip"], b.disabled]);
    expect(tips).toEqual([["Reset cinematic to built in", true], ["Reset bark to built in", false], ["Remove ambient", false]]);
    const selects = [...row.el.querySelectorAll<HTMLSelectElement>(".shell-valuerow-part select")];
    expect(selects.map((s) => s.value)).toEqual(["full", "acting", "none"]);
    selects[1]!.value = "none"; selects[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(commits.at(-1)).toEqual({ ambient: "none" });
  });
});
