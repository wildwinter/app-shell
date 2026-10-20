// ---------------------------------------------------------------------------
// A map whose values are records, edited as a grid (Pattershot's brief, "a map
// of records edited in a helper window", rulings H1 to H5, 2026-10-20).
// Pattershot's `performance` (a record of look, expression and gesture for
// each member of the cast on a line) drew a record of rows per character in the
// inspector's column: far too big. Such a field now shows in the inspector as a
// short summary, a line per key, and is edited in a helper window that follows
// the selection, as a grid: a row per key, a column per record field, each
// cell the row value-rows draws for that field.
//
// Which fields: any map of records (`isRecordMap`), with no manifest change.
// The window, its head and its messaging are each app's; the summary and the
// grid are here, so both apps draw them alike.
// ---------------------------------------------------------------------------

import { defaultOf, pickChoices } from "@wildwinter/toolkit/extensions";
import type { TypeDecl } from "@wildwinter/toolkit/extensions";
import { el, iconBtn } from "./dom.js";
import { fieldRowFocus } from "./value-control.js";
import { valueRow, type ValueAdapter, type ValueDecl, type ValueRowHandle } from "./value-rows.js";
import { isSet } from "./value-fold.js";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A map whose values are records: edited in the grid, summarised in the inspector. */
export function isRecordMap(decl: ValueDecl): boolean {
  return decl.type === "map" && decl.of?.type === "record";
}

/** A map key's name: a node's from the host, else the key itself. */
export function recordMapKeyLabel(decl: ValueDecl, key: string, adapter?: ValueAdapter): string {
  const kind = decl.key?.type === "reference" ? decl.key.to ?? "" : undefined;
  if (kind === undefined || !adapter) return key;
  return adapter.nodes(kind).find((n) => n.id === key)?.label ?? adapter.label?.(kind, key) ?? key;
}

/** A value as words, the way its control shows it: a pick's or a reference's name, flags joined, a boolean as
 *  the field's own name. Empty for a value that isn't set. */
export function valueText(decl: ValueDecl, value: unknown, adapter?: ValueAdapter): string {
  if (!isSet(decl, value)) return "";
  if (decl.type === "pick" && typeof value === "string") {
    const choice = pickChoices(decl as unknown as TypeDecl, {
      ...(adapter ? { nodes: (kind: string) => adapter.nodes(kind) } : {}),
      ...(adapter?.list ? { list: (name: string) => adapter.list!(name) } : {}),
    }).find((c) => c.value === value);
    return choice?.label ?? value;
  }
  if (decl.type === "reference" && typeof value === "string" && decl.to !== undefined && adapter) {
    return adapter.nodes(decl.to).find((n) => n.id === value)?.label ?? adapter.label?.(decl.to, value) ?? value;
  }
  if (decl.type === "boolean") return value === true ? decl.label ?? decl.name : "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (isObject(value)) return JSON.stringify(value);
  return String(value);
}

/** The inspector's summary of a map of records: a line per key, "TAM: smile, nod, WREN", the record's set
 *  fields in the manifest's order; a key with nothing set is its name alone. */
export function recordMapSummary(decl: ValueDecl, value: unknown, adapter?: ValueAdapter): string[] {
  if (!isObject(value)) return [];
  const fields = decl.of?.fields ?? [];
  return Object.entries(value).map(([key, record]) => {
    const name = recordMapKeyLabel(decl, key, adapter);
    const words = isObject(record) ? fields.map((f) => valueText(f, record[f.name], adapter)).filter((w) => w !== "") : [];
    return words.length > 0 ? `${name}: ${words.join(", ")}` : name;
  });
}

export interface RecordMapGridOptions {
  /** The map's declaration: `isRecordMap`. */
  decl: ValueDecl;
  /** The node's value, or undefined where it holds none. */
  value: unknown;
  /** The host's nodes, for a reference key and the cells' picks and references. */
  adapter?: ValueAdapter;
  /** Commit the whole map; undefined clears it. Absent: read-only. */
  onCommit?: (value: unknown) => void;
  disabled?: boolean;
  /** The class on each cell's control, as the host's own rows carry. */
  controlClassName?: string;
}

export interface RecordMapGrid {
  readonly el: HTMLElement;
  update(opts: RecordMapGridOptions): void;
}

/**
 * The grid: a row per key, a column per record field, each cell the row value-rows draws for that field (so
 * picks, their checks and their problems are the same as in the inspector), a remove button per row, and the
 * key adder under it. Keeps its cells across `update`, so a host that redraws on every change keeps the
 * author's place.
 */
export function recordMapGrid(initial: RecordMapGridOptions): RecordMapGrid {
  let opts = initial;
  const root = el("div", "shell-recordgrid");
  const table = el("table", "shell-recordgrid-table");
  const head = el("thead");
  const body = el("tbody");
  table.append(head, body);
  const adder = el("div", "shell-recordgrid-add");
  const empty = el("p", "shell-recordgrid-empty");
  root.append(table, empty, adder);
  const cells = new Map<string, ValueRowHandle>();
  let addKey = "";

  const editable = (): boolean => opts.onCommit !== undefined && opts.disabled !== true;
  const held = (): Record<string, unknown> => (isObject(opts.value) ? opts.value : {});
  const commit = (next: Record<string, unknown>): void => {
    const v = Object.keys(next).length > 0 ? next : undefined;
    opts = { ...opts, value: v };
    draw();
    opts.onCommit?.(v);
  };

  const cell = (key: string, field: ValueDecl, record: Record<string, unknown>): HTMLElement => {
    const id = `${key}\u0000${field.name}`;
    const o = {
      decl: field, value: record[field.name],
      ...(opts.adapter ? { adapter: opts.adapter } : {}),
      ...(opts.disabled !== undefined ? { disabled: opts.disabled } : {}),
      ...(opts.controlClassName !== undefined ? { controlClassName: opts.controlClassName } : {}),
      ...(editable() ? {
        onCommit: (v: unknown) => {
          const map = held();
          const rec: Record<string, unknown> = { ...(isObject(map[key]) ? map[key] as Record<string, unknown> : {}) };
          if (v === undefined) delete rec[field.name]; else rec[field.name] = v;
          commit({ ...map, [key]: rec });
        },
      } : {}),
      className: "shell-recordgrid-cell",
    };
    const had = cells.get(id);
    if (had && had.el.dataset["type"] === field.type) {
      fieldRowFocus.settle(had.el);
      had.update(o);
      fieldRowFocus.restore(had.el);
      return had.el;
    }
    const handle = valueRow(o);
    handle.el.dataset["type"] = field.type;
    cells.set(id, handle);
    return handle.el;
  };

  const draw = (): void => {
    const decl = opts.decl;
    const fields = decl.of?.fields ?? [];
    const map = held();
    const keys = Object.keys(map);
    const adapter = opts.adapter;
    const keyKind = decl.key?.type === "reference" ? decl.key.to ?? "" : undefined;
    const keyNodes = keyKind !== undefined && adapter ? adapter.nodes(keyKind) : undefined;

    const hr = el("tr");
    hr.append(el("th", "shell-recordgrid-keyhead", recordMapKeyHeading(decl)));
    for (const f of fields) {
      const th = el("th", undefined, f.label ?? f.name);
      const help = f.help ?? f.purpose;
      if (help) th.dataset["tip"] = help;
      hr.append(th);
    }
    hr.append(el("th", "shell-recordgrid-tools"));
    head.replaceChildren(hr);

    const used = new Set<string>();
    const rows: HTMLElement[] = [];
    for (const key of keys) {
      const record = isObject(map[key]) ? map[key] as Record<string, unknown> : {};
      const tr = el("tr");
      tr.dataset["key"] = key;
      const name = recordMapKeyLabel(decl, key, adapter);
      const keyCell = el("th", "shell-recordgrid-key", name);
      keyCell.setAttribute("scope", "row");
      if (keyNodes !== undefined && adapter && keyNodes.every((n) => n.id !== key) && adapter.label?.(keyKind!, key) === undefined) {
        keyCell.append(el("span", "shell-recordgrid-gone", " (not here any more)"));
      }
      tr.append(keyCell);
      for (const f of fields) {
        used.add(`${key}\u0000${f.name}`);
        const td = el("td");
        td.append(cell(key, f, record));
        tr.append(td);
      }
      const tools = el("td", "shell-recordgrid-tools");
      if (editable()) tools.append(iconBtn("close", `Remove ${name}`, () => { const next = { ...held() }; delete next[key]; commit(next); }));
      tr.append(tools);
      rows.push(tr);
    }
    for (const id of [...cells.keys()]) if (!used.has(id)) cells.delete(id);
    body.replaceChildren(...rows);
    table.hidden = keys.length === 0;
    empty.textContent = keys.length === 0 ? "None yet." : "";
    empty.hidden = keys.length !== 0;

    adder.replaceChildren();
    if (!editable()) return;
    const add = (k: string): void => {
      if (k === "" || Object.prototype.hasOwnProperty.call(held(), k)) return;
      commit({ ...held(), [k]: defaultOf(decl.of as unknown as TypeDecl) });
    };
    if (keyNodes !== undefined) {
      const pick = el("select", `field shell-valuerow-key${opts.controlClassName ? ` ${opts.controlClassName}` : ""}`);
      const first = el("option", undefined, "Add..."); first.value = ""; pick.append(first);
      for (const n of keyNodes.filter((n) => !Object.prototype.hasOwnProperty.call(map, n.id))) {
        const opt = el("option", undefined, n.label); opt.value = n.id; pick.append(opt);
      }
      pick.disabled = pick.options.length === 1;
      pick.addEventListener("change", () => add(pick.value));
      adder.append(pick);
    } else {
      const input = el("input", "field shell-valuerow-key");
      input.type = "text"; input.placeholder = "New key"; input.value = addKey;
      input.addEventListener("input", () => { addKey = input.value; });
      const go = (): void => { const k = input.value.trim(); addKey = ""; add(k); };
      input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") go(); });
      adder.append(input, iconBtn("add", "Add", go));
    }
  };

  draw();
  return { el: root, update: (o) => { opts = o; draw(); } };
}

/** The key column's heading: the key's node kind ("Cast"), else "Key". */
function recordMapKeyHeading(decl: ValueDecl): string {
  const to = decl.key?.type === "reference" ? decl.key.to : undefined;
  return to ? to.charAt(0).toUpperCase() + to.slice(1) : "Key";
}
