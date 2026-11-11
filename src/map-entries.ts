// ---------------------------------------------------------------------------
// A map's entries as an editor shows them: the extension's built-in ones (the
// manifest's `builtIn`, toolkit 1.3), then the project's own (Pattershot's brief
// extension-section-closed-and-built-in-map-entries, D2 to D4, Ian 2026-11-11).
//
// A built-in entry has its name fixed: it can be changed, which makes the whole
// entry the project's own, and reset, which takes it out of the project's map,
// but never removed or renamed. Setting it back to exactly its built-in value
// resets it too, so the project's map holds only what differs. Both of the
// map's views (value-rows' stacked rows and record-map's grid) draw from here.
// ---------------------------------------------------------------------------

import { stableStringify } from "@wildwinter/toolkit/extensions";
import type { ValueDecl } from "./value-rows.js";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export interface MapEntry {
  key: string;
  /** The project's value where it holds one, else the built-in one. */
  value: unknown;
  /** The extension has it built in: its name is fixed, and it resets rather than being removed. */
  builtIn: boolean;
  /** A built-in entry the project has changed (holds its own value for). */
  changed: boolean;
}

/** The map's built-in entries, or none. */
export function builtInOf(decl: ValueDecl): Readonly<Record<string, unknown>> {
  return decl.type === "map" && isObject(decl.builtIn) ? decl.builtIn : {};
}

/** Every entry to show, built-in first in the manifest's order, then the project's own in its order. */
export function mapEntries(decl: ValueDecl, value: unknown): MapEntry[] {
  const held = isObject(value) ? value : {};
  const builtIn = builtInOf(decl);
  const out: MapEntry[] = Object.keys(builtIn).map((key) => {
    const changed = Object.prototype.hasOwnProperty.call(held, key);
    return { key, value: changed ? held[key] : builtIn[key], builtIn: true, changed };
  });
  for (const key of Object.keys(held)) {
    if (!Object.prototype.hasOwnProperty.call(builtIn, key)) out.push({ key, value: held[key], builtIn: false, changed: false });
  }
  return out;
}

/** Whether a key is taken, by the project or as built in: the adder refuses it. */
export function mapHasKey(decl: ValueDecl, value: unknown, key: string): boolean {
  return (isObject(value) && Object.prototype.hasOwnProperty.call(value, key)) || Object.prototype.hasOwnProperty.call(builtInOf(decl), key);
}

/** The project's map with `key` set to `v`: a built-in entry set back to its built-in value is taken out, as a
 *  reset. Undefined when nothing is left. */
export function setEntry(decl: ValueDecl, value: unknown, key: string, v: unknown): Record<string, unknown> | undefined {
  const next = { ...(isObject(value) ? value : {}) };
  const builtIn = builtInOf(decl);
  if (Object.prototype.hasOwnProperty.call(builtIn, key) && stableStringify(v) === stableStringify(builtIn[key])) delete next[key];
  else next[key] = v;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The project's map without `key`: removing a project entry, or resetting a built-in one. */
export function dropEntry(value: unknown, key: string): Record<string, unknown> | undefined {
  const next = { ...(isObject(value) ? value : {}) };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}
