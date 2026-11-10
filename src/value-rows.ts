// ---------------------------------------------------------------------------
// Rows for a value of ANY declared type: the seven scalars through the field
// row, and the types an extension's fields add (patterkit design/proposals/
// patter-storylet-extensions.md, "Tier 1: fields"): a `reference` to one of the
// host's nodes, a `pick` of one choice from the sources its manifest names, a
// `record` of named fields, a `map` keyed by a reference or by text, and a `list`
// with ids or without.
//
// A structured value is drawn as its parts, each part a row of its own, so the
// family's field rules hold all the way down: commit as typed, Escape restores,
// the unset state names what it falls back to, a value the declaration refuses
// is said under it, and a row keeps its element (and its focus) across a redraw.
// The checks are `@wildwinter/toolkit/extensions`' (`valueProblems`), the same
// ones the command lines run, so the editor and validation never disagree.
//
// The host supplies what only it knows through an adapter: which nodes there are
// of a kind (a map keyed by tag offers the tags, a reference to a card the
// cards), and the lists of text on the extension's project node a pick offers.
// No Electron, no app state: DOM only.
//
// Its own entry (`@wildwinter/app-shell/value-rows`) rather than part of
// value-control, because it needs `@wildwinter/toolkit/extensions` (an optional
// peer, toolkit 0.2.5 or later) and the scalar row does not: a host that draws
// only the family's seven types takes nothing new.
// ---------------------------------------------------------------------------

import { defaultOf, pickChoices, valueProblems } from "@wildwinter/toolkit/extensions";
import type { PickSource, TypeDecl, ValueContext } from "@wildwinter/toolkit/extensions";
import { el, iconBtn, moveItem } from "./dom.js";
import { fieldRow, fieldRowFocus, valueHelpText } from "./value-control.js";
import { captionHelp, helpOnKeyboardFocus, helpText } from "./field-help.js";
import { suggestBox } from "./suggest-box.js";
import { isRecordMap, recordMapGrid, recordListGrid, isRecordList } from "./record-map.js";
import type { RecordMapGrid } from "./record-map.js";
import type { FieldDeclLike, FieldRowHandle, FieldValue } from "./value-control.js";

/** A declaration of any type, as an extension's manifest writes it. */
export interface ValueDecl extends FieldDeclLike {
  /** The caption; the name when absent. */
  label?: string;
  /** A sentence or two about the field (an extension's `help`, a field's `purpose`): the caption's "?" and the
   *  control's description, shown on hover and on keyboard focus. */
  help?: string;
  /** A reference's node kind. */
  to?: string;
  /** A pick's sources, in the order its choices are shown: fixed words, a node kind, a project list. */
  from?: readonly PickSource[];
  /** A record's fields. */
  fields?: ValueDecl[];
  /** A map's key: text, or a reference to a node kind. */
  key?: { type: string; to?: string };
  /** A map's or a list's value type. */
  of?: Omit<ValueDecl, "name"> & { name?: string };
  /** A list's id field: the text field of its records that keys each item. */
  id?: string;
  min?: number;
  max?: number;
  required?: boolean;
}

/** One node the host offers, by id, with the name the author knows it by. */
export interface ValueNode { id: string; label: string }

/** What only the host knows: the nodes of a kind (`card`, `tag`, `cast`...), for references, map keys and picks,
 *  and the lists of text on the extension's own project node, for picks. */
export interface ValueAdapter {
  nodes(kind: string): readonly ValueNode[];
  /**
   * The entries of a list of text on the extension's own project node, by field name, for a pick's `list` source
   * (the toolkit's `pickLists` reads them off the project entry). A host scopes it to the extension whose rows it
   * draws. Absent: a pick offers no list entries, and doesn't check against them.
   */
  list?(name: string): readonly string[] | undefined;
  /**
   * The name of a node by kind and id, for a value that holds one `nodes` does not offer (a node outside the
   * choices, say): undefined when there is no such node, which is then shown as gone. Absent: a held id `nodes`
   * does not list is taken to be gone.
   */
  label?(kind: string, id: string): string | undefined;
  /**
   * A pool's values, in the order to offer them (the toolkit's `poolValues`: the commonest first), for a pick's
   * `pool` source. A host scopes it to the extension whose rows it draws. Absent: a pool pick suggests only its
   * other sources' choices, and still takes any text.
   */
  pool?(name: string): readonly string[] | undefined;
}

/** A node's name: from the choices, else the host's `label`; undefined when the host says there is none. */
function nodeLabel(adapter: ValueAdapter, kind: string, id: string): string | undefined {
  return adapter.nodes(kind).find((n) => n.id === id)?.label ?? adapter.label?.(kind, id);
}

export interface ValueRowOptions {
  decl: ValueDecl;
  /** The node's own value, or undefined where it sets none. */
  value: unknown;
  /** Commit a value; undefined clears it, back to the default. Absent: read-only. */
  onCommit?: (value: unknown) => void;
  /** The host's nodes, for references and map keys. Absent: a reference is typed as an id. */
  adapter?: ValueAdapter;
  disabled?: boolean;
  /** A message of the app's own about this value, shown under it. */
  problem?: string;
  /** The app's own sentence instead of the row's own checks, as the field row's `replaceProblem`. */
  replaceProblem?: string;
  /** The caption; default the declaration's label, else its name. */
  label?: string | Node;
  className?: string;
  labelClassName?: string;
  controlClassName?: string;
  /** Lay a map or a list of records out as a table, a column per field, as Project Settings has room for; else
   *  each record is stacked rows, as a narrow inspector wants. */
  tables?: boolean;
}

export interface ValueRowHandle {
  readonly el: HTMLElement;
  update(opts: ValueRowOptions): void;
}

const SCALARS = new Set(["text", "multiline", "number", "boolean", "enum", "flags", "quality", "string"]);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nameOf = (decl: ValueDecl): string => decl.label ?? decl.name;
const asDecl = (d: Omit<ValueDecl, "name"> & { name?: string }, name: string): ValueDecl => ({ ...d, name: d.name ?? name });

/** The toolkit's checks for this value, as words for the row itself (the parts say their own). */
function ownProblems(decl: ValueDecl, value: unknown, adapter: ValueAdapter | undefined): string {
  if (value === undefined) return "";
  return valueProblems(decl as unknown as TypeDecl, value, contextOf(adapter))
    .filter((p) => p.path === "" && (p.severity === "error" || p.code === "pick-ambiguous") && p.code !== "not-a-value" && p.code !== "not-a-stage")
    .map((p) => `${p.message.replace(/^the value/, "The value")}.`)
    .join(" ");
}

/** The adapter as the toolkit's checks take it: whether a node exists, and a project list's entries. */
function contextOf(adapter: ValueAdapter | undefined): ValueContext {
  if (!adapter) return {};
  return {
    exists: (kind: string, id: string) => nodeLabel(adapter, kind, id) !== undefined,
    ...(adapter.list ? { list: (name: string) => adapter.list!(name) } : {}),
  };
}

/**
 * A row for a value of `decl`'s type, whatever it is: a scalar as the field row, a reference as a choice of
 * the host's nodes, and a record, map or list as its parts, each a row of its own. Keeps its element, and its
 * parts' elements, across `update`, so a host that redraws on every change keeps the author's place.
 */
export function valueRow(initial: ValueRowOptions): ValueRowHandle {
  const decl = initial.decl;
  if (SCALARS.has(decl.type)) return scalarRow(initial);
  if (decl.type === "reference") return referenceRow(initial);
  if (decl.type === "pick") return pickRow(initial);
  return structuredRow(initial);
}

/** The field row, with an extension's help as its purpose and the toolkit's range checks. */
function scalarRow(initial: ValueRowOptions): ValueRowHandle {
  const map = (o: ValueRowOptions) => {
    const range = ownProblems(o.decl, o.value, o.adapter);
    const problem = [range, o.problem ?? ""].filter((w) => w !== "").join(" ");
    return {
      decl: { ...o.decl, ...(o.decl.help !== undefined && o.decl.purpose === undefined ? { purpose: o.decl.help } : {}) },
      value: o.value,
      ...(o.onCommit ? { onCommit: (v: FieldValue | undefined) => o.onCommit!(v) } : {}),
      ...(o.disabled !== undefined ? { disabled: o.disabled } : {}),
      ...(problem !== "" ? { problem } : {}),
      ...(o.replaceProblem !== undefined ? { replaceProblem: o.replaceProblem } : {}),
      label: o.label ?? nameOf(o.decl),
      ...(o.className !== undefined ? { className: o.className } : {}),
      ...(o.labelClassName !== undefined ? { labelClassName: o.labelClassName } : {}),
      ...(o.controlClassName !== undefined ? { controlClassName: o.controlClassName } : {}),
    };
  };
  const handle: FieldRowHandle = fieldRow(map(initial));
  return { el: handle.el, update: (o) => handle.update(map(o)) };
}

/** A reference: a choice of the host's nodes of its kind, "default (none)" first; a node that has gone stays
 *  visible as what is held. Without an adapter, the id is typed. */
function referenceRow(initial: ValueRowOptions): ValueRowHandle {
  let opts = initial;
  if (!opts.adapter) {
    const inner = scalarRow({ ...opts, decl: { ...opts.decl, type: "text" } });
    return { el: inner.el, update: (o) => { opts = o; inner.update({ ...o, decl: { ...o.decl, type: "text" } }); } };
  }
  const row = el("div", "shell-fieldrow shell-valuerow-ref");
  const caption = el("span", "shell-fieldrow-label");
  const body = el("div", "shell-fieldrow-body");
  const sel = el("select", "field shell-fieldrow-select");
  const help = el("p", "shell-fieldrow-purpose shell-fieldrow-described");
  const problem = el("p", "shell-fieldrow-problem");
  problem.setAttribute("role", "status");
  describe(caption, sel, help, problem);
  body.append(sel, help, problem);
  row.append(caption, body);
  helpOnKeyboardFocus(row, () => opts.decl.help ?? opts.decl.purpose ?? "");
  sel.addEventListener("change", () => {
    const v = sel.value === "" ? undefined : sel.value;
    opts = { ...opts, value: v };
    draw(opts);
    opts.onCommit?.(v);
  });
  const draw = (o: ValueRowOptions): void => {
    opts = o;
    row.className = `shell-fieldrow shell-valuerow-ref${o.className ? ` ${o.className}` : ""}`;
    drawCaption(caption, o);
    if (o.controlClassName) sel.className = `shell-fieldrow-select ${o.controlClassName}`;
    const nodes = o.adapter!.nodes(o.decl.to ?? "");
    const held = typeof o.value === "string" ? o.value : "";
    sel.replaceChildren();
    const add = (v: string, text: string): void => { const opt = el("option", undefined, text); opt.value = v; sel.append(opt); };
    add("", "default (none)");
    for (const n of nodes) add(n.id, n.label);
    if (held !== "" && !nodes.some((n) => n.id === held)) {
      // A node outside the choices keeps its name; only one the host says does not exist reads as gone.
      const name = o.adapter!.label?.(o.decl.to ?? "", held);
      add(held, name ?? `${held} (gone)`);
    }
    sel.value = held;
    sel.disabled = o.onCommit === undefined || o.disabled === true;
    help.textContent = o.decl.help ?? o.decl.purpose ?? "";
    const words = o.replaceProblem ?? [ownProblems(o.decl, o.value, o.adapter), o.problem ?? ""].filter((w) => w !== "").join(" ");
    problem.textContent = words;
    problem.hidden = words === "";
    row.classList.toggle("has-problem", words !== "");
  };
  draw(initial);
  return { el: row, update: draw };
}

/** A row's caption: its label in the app's label class, with the help mark when the field has help. */
function drawCaption(caption: HTMLElement, o: ValueRowOptions): void {
  const label = o.label ?? nameOf(o.decl);
  if (typeof label === "string") caption.textContent = label; else caption.replaceChildren(label);
  caption.className = `shell-fieldrow-label${o.labelClassName ? ` ${o.labelClassName}` : ""}`;
  captionHelp(caption, o.decl.help ?? o.decl.purpose ?? "");
}

/** Name a control by its caption and describe it by its help and its problem, as the field row does. */
function describe(caption: HTMLElement, control: HTMLElement, help: HTMLElement, problem: HTMLElement): void {
  caption.id = `shell-vr-${Math.random().toString(36).slice(2, 9)}`;
  help.id = `${caption.id}-p`; problem.id = `${caption.id}-m`;
  control.setAttribute("aria-labelledby", caption.id);
  control.setAttribute("aria-describedby", `${help.id} ${problem.id}`);
}

/**
 * A pick: one choice, "auto" (empty) first, then each source's choices in the declared order, a node kind's and a
 * project list's under their names. A value no source holds stays visible as what is held, marked missing; a
 * name two sources hold is said under it. Without an adapter, a pick of fixed words alone is still a choice of
 * them, and one with other sources is typed as text.
 */
function pickRow(initial: ValueRowOptions): ValueRowHandle {
  let opts = initial;
  if (!opts.adapter && (opts.decl.from ?? []).some((s) => !("words" in s))) {
    const inner = scalarRow({ ...opts, decl: { ...opts.decl, type: "text" } });
    return { el: inner.el, update: (o) => { opts = o; inner.update({ ...o, decl: { ...o.decl, type: "text" } }); } };
  }
  if ((opts.decl.from ?? []).some((s) => "pool" in s)) return poolPickRow(opts);
  const row = el("div", "shell-fieldrow shell-valuerow-pick");
  const caption = el("span", "shell-fieldrow-label");
  const body = el("div", "shell-fieldrow-body");
  const sel = el("select", "field shell-fieldrow-select");
  const help = el("p", "shell-fieldrow-purpose shell-fieldrow-described");
  // What the chosen word means is said with the field's help, in the tooltip, not under the control.
  const valueHelp = el("p", "shell-fieldrow-purpose shell-fieldrow-valuehelp shell-fieldrow-described");
  const problem = el("p", "shell-fieldrow-problem");
  problem.setAttribute("role", "status");
  describe(caption, sel, help, problem);
  valueHelp.id = `${caption.id}-v`;
  sel.setAttribute("aria-describedby", `${help.id} ${valueHelp.id} ${problem.id}`);
  body.append(sel, help, valueHelp, problem);
  row.append(caption, body);
  const tip = (): string => helpText(opts.decl.help ?? opts.decl.purpose ?? "", typeof opts.value === "string" ? opts.value : undefined, valueHelpText(opts.decl, opts.value));
  helpOnKeyboardFocus(row, tip);
  sel.addEventListener("change", () => {
    const v = sel.value === "" ? undefined : sel.value;
    opts = { ...opts, value: v };
    draw(opts);
    opts.onCommit?.(v);
  });
  const groupName = sourceGroup;
  const draw = (o: ValueRowOptions): void => {
    opts = o;
    row.className = `shell-fieldrow shell-valuerow-pick${o.className ? ` ${o.className}` : ""}`;
    drawCaption(caption, o);
    captionHelp(caption, tip());
    if (o.controlClassName) sel.className = `shell-fieldrow-select ${o.controlClassName}`;
    const adapter = o.adapter;
    const choices = pickChoices(o.decl as unknown as TypeDecl, {
      ...(adapter ? { nodes: (kind: string) => adapter.nodes(kind) } : {}),
      ...(adapter?.list ? { list: (name: string) => adapter.list!(name) } : {}),
    });
    const held = typeof o.value === "string" ? o.value : "";
    sel.replaceChildren();
    const option = (v: string, text: string): HTMLOptionElement => { const opt = el("option", undefined, text); opt.value = v; return opt; };
    // Unset is automatic, said as every field's unset is: "default (...)".
    sel.append(option("", "default (auto)"));
    // One group per source, in order; a value two sources hold is offered by the first only, so the select
    // shows one choice for what it holds (the row says the name is ambiguous).
    const offered = new Set<string>();
    let group: { source: PickSource; el: HTMLElement } | undefined;
    for (const c of choices) {
      if (offered.has(c.value)) continue;
      offered.add(c.value);
      const name = groupName(c.source);
      if (name === undefined) { group = undefined; sel.append(option(c.value, c.label)); continue; }
      if (group?.source !== c.source) {
        const og = el("optgroup");
        og.setAttribute("label", name);
        sel.append(og);
        group = { source: c.source, el: og };
      }
      group.el.append(option(c.value, c.label));
    }
    if (held !== "" && !offered.has(held)) {
      // A node outside the choices keeps its name (as a reference's does); anything else is missing.
      const named = (o.decl.from ?? []).map((s) => ("to" in s && adapter ? adapter.label?.(s.to, held) : undefined)).find((n) => n !== undefined);
      sel.append(option(held, named ?? `${held} (missing)`));
    }
    sel.value = held;
    sel.disabled = o.onCommit === undefined || o.disabled === true;
    help.textContent = o.decl.help ?? o.decl.purpose ?? "";
    // The chosen word's own help, as an enum's value has (a pick's help describes its fixed words only).
    valueHelp.textContent = valueHelpText(o.decl, o.value);
    const words = o.replaceProblem ?? [ownProblems(o.decl, o.value, o.adapter), o.problem ?? ""].filter((w) => w !== "").join(" ");
    problem.textContent = words;
    problem.hidden = words === "";
    row.classList.toggle("has-problem", words !== "");
  };
  draw(initial);
  return { el: row, update: draw };
}

/** The heading a pick's source is listed under: none for fixed words, else what the choices are. */
function sourceGroup(s: PickSource): string | undefined {
  if ("words" in s) return undefined;
  if ("to" in s) return s.to === "cast" ? "Cast" : s.to.charAt(0).toUpperCase() + s.to.slice(1);
  if ("pool" in s) return "Used in this project";
  return "list" in s ? s.list : (s as { keys?: string }).keys;
}

/**
 * A pick with a `pool` source (free-text-picks): any text, typed in a box that suggests the other sources'
 * choices (fixed words first, then the cast by name) and the names already used for the pool, the commonest first.
 * A name a source holds is that choice; anything else is held as typed. Empty is automatic.
 */
function poolPickRow(initial: ValueRowOptions): ValueRowHandle {
  let opts = initial;
  const row = el("div", "shell-fieldrow shell-valuerow-pick");
  const caption = el("span", "shell-fieldrow-label");
  const body = el("div", "shell-fieldrow-body");
  const help = el("p", "shell-fieldrow-purpose shell-fieldrow-described");
  const valueHelp = el("p", "shell-fieldrow-purpose shell-fieldrow-valuehelp shell-fieldrow-described");
  const problem = el("p", "shell-fieldrow-problem");
  problem.setAttribute("role", "status");
  const box = suggestBox({
    className: "field shell-fieldrow-text",
    placeholder: "default (auto)",
    suggestions: () => {
      const adapter = opts.adapter;
      return pickChoices(opts.decl as unknown as TypeDecl, {
        ...(adapter ? { nodes: (kind: string) => adapter.nodes(kind) } : {}),
        ...(adapter?.list ? { list: (name: string) => adapter.list!(name) } : {}),
        ...(adapter?.pool ? { pool: (name: string) => adapter.pool!(name) } : {}),
      }).map((c) => ({ value: c.value, label: c.label, ...(sourceGroup(c.source) !== undefined ? { group: sourceGroup(c.source)! } : {}) }));
    },
    onCommit: (value) => {
      const v = value === "" ? undefined : value;
      opts = { ...opts, value: v };
      draw(opts);
      opts.onCommit?.(v);
    },
  });
  const input = box.input;
  describe(caption, input, help, problem);
  valueHelp.id = `${caption.id}-v`;
  input.setAttribute("aria-describedby", `${help.id} ${valueHelp.id} ${problem.id}`);
  body.append(input, help, valueHelp, problem);
  row.append(caption, body);
  const tip = (): string => helpText(opts.decl.help ?? opts.decl.purpose ?? "", typeof opts.value === "string" ? opts.value : undefined, valueHelpText(opts.decl, opts.value));
  helpOnKeyboardFocus(row, tip);
  const draw = (o: ValueRowOptions): void => {
    opts = o;
    row.className = `shell-fieldrow shell-valuerow-pick${o.className ? ` ${o.className}` : ""}`;
    drawCaption(caption, o);
    captionHelp(caption, tip());
    if (o.controlClassName) input.className = `shell-fieldrow-text ${o.controlClassName}`;
    box.set(typeof o.value === "string" ? o.value : "");
    box.setDisabled(o.onCommit === undefined || o.disabled === true);
    help.textContent = o.decl.help ?? o.decl.purpose ?? "";
    valueHelp.textContent = valueHelpText(o.decl, o.value);
    const words = o.replaceProblem ?? [ownProblems(o.decl, o.value, o.adapter), o.problem ?? ""].filter((w) => w !== "").join(" ");
    problem.textContent = words;
    problem.hidden = words === "";
    row.classList.toggle("has-problem", words !== "");
  };
  draw(initial);
  return { el: row, update: draw };
}

/** A part of a structured value: a row, keyed so it is the same element next time. */
interface Part { key: string; handle: ValueRowHandle; holder: HTMLElement; tools: HTMLElement }

/** The types a list's or a map's entry is one control of: drawn as a table row (key or number, value, tools). */
const ONE_CONTROL = new Set([...SCALARS, "reference", "pick"]);

/**
 * A record, a map or a list: a caption, then its parts, with the controls the type calls for (add and remove for
 * a map; add, remove and move for a list). A list or a map of single values is a table: each entry's number or
 * key, its value, and its tools on one row, the adder as the last. With `tables`, a map or a list of records is
 * the record grid, a column per field; else each record is stacked rows. A record's own fields are rows.
 */
function structuredRow(initial: ValueRowOptions): ValueRowHandle {
  let opts = initial;
  const row = el("div", "shell-fieldrow shell-valuerow");
  const caption = el("span", "shell-fieldrow-label");
  const body = el("div", "shell-fieldrow-body shell-valuerow-parts");
  const help = el("p", "shell-fieldrow-purpose shell-fieldrow-described");
  const problem = el("p", "shell-fieldrow-problem");
  problem.setAttribute("role", "status");
  caption.id = `shell-vr-${Math.random().toString(36).slice(2, 9)}`;
  help.id = `${caption.id}-p`;
  body.setAttribute("role", "group");
  body.setAttribute("aria-labelledby", caption.id);
  body.setAttribute("aria-describedby", help.id);
  const adder = el("div", "shell-valuerow-add");
  row.append(caption, body);
  helpOnKeyboardFocus(row, () => opts.decl.help ?? opts.decl.purpose ?? "");
  const parts = new Map<string, Part>();
  /** The parts kept from the last draw, whose focus goes back to them once they are in the page again. */
  let kept: HTMLElement[] = [];
  let addKey = "";
  /** The record grid, when this is a table of records: kept across draws, as the parts are. */
  let grid: { kind: "map" | "list"; handle: RecordMapGrid } | undefined;

  const editable = (): boolean => opts.onCommit !== undefined && opts.disabled !== true;
  const commit = (v: unknown): void => { opts = { ...opts, value: v }; draw(opts); opts.onCommit?.(v); };

  /** The row for one part, the same element as last time for the same key. */
  const part = (key: string, o: ValueRowOptions, controls: HTMLElement[] = []): HTMLElement => {
    const had = parts.get(key);
    if (had && had.handle.el.dataset["type"] === o.decl.type) {
      fieldRowFocus.settle(had.handle.el);
      had.handle.update(o);
      // Its own slot, not the first one inside it: a structured part has slots of its own further down.
      had.tools.replaceChildren(...controls);
      kept.push(had.handle.el);
      return had.holder;
    }
    const handle = valueRow(o);
    handle.el.dataset["type"] = o.decl.type;
    const holder = el("div", "shell-valuerow-part");
    const tools = el("span", "shell-valuerow-controls");
    tools.append(...controls);
    holder.append(handle.el, tools);
    parts.set(key, { key, handle, holder, tools });
    return holder;
  };

  /** The record grid for a map or a list of records, drawn in place of the parts. */
  const recordGrid = (o: ValueRowOptions, kind: "map" | "list"): HTMLElement => {
    const gridOpts = {
      decl: o.decl, value: o.value,
      ...(editable() ? { onCommit: (v: unknown) => { opts = { ...opts, value: v }; opts.onCommit?.(v); } } : {}),
      ...(o.adapter ? { adapter: o.adapter } : {}),
      ...(o.disabled !== undefined ? { disabled: o.disabled } : {}),
      ...(o.controlClassName !== undefined ? { controlClassName: o.controlClassName } : {}),
    };
    if (grid?.kind === kind) { grid.handle.update(gridOpts); return grid.handle.el; }
    grid = { kind, handle: kind === "map" ? recordMapGrid(gridOpts) : recordListGrid(gridOpts) };
    return grid.handle.el;
  };

  const draw = (o: ValueRowOptions): void => {
    opts = o;
    kept = [];
    const decl = o.decl;
    const table = decl.type !== "record" && decl.of !== undefined && ONE_CONTROL.has(decl.of.type);
    row.className = `shell-fieldrow shell-valuerow shell-valuerow-${decl.type}${o.className ? ` ${o.className}` : ""}`;
    drawCaption(caption, o);
    body.className = `shell-fieldrow-body shell-valuerow-parts${table ? " shell-valuerow-table" : ""}`;
    help.textContent = decl.help ?? decl.purpose ?? "";
    const used = new Set<string>();
    const rows: HTMLElement[] = [];
    const child = (key: string, childDecl: ValueDecl, value: unknown, onCommit: (v: unknown) => void, controls?: HTMLElement[], childLabel?: string, extraProblem?: string): void => {
      used.add(key);
      rows.push(part(key, {
        decl: childDecl, value,
        ...(editable() ? { onCommit } : {}),
        ...(o.adapter ? { adapter: o.adapter } : {}),
        ...(o.disabled !== undefined ? { disabled: o.disabled } : {}),
        ...(childLabel !== undefined ? { label: childLabel } : {}),
        ...(extraProblem ? { problem: extraProblem } : {}),
        ...(o.controlClassName !== undefined ? { controlClassName: o.controlClassName } : {}),
        // A table row's key or number, and a record's field names, are the parts' own captions: the app's label
        // class is for the field's.
        ...(o.tables ? { tables: true } : {}),
      }, controls));
    };

    const asGrid = o.tables === true && (isRecordMap(decl) ? "map" : isRecordList(decl) ? "list" : undefined);
    if (asGrid) {
      parts.clear();
      body.replaceChildren(recordGrid(o, asGrid));
      body.append(help);
      sayProblem(o);
      return;
    }
    grid = undefined;

    if (decl.type === "record") {
      const value = isObject(o.value) ? o.value : undefined;
      const required = value === undefined ? [] : valueProblems(decl as unknown as TypeDecl, value).filter((p) => p.code === "required");
      for (const f of decl.fields ?? []) {
        const missing = required.find((p) => p.path === f.name);
        child(`f:${f.name}`, f, value?.[f.name], (v) => {
          const next: Record<string, unknown> = { ...(isObject(opts.value) ? opts.value : {}) };
          if (v === undefined) delete next[f.name]; else next[f.name] = v;
          commit(Object.keys(next).length > 0 ? next : undefined);
        }, undefined, undefined, missing ? "Required." : undefined);
      }
    } else if (decl.type === "map" && decl.of) {
      const value = isObject(o.value) ? o.value : {};
      const keyNodes = decl.key?.type === "reference" && o.adapter ? o.adapter.nodes(decl.key.to ?? "") : undefined;
      const keyKind = decl.key?.to ?? "";
      const keyLabel = (k: string): string => (o.adapter && keyNodes !== undefined ? nodeLabel(o.adapter, keyKind, k) : undefined) ?? k;
      for (const k of Object.keys(value)) {
        const remove = editable() ? [iconBtn("close", `Remove ${keyLabel(k)}`, () => {
          const next = { ...(isObject(opts.value) ? opts.value : {}) };
          delete next[k];
          commit(Object.keys(next).length > 0 ? next : undefined);
        })] : [];
        const gone = keyNodes !== undefined && o.adapter && nodeLabel(o.adapter, keyKind, k) === undefined ? `${k} is not here any more.` : undefined;
        child(`k:${k}`, asDecl(decl.of, k), value[k], (v) => {
          const next = { ...(isObject(opts.value) ? opts.value : {}) };
          next[k] = v === undefined ? defaultOf(decl.of as unknown as TypeDecl) : v;
          commit(next);
        }, remove, keyLabel(k), gone);
      }
      adder.replaceChildren();
      if (editable()) {
        const add = (k: string): void => {
          if (k === "" || Object.prototype.hasOwnProperty.call(value, k)) return;
          commit({ ...value, [k]: defaultOf(decl.of as unknown as TypeDecl) });
        };
        if (keyNodes !== undefined) {
          const pick = el("select", keyClass(o));
          const first = el("option", undefined, "Add..."); first.value = ""; pick.append(first);
          for (const n of keyNodes.filter((n) => !Object.prototype.hasOwnProperty.call(value, n.id))) {
            const opt = el("option", undefined, n.label); opt.value = n.id; pick.append(opt);
          }
          pick.addEventListener("change", () => add(pick.value));
          adder.append(pick);
        } else {
          const input = el("input", keyClass(o));
          input.type = "text"; input.placeholder = "New key"; input.value = addKey;
          input.setAttribute("aria-label", `New key for ${nameOf(decl)}`);
          input.addEventListener("input", () => { addKey = input.value; });
          const go = (): void => { const k = input.value.trim(); addKey = ""; add(k); };
          input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") go(); });
          adder.append(input, iconBtn("add", `Add to ${nameOf(decl)}`, go));
        }
      }
    } else if (decl.type === "list" && decl.of) {
      const value = Array.isArray(o.value) ? o.value : [];
      const idOf = (item: unknown, i: number): string =>
        decl.id !== undefined && isObject(item) && typeof item[decl.id] === "string" ? `id:${item[decl.id] as string}` : `i:${i}`;
      value.forEach((item, i) => {
        const set = (next: unknown[]): void => commit(next.length > 0 ? next : undefined);
        const controls = editable() ? [
          iconBtn("up", "Move up", () => { const next = [...value]; if (moveItem(next, i, -1)) set(next); }, i === 0),
          iconBtn("down", "Move down", () => { const next = [...value]; if (moveItem(next, i, 1)) set(next); }, i === value.length - 1),
          iconBtn("close", "Remove", () => set(value.filter((_, j) => j !== i)), false, true),
        ] : [];
        // An item is named by its id, else, as nothing refers to an item by number, by the list and its place: a name
        // for a screen reader, not drawn (the table shows no numbers).
        const itemLabel = decl.id !== undefined && isObject(item) && typeof item[decl.id] === "string" ? item[decl.id] as string : `${nameOf(decl)}, item ${i + 1}`;
        child(idOf(item, i), asDecl(decl.of!, itemLabel), item, (v) => {
          const next = [...(Array.isArray(opts.value) ? opts.value : [])];
          next[i] = v === undefined ? defaultOf(decl.of as unknown as TypeDecl) : v;
          set(next);
        }, controls, itemLabel);
      });
      adder.replaceChildren();
      if (editable()) adder.append(iconBtn("add", `Add to ${nameOf(decl)}`, () => commit([...value, freshItem(decl, value)])));
    }

    for (const key of [...parts.keys()]) if (!used.has(key)) parts.delete(key);
    body.replaceChildren(...rows);
    if (decl.type !== "record" && editable()) body.append(adder);
    body.append(help);
    sayProblem(o);
    for (const k of kept) fieldRowFocus.restore(k);
  };

  const sayProblem = (o: ValueRowOptions): void => {
    const words = o.replaceProblem ?? [ownProblems(o.decl, o.value, o.adapter), o.problem ?? ""].filter((w) => w !== "").join(" ");
    problem.textContent = words;
    problem.hidden = words === "";
    body.append(problem);
    row.classList.toggle("has-problem", words !== "");
  };
  draw(initial);
  return { el: row, update: draw };
}

/** A map's key adder in the app's own control class, so it is the size of the inputs above it. */
function keyClass(o: ValueRowOptions): string {
  return `${o.controlClassName ?? "field"} shell-valuerow-key`;
}

/** A new item for a list: its type's default, and, in a list with ids, an id no item has yet. */
export function freshItem(decl: ValueDecl, value: readonly unknown[]): unknown {
  const fresh = defaultOf(decl.of as unknown as TypeDecl);
  if (decl.id !== undefined && isObject(fresh)) {
    const taken = new Set(value.map((x) => (isObject(x) ? x[decl.id!] : undefined)));
    let n = value.length + 1;
    while (taken.has(`item-${n}`)) n++;
    fresh[decl.id] = `item-${n}`;
  }
  return fresh;
}

/** A cache of value rows for a host that redraws its whole view (as `fieldRows` is for the scalar row). */
export interface ValueRows {
  row(key: string, opts: ValueRowOptions): HTMLElement;
  sweep(): void;
}

export function valueRows(): ValueRows {
  const rows = new Map<string, { handle: ValueRowHandle; type: string; used: boolean }>();
  return {
    row(key, opts) {
      const had = rows.get(key);
      if (had && had.type === opts.decl.type) {
        had.used = true;
        fieldRowFocus.settle(had.handle.el);
        had.handle.update(opts);
        fieldRowFocus.restore(had.handle.el);
        return had.handle.el;
      }
      const handle = valueRow(opts);
      rows.set(key, { handle, type: opts.decl.type, used: true });
      return handle.el;
    },
    sweep() {
      for (const [key, entry] of rows) { if (!entry.used) rows.delete(key); else entry.used = false; }
    },
  };
}

// An extension's section folded to the fields a node sets (value-fold.ts), under this entry so a host takes
// the rows and the fold together.
export { isSet, extensionFold, fieldGroups, foldCaption } from "./value-fold.js";
export type { ExtensionFold, FieldGroups, FoldSectionOptions, GroupRowsOptions } from "./value-fold.js";

// A map of records (record-map.ts): the inspector's summary and the helper window's grid.
export { isRecordMap, isRecordList, recordMapGrid, recordListGrid, recordMapKeyLabel, recordMapSummary, valueText } from "./record-map.js";
export type { RecordMapGrid, RecordMapGridOptions } from "./record-map.js";
