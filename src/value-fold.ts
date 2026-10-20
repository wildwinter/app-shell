// ---------------------------------------------------------------------------
// An extension's fields folded to the ones a node sets (Pattershot's brief,
// "extension fields folded", rulings F1 to F9, 2026-10-20). An extension meant
// to be left alone on most nodes drew every field on every node, nearly all
// empty. Folded, its section is the caption, with a disclosure and a count,
// and only the fields set; unfolded, every field, as before.
//
// One rule for the family, so Patterpad and Storyletter fold alike:
// - set means the node holds a value that differs from the toolkit's
//   `defaultOf`, compared deeply (`isSet`); a field is set or not as a whole;
// - the fold is per extension, and stays as left while the author moves
//   between nodes (for the session: it isn't stored);
// - a value cleared while folded keeps its row until the author leaves the
//   node (a redraw that doesn't draw it, then `sweep`), so a row never vanishes
//   under the cursor;
// - keys the extension doesn't declare, and the host's lead (a lock line),
//   always show.
//
// The host draws each row (its own cache, classes and problems); this draws
// the section around them. Project Settings doesn't fold: it's where an
// author goes to set things, and draws its rows directly.
// ---------------------------------------------------------------------------

import { defaultOf, stableStringify } from "@wildwinter/toolkit/extensions";
import type { TypeDecl } from "@wildwinter/toolkit/extensions";
import { el } from "./dom.js";
import { iconNode } from "./icons.js";
import type { ValueDecl } from "./value-rows.js";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Whether a node's value for `decl` is set: held, and not the declaration's default. A record counts as its
 * default when each of its fields does and it holds no other key, so `{}` and a record of defaults are both
 * unset; anything else is compared with `defaultOf`, deeply and regardless of key order.
 */
export function isSet(decl: ValueDecl, value: unknown): boolean {
  if (value === undefined) return false;
  if (decl.type === "record" && decl.default === undefined && isObject(value)) {
    const fields = decl.fields ?? [];
    const declared = new Set(fields.map((f) => f.name));
    if (Object.entries(value).some(([k, v]) => !declared.has(k) && v !== undefined)) return true;
    return fields.some((f) => isSet(f, value[f.name]));
  }
  return stableStringify(value) !== stableStringify(defaultOf(decl as unknown as TypeDecl));
}

export interface FoldSectionOptions {
  /** The extension's id: the fold is remembered by it. */
  extension: string;
  /** The extension's name, the caption. */
  caption: string;
  /** The node the section is for, by any key unique to it: a row cleared while folded stays while the host
   *  keeps drawing this node. */
  node: string;
  /** The extension's fields for the node's kind, in the manifest's order. */
  fields: readonly ValueDecl[];
  /** The node's values for the extension, or undefined where it holds none. */
  entry: Record<string, unknown> | undefined;
  /** One field's row, drawn by the host. */
  row: (decl: ValueDecl) => HTMLElement;
  /** A heading above the first shown field of a group. */
  group: (name: string) => HTMLElement;
  /** Shown above the rows, folded or not (a lock line). */
  lead?: readonly HTMLElement[];
  /** Shown after the rows, folded or not (keys the extension doesn't declare). */
  tail?: readonly HTMLElement[];
  /** The section's own class, beside `shell-fold`. */
  className?: string;
  /** The caption's class, beside `shell-fold-cap`. */
  captionClassName?: string;
}

export interface ExtensionFold {
  /** Draw one extension's section for one node: the caption and disclosure, then the rows the fold shows. */
  section(o: FoldSectionOptions): HTMLElement;
  /** Whether an extension's section is open (every field). Folded until opened. */
  isOpen(extension: string): boolean;
  setOpen(extension: string, open: boolean): void;
  /** After a redraw: forget the rows kept for nodes it didn't draw, so leaving a node and coming back shows
   *  only what is set. A host that redraws its whole view calls it at the end of each, as a row cache's. */
  sweep(): void;
}

/** The caption's words: the name, and the count when anything is set. */
export function foldCaption(name: string, set: number): string {
  return set > 0 ? `${name} (${set} set)` : name;
}

/**
 * The fold for a host's inspector: one per host, kept across its redraws, so the fold stays as left from node
 * to node.
 */
export function extensionFold(): ExtensionFold {
  const open = new Set<string>();
  // Per extension and node: the fields shown while folded, so a value cleared there keeps its row until the
  // author moves on. An inspector shows several nodes at once (a line, its block, its scene), so each keeps
  // its own; `sweep` drops the ones a redraw didn't draw.
  const shown = new Map<string, { fields: Set<string>; used: boolean }>();
  const keyOf = (o: FoldSectionOptions): string => `${o.extension}\u0000${o.node}`;

  const visible = (o: FoldSectionOptions, setNames: ReadonlySet<string>): Set<string> => {
    const was = shown.get(keyOf(o));
    const fields = was ? new Set([...was.fields, ...setNames]) : new Set(setNames);
    shown.set(keyOf(o), { fields, used: true });
    return fields;
  };

  const fold: ExtensionFold = {
    isOpen: (extension) => open.has(extension),
    setOpen(extension, on) {
      if (on) open.add(extension); else open.delete(extension);
      // Folding again starts from what is set now.
      for (const key of shown.keys()) if (key.startsWith(`${extension}\u0000`)) shown.delete(key);
    },
    sweep() {
      for (const [key, entry] of shown) { if (!entry.used) shown.delete(key); else entry.used = false; }
    },
    section(o) {
      const sec = el("div", `shell-fold${o.className ? ` ${o.className}` : ""}`);
      sec.dataset["extension"] = o.extension;
      const cap = el("button", `shell-fold-cap${o.captionClassName ? ` ${o.captionClassName}` : ""}`);
      cap.type = "button";
      const body = el("div", "shell-fold-body");
      sec.append(cap, body);

      const draw = (): void => {
        const isOpen = open.has(o.extension);
        const setNames = new Set(o.fields.filter((f) => isSet(f, o.entry?.[f.name])).map((f) => f.name));
        const show = isOpen ? undefined : visible(o, setNames);
        cap.replaceChildren(iconNode(isOpen ? "expanded" : "collapsed"), el("span", "shell-fold-name", foldCaption(o.caption, setNames.size)));
        cap.setAttribute("aria-expanded", String(isOpen));
        cap.dataset["tip"] = isOpen ? `Show only the fields set here` : `Show every ${o.caption} field`;
        sec.classList.toggle("shell-fold-open", isOpen);
        const rows: HTMLElement[] = [...(o.lead ?? [])];
        let group: string | undefined;
        for (const decl of o.fields) {
          if (show && !show.has(decl.name)) continue;
          const g = (decl as { group?: string }).group;
          if (g !== undefined && g !== group) { group = g; rows.push(o.group(g)); }
          rows.push(o.row(decl));
        }
        rows.push(...(o.tail ?? []));
        body.replaceChildren(...rows);
      };
      cap.addEventListener("click", () => { fold.setOpen(o.extension, !open.has(o.extension)); draw(); });
      draw();
      return sec;
    },
  };
  return fold;
}
