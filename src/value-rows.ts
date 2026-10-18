// ---------------------------------------------------------------------------
// Rows for a value of ANY declared type: the seven scalars through the field
// row, and the types an extension's fields add (patterkit design/proposals/
// patter-storylet-extensions.md, "Tier 1: fields"): a `reference` to one of the
// host's nodes, a `record` of named fields, a `map` keyed by a reference or by
// text, and a `list` with ids or without.
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
// cards). No Electron, no app state: DOM only.
//
// Its own entry (`@wildwinter/app-shell/value-rows`) rather than part of
// value-control, because it needs `@wildwinter/toolkit/extensions` (an optional
// peer, toolkit 0.2.0 or later) and the scalar row does not: a host that draws
// only the family's seven types takes nothing new.
// ---------------------------------------------------------------------------

import { defaultOf, valueProblems } from "@wildwinter/toolkit/extensions";
import type { TypeDecl } from "@wildwinter/toolkit/extensions";
import { el, iconBtn, moveItem } from "./dom.js";
import { fieldRow, fieldRowFocus } from "./value-control.js";
import type { FieldDeclLike, FieldRowHandle, FieldValue } from "./value-control.js";

/** A declaration of any type, as an extension's manifest writes it. */
export interface ValueDecl extends FieldDeclLike {
  /** The caption; the name when absent. */
  label?: string;
  /** A sentence or two shown under the control (an extension's `help`, a field's `purpose`). */
  help?: string;
  /** A reference's node kind. */
  to?: string;
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

/** What only the host knows: the nodes of a kind (`card`, `tag`, `cast`...), for references and map keys. */
export interface ValueAdapter {
  nodes(kind: string): readonly ValueNode[];
  /**
   * The name of a node by kind and id, for a value that holds one `nodes` does not offer (a node outside the
   * choices, say): undefined when there is no such node, which is then shown as gone. Absent: a held id `nodes`
   * does not list is taken to be gone.
   */
  label?(kind: string, id: string): string | undefined;
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
  /** The caption; default the declaration's label, else its name. */
  label?: string | Node;
  className?: string;
  labelClassName?: string;
  controlClassName?: string;
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
  const exists = adapter ? (kind: string, id: string) => nodeLabel(adapter, kind, id) !== undefined : undefined;
  return valueProblems(decl as unknown as TypeDecl, value, exists ? { exists } : {})
    .filter((p) => p.path === "" && p.severity === "error" && p.code !== "not-a-value" && p.code !== "not-a-stage")
    .map((p) => `${p.message.replace(/^the value/, "The value")}.`)
    .join(" ");
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
  const help = el("p", "shell-fieldrow-purpose");
  const problem = el("p", "shell-fieldrow-problem");
  problem.setAttribute("role", "status");
  body.append(sel, help, problem);
  row.append(caption, body);
  sel.addEventListener("change", () => {
    const v = sel.value === "" ? undefined : sel.value;
    opts = { ...opts, value: v };
    draw(opts);
    opts.onCommit?.(v);
  });
  const draw = (o: ValueRowOptions): void => {
    opts = o;
    row.className = `shell-fieldrow shell-valuerow-ref${o.className ? ` ${o.className}` : ""}`;
    const label = o.label ?? nameOf(o.decl);
    if (typeof label === "string") caption.textContent = label; else caption.replaceChildren(label);
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
    help.hidden = help.textContent === "";
    const words = [ownProblems(o.decl, o.value, o.adapter), o.problem ?? ""].filter((w) => w !== "").join(" ");
    problem.textContent = words;
    problem.hidden = words === "";
    row.classList.toggle("has-problem", words !== "");
  };
  draw(initial);
  return { el: row, update: draw };
}

/** A part of a structured value: a row, keyed so it is the same element next time. */
interface Part { key: string; handle: ValueRowHandle; holder: HTMLElement; tools: HTMLElement }

/** A record, a map or a list: a caption, then its parts, each a row of its own, with the controls the type
 *  calls for (add and remove for a map; add, remove and move for a list). */
function structuredRow(initial: ValueRowOptions): ValueRowHandle {
  let opts = initial;
  const row = el("div", "shell-fieldrow shell-valuerow");
  const caption = el("span", "shell-fieldrow-label");
  const body = el("div", "shell-fieldrow-body shell-valuerow-parts");
  const help = el("p", "shell-fieldrow-purpose");
  const problem = el("p", "shell-fieldrow-problem");
  problem.setAttribute("role", "status");
  const adder = el("div", "shell-valuerow-add");
  row.append(caption, body);
  const parts = new Map<string, Part>();
  /** The parts kept from the last draw, whose focus goes back to them once they are in the page again. */
  let kept: HTMLElement[] = [];
  let addKey = "";

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

  const draw = (o: ValueRowOptions): void => {
    opts = o;
    kept = [];
    const decl = o.decl;
    row.className = `shell-fieldrow shell-valuerow shell-valuerow-${decl.type}${o.className ? ` ${o.className}` : ""}`;
    const label = o.label ?? nameOf(decl);
    if (typeof label === "string") caption.textContent = label; else caption.replaceChildren(label);
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
      }, controls));
    };

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
          const pick = el("select", "field shell-valuerow-key");
          const first = el("option", undefined, "Add..."); first.value = ""; pick.append(first);
          for (const n of keyNodes.filter((n) => !Object.prototype.hasOwnProperty.call(value, n.id))) {
            const opt = el("option", undefined, n.label); opt.value = n.id; pick.append(opt);
          }
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
        const itemLabel = decl.id !== undefined && isObject(item) && typeof item[decl.id] === "string" ? item[decl.id] as string : `${i + 1}`;
        child(idOf(item, i), asDecl(decl.of!, itemLabel), item, (v) => {
          const next = [...(Array.isArray(opts.value) ? opts.value : [])];
          next[i] = v === undefined ? defaultOf(decl.of as unknown as TypeDecl) : v;
          set(next);
        }, controls, itemLabel);
      });
      adder.replaceChildren();
      if (editable()) {
        adder.append(iconBtn("add", "Add", () => {
          const fresh = defaultOf(decl.of as unknown as TypeDecl);
          if (decl.id !== undefined && isObject(fresh)) {
            const taken = new Set(value.map((x) => (isObject(x) ? x[decl.id!] : undefined)));
            let n = value.length + 1;
            while (taken.has(`item-${n}`)) n++;
            fresh[decl.id] = `item-${n}`;
          }
          commit([...value, fresh]);
        }));
      }
    }

    for (const key of [...parts.keys()]) if (!used.has(key)) parts.delete(key);
    body.replaceChildren(...rows);
    if (decl.type !== "record" && editable()) body.append(adder);
    help.textContent = decl.help ?? decl.purpose ?? "";
    if (help.textContent !== "") body.append(help);
    const words = [ownProblems(decl, o.value, o.adapter), o.problem ?? ""].filter((w) => w !== "").join(" ");
    problem.textContent = words;
    problem.hidden = words === "";
    body.append(problem);
    row.classList.toggle("has-problem", words !== "");
    for (const k of kept) fieldRowFocus.restore(k);
  };
  draw(initial);
  return { el: row, update: draw };
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
