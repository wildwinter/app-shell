// A map of records: which fields count (H2), the inspector's summary (H3), and the grid the helper window draws
// (H4): a row per key and a column per record field, picks in the cells, the key adder and a remove per row,
// each edit committing the whole map, and the cells kept across updates.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isRecordMap, recordMapGrid, recordMapSummary, valueText, type ValueAdapter, type ValueDecl } from "../src/value-rows.js";

afterEach(() => { document.body.replaceChildren(); });

const performance = {
  name: "performance", type: "map", key: { type: "reference", to: "cast" },
  of: { type: "record", fields: [
    { name: "look", type: "pick", from: [{ to: "cast" }, { words: ["down", "away"] }], help: "Where they look." },
    { name: "expression", type: "pick", from: [{ words: ["smile", "frown"] }] },
    { name: "gesture", type: "pick", from: [{ words: ["nod", "shrug"] }] },
  ] },
} as unknown as ValueDecl;

const adapter: ValueAdapter = {
  nodes: (kind) => (kind === "cast" ? [{ id: "TAM", label: "TAM" }, { id: "WREN", label: "WREN" }, { id: "OLD", label: "OLD" }] : []),
};

describe("which maps", () => {
  it("is a map whose values are records, and nothing else", () => {
    expect(isRecordMap(performance)).toBe(true);
    expect(isRecordMap({ name: "m", type: "map", key: { type: "text" }, of: { type: "text" } } as ValueDecl)).toBe(false);
    expect(isRecordMap({ name: "r", type: "record", fields: [] } as ValueDecl)).toBe(false);
  });
});

describe("the summary", () => {
  it("is a line per key, the record's set values in field order, a key with nothing set alone", () => {
    expect(recordMapSummary(performance, { TAM: { expression: "smile", gesture: "nod", look: "WREN" }, OLD: {} }, adapter))
      .toEqual(["TAM: WREN, smile, nod", "OLD"]);
    expect(recordMapSummary(performance, undefined, adapter)).toEqual([]);
  });

  it("words a value as its control shows it", () => {
    expect(valueText({ name: "hold", type: "boolean", label: "Hold" } as ValueDecl, true)).toBe("Hold");
    expect(valueText({ name: "hold", type: "boolean" } as ValueDecl, false)).toBe("");
    expect(valueText({ name: "n", type: "number" } as ValueDecl, 3)).toBe("3");
    expect(valueText({ name: "who", type: "reference", to: "cast" } as ValueDecl, "WREN", adapter)).toBe("WREN");
  });
});

describe("the grid", () => {
  const keysOf = (g: HTMLElement): string[] => [...g.querySelectorAll<HTMLElement>("tbody tr")].map((r) => r.dataset["key"]!);
  const headsOf = (g: HTMLElement): string[] => [...g.querySelectorAll("thead th")].map((t) => t.textContent ?? "").filter((t) => t !== "");

  it("draws a row per key and a column per field, each cell the field's pick", () => {
    const grid = recordMapGrid({ decl: performance, value: { TAM: { expression: "smile" }, WREN: {} }, adapter, onCommit: () => {} });
    expect(headsOf(grid.el)).toEqual(["Cast", "look", "expression", "gesture"]);
    expect(keysOf(grid.el)).toEqual(["TAM", "WREN"]);
    const tam = grid.el.querySelector<HTMLElement>('tr[data-key="TAM"]')!;
    expect([...tam.querySelectorAll("select")].map((s) => s.value)).toEqual(["", "smile", ""]);
    expect(grid.el.querySelector<HTMLElement>("thead th[data-tip]")?.dataset["tip"]).toBe("Where they look.");
  });

  it("commits the whole map on a cell's change, and a removal, and an added key with the record's default", () => {
    const seen: unknown[] = [];
    const grid = recordMapGrid({ decl: performance, value: { TAM: { expression: "smile" } }, adapter, onCommit: (v) => seen.push(v) });
    document.body.append(grid.el);
    const gesture = grid.el.querySelectorAll<HTMLSelectElement>('tr[data-key="TAM"] select')[2]!;
    gesture.value = "nod";
    gesture.dispatchEvent(new Event("change", { bubbles: true }));
    expect(seen.pop()).toEqual({ TAM: { expression: "smile", gesture: "nod" } });
    const adder = grid.el.querySelector<HTMLSelectElement>(".shell-recordgrid-add select")!;
    expect([...adder.options].map((o) => o.textContent)).toEqual(["Add...", "WREN", "OLD"]);
    adder.value = "WREN";
    adder.dispatchEvent(new Event("change", { bubbles: true }));
    expect(seen.pop()).toEqual({ TAM: { expression: "smile", gesture: "nod" }, WREN: { look: "", expression: "", gesture: "" } });
    grid.el.querySelector<HTMLButtonElement>('tr[data-key="TAM"] .shell-recordgrid-tools button')!.click();
    expect(seen.pop()).toEqual({ WREN: { look: "", expression: "", gesture: "" } });
    grid.el.querySelector<HTMLButtonElement>('tr[data-key="WREN"] .shell-recordgrid-tools button')!.click();
    expect(seen.pop()).toBeUndefined();
    expect(grid.el.querySelector(".shell-recordgrid-empty")?.textContent).toBe("None yet.");
  });

  it("keeps a cell's element across updates, and is read-only without a commit", () => {
    const grid = recordMapGrid({ decl: performance, value: { TAM: {} }, adapter, onCommit: () => {} });
    const before = grid.el.querySelector('tr[data-key="TAM"] select');
    grid.update({ decl: performance, value: { TAM: { look: "down" } }, adapter, onCommit: () => {} });
    expect(grid.el.querySelector('tr[data-key="TAM"] select')).toBe(before);
    grid.update({ decl: performance, value: { TAM: {} }, adapter });
    expect(grid.el.querySelector(".shell-recordgrid-add")?.childElementCount).toBe(0);
    expect(grid.el.querySelector<HTMLSelectElement>('tr[data-key="TAM"] select')?.disabled).toBe(true);
  });

  it("says a cell's problem on the cell, and marks a key the host no longer has", () => {
    const grid = recordMapGrid({ decl: performance, value: { GONE: { expression: "glare" } }, adapter, onCommit: () => {} });
    expect(grid.el.querySelector('tr[data-key="GONE"] .shell-recordgrid-key')?.textContent).toContain("not here any more");
    expect(grid.el.querySelector('tr[data-key="GONE"] .has-problem')).not.toBeNull();
  });
});
