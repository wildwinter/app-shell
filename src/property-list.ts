// ---------------------------------------------------------------------------
// THE property declaration list: name, type, default, values or stages,
// purpose, in a row per declaration, with reorder, remove, add-then-focus and
// the duplicate / illegal-name gates. Patterpad's settings-properties.ts and
// Storyletter's prop-list.ts were built from the same shell primitives in the
// same order (dupGuard, bindPropertyName, a type select over the same six
// types, defaultControl, three iconBtns on moveItem, labelled tagChips and
// stageChips, expandableRow, focusNewRow); this is the one list, and each
// app's extras (Shared, Temporary, Read-only, Durable) arrive through
// `extraLine` / `extraDetails`.
//
// `defaultControl` was four copies (three inside Patterpad), and the two apps'
// option labels had already parted ("(unset)" vs "(none)"). One label set now.
//
// Storage of the default differs by app: Patterpad's model holds a typed
// value (true, 3), Storyletter's DTO holds the string the field showed. The
// list mutates `decls` in place either way; `typed` picks the encoding.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { iconBtn, labelled, moveItem, stageChips, tagChips } from "./dom.js";
import { dupGuard, expandableRow, focusNewRow } from "./settings.js";
import type { SettingsSectionHandle } from "./settings.js";
import { bindPropertyName, firstIllegalPropertyName } from "./property-name-field.js";
import { PROPERTY_NAME_HINT } from "./property-names.js";

/** The six types both apps declare. */
export type PropertyListType = "number" | "boolean" | "string" | "enum" | "flags" | "quality";

/** The shape a row edits. Apps' DTOs carry more (shared, writable, durable);
 *  those ride through untouched. */
export interface PropertyDeclLike {
  name: string;
  type: string;
  default?: unknown;
  /** enum / flags */
  values?: string[];
  /** quality: the ladder, in order */
  stages?: string[];
  purpose?: string;
}

/** The type list, in the family's order, with the words the select shows. */
export const PROPERTY_TYPES: ReadonlyArray<readonly [PropertyListType, string]> = [
  ["number", "Number"], ["boolean", "True / False"], ["string", "Text"],
  ["enum", "List"], ["flags", "Flags"], ["quality", "Quality"],
];

export interface DefaultControlOptions {
  /**
   * How the default is stored. `false` (default): the string the field shows,
   * "" for none (Storyletter's DTO). `true`: a typed value (boolean, number,
   * string), and none DELETES the key (Patterpad's model).
   */
  typed?: boolean;
}

const option = (value: string, label: string, selected: boolean): HTMLOptionElement => {
  const o = el("option", undefined, label);
  o.value = value; o.selected = selected;
  return o;
};

const NONE = "(none)";

/**
 * The type-appropriate control for a declaration's DEFAULT: a true / false
 * picker for a boolean, the value list for an enum, the stage list for a
 * quality (blank = the first rung), a note for flags (a set starts empty), a
 * number or text field otherwise. The one label for "no default" is "(none)".
 */
export function defaultControl(p: PropertyDeclLike, onChange?: () => void, opts: DefaultControlOptions = {}): HTMLElement {
  const typed = opts.typed === true;
  const write = (raw: string): void => {
    if (raw === "") { if (typed) delete p.default; else p.default = ""; }
    else if (typed && p.type === "boolean") p.default = raw === "true";
    else if (typed && p.type === "number") p.default = Number(raw);
    else p.default = raw;
    onChange?.();
  };
  const current = p.default === undefined || p.default === null ? "" : String(p.default);
  if (p.type === "boolean") {
    const sel = el("select", "field set-default");
    sel.append(option("", NONE, current === ""), option("true", "True", current === "true"), option("false", "False", current === "false"));
    sel.addEventListener("change", () => write(sel.value));
    return sel;
  }
  if (p.type === "enum") {
    const sel = el("select", "field set-default");
    sel.append(option("", NONE, current === ""));
    for (const v of p.values ?? []) sel.append(option(v, v, current === v));
    sel.addEventListener("change", () => write(sel.value));
    return sel;
  }
  if (p.type === "quality") {
    // The default is a STAGE; blank means the first rung, so say so rather
    // than "(none)".
    const sel = el("select", "field set-default");
    sel.append(option("", "(first stage)", current === ""));
    for (const v of p.stages ?? []) sel.append(option(v, v, current === v));
    sel.addEventListener("change", () => write(sel.value));
    return sel;
  }
  if (p.type === "flags") {
    // Flags hold a SET of values, so there is no single default: it starts empty.
    const s = el("span", "set-flagnote", "Starts empty");
    s.dataset["tip"] = "A flags property starts with none set.";
    return s;
  }
  const input = el("input", "field set-default");
  input.type = p.type === "number" ? "number" : "text";
  input.placeholder = "Default";
  input.value = current;
  input.addEventListener("input", () => write(input.value));
  return input;
}

export interface PropertyListOptions<T extends PropertyDeclLike> extends DefaultControlOptions {
  /** Called after every mutation; a centre editor feeds its autosave here. */
  onChange?: () => void;
  /** The add button's label. Default "+ Add property". */
  addLabel?: string;
  /** The empty sentence. Default "No properties yet." */
  emptyText?: string;
  /** The type select's entries; default `PROPERTY_TYPES`. */
  types?: ReadonlyArray<readonly [string, string]>;
  /** A fresh declaration for the add button. Default: a blank of the first type. */
  newDecl?: () => T;
  /** Controls on the row's line, between the default and the movers
   *  (Storyletter's "uses" affordance). */
  extraLine?: (decl: T, index: number) => (HTMLElement | null)[];
  /** Fields behind the disclosure, before Values / Stages / Purpose
   *  (Shared, Temporary, Read-only, Durable). */
  extraDetails?: (decl: T, index: number) => (HTMLElement | null)[];
  /** Offer the Purpose field. Default true. */
  purpose?: boolean;
}

export interface PropertyListHandle extends SettingsSectionHandle {
  /** Both faults, for the Save gate: a duplicate first, then an illegal name. */
  firstInvalid(): HTMLInputElement | null;
  /** The first name that clashes with another, or null. */
  firstDuplicate(): HTMLInputElement | null;
  /** The first name no expression could reach, or null. */
  firstIllegalName(): HTMLInputElement | null;
  /** Redraw from `decls` (after an outside change). */
  render(): void;
}

/** Mount the list into `host`. Mutates `decls` in place; the caller reads
 *  them back on save (pruning blank names is the caller's, since only it
 *  knows its DTO). */
export function mountPropertyList<T extends PropertyDeclLike>(host: HTMLElement, decls: T[], opts: PropertyListOptions<T> = {}): PropertyListHandle {
  const changed = (): void => opts.onChange?.();
  const guard = dupGuard();
  const types = opts.types ?? PROPERTY_TYPES;
  const list = el("div", "set-list");
  const keep = (parts: (HTMLElement | null)[] | undefined): HTMLElement[] =>
    (parts ?? []).filter((p): p is HTMLElement => p !== null);

  const row = (p: T, i: number): HTMLElement => {
    const name = el("input", "field set-name");
    name.type = "text"; name.placeholder = "Property name"; name.value = p.name; name.spellcheck = false;
    name.dataset["tip"] = PROPERTY_NAME_HINT;
    bindPropertyName(name, (v) => { p.name = v; changed(); }, { hint: PROPERTY_NAME_HINT });
    guard.track(name);

    const type = el("select", "field set-type");
    for (const [v, label] of types) type.append(option(v, label, v === p.type));
    type.addEventListener("change", () => {
      p.type = type.value;
      if (opts.typed) delete p.default; else p.default = "";
      if (p.type === "enum" || p.type === "flags") p.values ??= []; else delete p.values;
      if (p.type === "quality") p.stages ??= []; else delete p.stages;
      render(); changed();
    });

    // The default control is rebuilt in place when the values change, so a
    // new value becomes selectable as the default.
    let def = defaultControl(p, changed, opts);
    const refreshDefault = (): void => { const fresh = defaultControl(p, changed, opts); def.replaceWith(fresh); def = fresh; changed(); };

    const up = iconBtn("up", "Move up", () => { if (moveItem(decls, i, -1)) { render(); changed(); } }, i === 0);
    const down = iconBtn("down", "Move down", () => { if (moveItem(decls, i, 1)) { render(); changed(); } }, i === decls.length - 1);
    const del = iconBtn("close", "Delete property", () => { decls.splice(i, 1); render(); changed(); }, false, true);

    const details: HTMLElement[] = keep(opts.extraDetails?.(p, i));
    if (p.type === "enum" || p.type === "flags") details.push(labelled("Values", tagChips(p, refreshDefault)));
    // A quality's ladder, IN ORDER: the chips carry movers because position is the meaning.
    if (p.type === "quality") details.push(labelled("Stages (in order)", stageChips(p, refreshDefault)));
    if (opts.purpose !== false) {
      const purpose = el("input", "field set-purpose");
      purpose.type = "text"; purpose.placeholder = "What this property is for"; purpose.value = p.purpose ?? "";
      purpose.addEventListener("input", () => {
        if (purpose.value.trim()) p.purpose = purpose.value; else delete p.purpose;
        changed();
      });
      details.push(labelled("Purpose", purpose));
    }
    // Stamped with the declared name so "Go to definition" lands on the row (revealRow).
    return expandableRow({ line: [name, type, def, ...keep(opts.extraLine?.(p, i)), up, down, del], details, name: p.name });
  };

  const render = (): void => {
    guard.reset();
    list.replaceChildren();
    if (decls.length === 0) list.append(el("p", "empty", opts.emptyText ?? "No properties yet."));
    else decls.forEach((p, i) => list.append(row(p, i)));
    guard.check();
  };
  render();

  const add = el("button", "btn set-add", opts.addLabel ?? "+ Add property");
  add.type = "button";
  add.addEventListener("click", () => {
    decls.push(opts.newDecl ? opts.newDecl() : ({ name: "", type: types[0]?.[0] ?? "string", ...(opts.typed ? {} : { default: "" }) } as unknown as T));
    render(); changed(); focusNewRow(list);
  });
  host.append(list, add);

  return {
    firstDuplicate: () => guard.firstDuplicate(),
    firstIllegalName: () => firstIllegalPropertyName(host),
    // The Save gate takes both faults; the field's own rollover says which.
    firstInvalid: () => guard.firstDuplicate() ?? firstIllegalPropertyName(host),
    render,
  };
}
