// Field help as a tooltip, and lists and maps as tables (Pattershot's briefs field-help-as-a-tooltip and
// lists-and-maps-as-tables-in-settings, ruled by Ian 2026-11-10).
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { valueRow, type ValueAdapter, type ValueDecl } from "../src/value-rows.js";
import { fieldRow } from "../src/value-control.js";
import { recordListGrid } from "../src/record-map.js";

afterEach(() => { document.body.replaceChildren(); });
const adapter: ValueAdapter = { nodes: (kind) => (kind === "cast" ? [{ id: "TAM", label: "TAM" }, { id: "WREN", label: "WREN" }] : []) };
const caption = (row: HTMLElement): HTMLElement => row.querySelector(":scope > .shell-fieldrow-label") as HTMLElement;

describe("a field's help", () => {
  it("is the caption's rollover and the control's description, not a paragraph under the field", () => {
    const row = fieldRow({ decl: { name: "mood", type: "text", purpose: "How the scene feels." }, value: undefined, onCommit: () => {} }).el;
    document.body.append(row);
    const cap = caption(row);
    expect(cap.textContent).toBe("mood");                        // the "?" is drawn by the stylesheet
    expect(cap.classList.contains("has-help")).toBe(true);
    expect(cap.dataset["tip"]).toBe("How the scene feels.");
    const purpose = row.querySelector(".shell-fieldrow-purpose:not(.shell-fieldrow-valuehelp)") as HTMLElement;
    expect(purpose.classList.contains("shell-fieldrow-described")).toBe(true);
    const input = row.querySelector("input")!;
    expect(input.getAttribute("aria-describedby")).toContain(purpose.id);
  });

  it("leaves a field with no help unmarked", () => {
    const row = fieldRow({ decl: { name: "mood", type: "text" }, value: undefined }).el;
    expect(caption(row).classList.contains("has-help")).toBe(false);
    expect(caption(row).dataset["tip"]).toBeUndefined();
  });

  it("marks a pick's, a reference's, and a list's caption the same way, in the app's label class", () => {
    const decls: ValueDecl[] = [
      { name: "to", type: "pick", from: [{ words: ["all"] }], help: "Who hears it." },
      { name: "who", type: "reference", to: "cast", help: "A character." },
      { name: "moods", type: "list", of: { type: "text" }, help: "Moods to pick from." },
    ];
    for (const decl of decls) {
      const row = valueRow({ decl, value: undefined, adapter, onCommit: () => {}, labelClassName: "app-key" }).el;
      const cap = caption(row);
      expect(cap.classList.contains("app-key")).toBe(true);
      expect(cap.dataset["tip"]).toBe(decl.help);
      // Nothing visible under the field says it again.
      expect([...row.querySelectorAll(".shell-fieldrow-purpose:not(.shell-fieldrow-described):not([hidden])")].map((p) => p.textContent).filter(Boolean)).toEqual([]);
    }
  });
});

describe("lists and maps", () => {
  it("lays a list or a map of single values out as a table, and a record's fields as rows", () => {
    const list = valueRow({ decl: { name: "moods", type: "list", of: { type: "text" } }, value: ["calm", "tense"], onCommit: () => {} }).el;
    expect(list.querySelector(".shell-valuerow-parts")!.classList.contains("shell-valuerow-table")).toBe(true);
    // No numbers drawn: each item is named for a screen reader by the list and its place.
    expect([...list.querySelectorAll(".shell-valuerow-part > .shell-fieldrow > .shell-fieldrow-label")].map((l) => l.textContent)).toEqual(["moods, item 1", "moods, item 2"]);
    const map = valueRow({ decl: { name: "staging", type: "map", key: { type: "text" }, of: { type: "pick", from: [{ words: ["full", "none"] }] } }, value: { talk: "full" }, adapter, onCommit: () => {} }).el;
    expect(map.querySelector(".shell-valuerow-parts")!.classList.contains("shell-valuerow-table")).toBe(true);
    const record = valueRow({ decl: { name: "cue", type: "record", fields: [{ name: "gain", type: "number" }] }, value: {}, onCommit: () => {} }).el;
    expect(record.querySelector(".shell-valuerow-parts")!.classList.contains("shell-valuerow-table")).toBe(false);
  });

  const classes: ValueDecl = { name: "relationshipClasses", type: "map", key: { type: "text" },
    of: { type: "record", fields: [{ name: "distance", type: "number" }, { name: "shot", type: "pick", from: [{ words: ["two-shot", "wide"] }] }] } };
  const pairs: ValueDecl = { name: "pairs", type: "list",
    of: { type: "record", fields: [{ name: "a", type: "reference", to: "cast" }, { name: "b", type: "reference", to: "cast" }] } };

  it("draws a map or a list of records as a grid only when asked for tables", () => {
    const grid = valueRow({ decl: classes, value: { hostile: { distance: 4 } }, adapter, onCommit: () => {}, tables: true }).el;
    expect(grid.querySelector(".shell-recordgrid")).toBeTruthy();
    expect([...grid.querySelectorAll("thead th")].map((t) => t.textContent)).toEqual(["Key", "distance", "shot", ""]);
    const list = valueRow({ decl: pairs, value: [{ a: "TAM", b: "WREN" }], adapter, onCommit: () => {}, tables: true }).el;
    expect(list.querySelector(".shell-recordgrid-list")).toBeTruthy();
    const stacked = valueRow({ decl: classes, value: { hostile: {} }, adapter, onCommit: () => {} }).el;
    expect(stacked.querySelector(".shell-recordgrid")).toBeNull();
  });

  it("edits a list of records in its grid: a cell, a move, a removal, an addition", () => {
    const commits: unknown[] = [];
    const grid = recordListGrid({ decl: pairs, value: [{ a: "TAM" }, { a: "WREN" }], adapter, onCommit: (v) => commits.push(v) });
    document.body.append(grid.el);
    const rows = (): HTMLTableRowElement[] => [...grid.el.querySelectorAll("tbody tr")] as HTMLTableRowElement[];
    expect(rows().length).toBe(2);
    const sel = rows()[0]!.querySelectorAll("select")[1] as HTMLSelectElement;
    sel.value = "WREN"; sel.dispatchEvent(new Event("change"));
    expect(commits.at(-1)).toEqual([{ a: "TAM", b: "WREN" }, { a: "WREN" }]);
    (rows()[1]!.querySelector('[aria-label="Move up"]') as HTMLButtonElement).click();
    expect(commits.at(-1)).toEqual([{ a: "WREN" }, { a: "TAM", b: "WREN" }]);
    (rows()[0]!.querySelector('[aria-label="Remove"]') as HTMLButtonElement).click();
    expect(commits.at(-1)).toEqual([{ a: "TAM", b: "WREN" }]);
    (grid.el.querySelector(".shell-recordgrid-add button") as HTMLButtonElement).click();
    const added = commits.at(-1) as unknown[];
    expect(added.length).toBe(2);
    expect(added[0]).toEqual({ a: "TAM", b: "WREN" }); // the new item is the record's defaults, after the rest
  });
});
