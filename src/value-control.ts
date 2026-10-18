// ---------------------------------------------------------------------------
// Typed value controls: how both apps show and set a value of a declared type.
//
// The first is the quality's. A quality is a step on a ladder, so its value is
// shown as the LADDER, with the current rung marked, rather than a dropdown that
// shows one name and hides where it stands (patterkit design/proposals/
// patter-qualities.md section 4). Storyletter's Board drew it this way first;
// it lives here so Storyletter's Fields tab, Patterpad's play panel and Game
// Data rows, and the play inspectors all draw the same strip.
//
// An UNSET value (a field or game-data value the node leaves out) names what it
// falls back to, "default (x)", by the family's one rule: the declaration's own
// default, else the type's (a quality's first stage). A value that is no longer
// a stage (a deleted one) is shown as such, so it can be put back on the ladder.
//
// No Electron, no app state: this module is DOM only, and is its own entry point
// (`@wildwinter/app-shell/value-control`) so a play inspector outside the apps
// can take it.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

/** A declaration as these controls read it: a property's, a field's or a game-data field's. */
export interface ValueDeclLike {
  type: string;
  default?: unknown;
  /** enum / flags */
  values?: readonly string[];
  /** quality: the ladder, in order */
  stages?: readonly string[];
}

/**
 * What an unset value of `decl` falls back to, as the words a control shows: its own default where it has
 * one, else its type's (False, 0, the first value, no flags, the first stage, empty text). The kernel's
 * `defaultFor`, in words; a host reads the same value from the bundle.
 */
export function fallbackText(decl: ValueDeclLike): string {
  const d = decl.default;
  if (d !== undefined && d !== null) {
    if (typeof d === "boolean") return d ? "True" : "False";
    if (Array.isArray(d)) return d.length === 0 ? "none" : d.join(", ");
    return d === "" ? "none" : String(d);
  }
  switch (decl.type) {
    case "boolean": return "False";
    case "number": return "0";
    case "enum": return decl.values?.[0] ?? "none";
    case "quality": return decl.stages?.[0] ?? "first stage";
    case "flags": return "none";
    default: return "empty";
  }
}

/** The label an unset value shows: "default (x)", naming what it falls back to. */
export const defaultLabel = (decl: ValueDeclLike): string => `default (${fallbackText(decl)})`;

/**
 * The quiet line under a ladder that has just been reordered: how many gates order against it. A reorder
 * changes no value, and is the one edit that changes what a gate MEANS without saying so (patter-qualities.md
 * section 2), so the editor says so. Empty when no gate orders the quality.
 */
export function stageGateNote(gates: number): string {
  if (gates <= 0) return "";
  return gates === 1
    ? "1 gate compares against this ladder, and it now reads the new order."
    : `${gates} gates compare against this ladder, and each now reads the new order.`;
}

export interface RungStripOptions {
  /** The ladder, in order. */
  stages: readonly string[];
  /** The value held, or undefined when unset: a field or game-data value the node leaves out. */
  value: string | undefined;
  /** The declaration, for what an unset value falls back to (its default, else the first stage). */
  decl?: ValueDeclLike;
  /** Pick a stage. Absent: the strip is read-only. */
  onPick?: (stage: string) => void;
  /** Clear back to unset. With it, the strip leads with "default (x)", which clears the value. */
  onClear?: () => void;
  /** The rollover on a rung that is not the current one (default: `Set to "x"`). */
  pickTip?: (stage: string) => string;
  /**
   * The document to build in, for a host outside the apps (a play inspector in a page or a frame of its
   * own). Given, rollovers are plain `title`s and the family's themed tooltips are not mounted; the host
   * styles `.seg`, `.seg-opt` and `.shell-rung` itself. Absent: the apps' document and themed rollovers.
   */
  doc?: Document;
}

/**
 * A quality's value as its ladder: one rung per stage, in order, the current one marked (`on`). Unset, the
 * rung it falls back to is marked as the fallback (`fallback`), and with `onClear` a leading "default (x)"
 * option is the current choice. A value that is not a stage (a deleted one) is shown after the ladder,
 * marked `stray`, until a rung is picked.
 */
export function rungStrip(opts: RungStripOptions): HTMLElement {
  const make = opts.doc === undefined ? el : (tag: "span" | "button", props: { className: string; text?: string; tip?: string; onClick?: () => void }) => {
    const node = opts.doc!.createElement(tag);
    node.className = props.className;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.tip !== undefined) { node.title = props.tip; node.setAttribute("aria-label", props.tip); }
    if (props.onClick) node.addEventListener("click", props.onClick);
    if (tag === "button") (node as HTMLButtonElement).type = "button";
    return node;
  };
  const strip = make("span", { className: "seg shell-rungs" });
  const decl: ValueDeclLike = opts.decl ?? { type: "quality", stages: opts.stages };
  const unset = opts.value === undefined;
  const fallback = typeof decl.default === "string" && opts.stages.includes(decl.default) ? decl.default : opts.stages[0];
  const readOnly = opts.onPick === undefined;
  if (opts.onClear) {
    strip.append(make("button", {
      className: `seg-opt shell-rung shell-rung-default${unset ? " on" : ""}`, text: defaultLabel(decl),
      tip: unset ? "Not set here: the declared default holds" : "Clear the value, back to the default",
      onClick: () => { if (!unset) opts.onClear!(); },
    }));
  }
  for (const stage of opts.stages) {
    const current = opts.value === stage;
    const falls = unset && stage === fallback;
    const rung = make(readOnly ? "span" : "button", {
      className: `seg-opt shell-rung${current ? " on" : ""}${falls ? " fallback" : ""}`, text: stage,
      tip: current ? "The current stage" : falls ? "The stage it falls back to" : readOnly ? stage : (opts.pickTip?.(stage) ?? `Set to "${stage}"`),
      ...(readOnly ? {} : { onClick: () => { if (!current) opts.onPick!(stage); } }),
    });
    strip.append(rung);
  }
  if (!unset && !opts.stages.includes(opts.value!)) {
    strip.append(make("span", {
      className: "seg-opt shell-rung stray on", text: opts.value!,
      tip: `"${opts.value}" is not one of the stages: pick the one it belongs at now`,
    }));
  }
  return strip;
}
