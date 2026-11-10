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
//
// A group can start closed (the manifest's `groups`, Pattershot's brief
// "extension-closed-field-groups", 2026-11-10): within an open section, and
// in Project Settings, a closed group is its heading as a disclosure with the
// same count, and only the fields the node sets, by the same rules; opened,
// every field. Remembered per extension and group for the session. `fieldGroups`
// draws a list of rows so; the fold uses it when open, and Settings directly.
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
  /** Whether a group starts closed (the toolkit's `groupClosed` on the extension's manifest). Absent: none do. */
  closed?: (group: string) => boolean;
  /** The section's own class, beside `shell-fold`. */
  className?: string;
  /** The caption's class, beside `shell-fold-cap`. */
  captionClassName?: string;
}

export interface ExtensionFold {
  /** Draw one extension's section for one node: the caption and disclosure, then the rows the fold shows. */
  section(o: FoldSectionOptions): HTMLElement;
  /** The section's closed groups, drawn while it's open: their state, kept as the fold's. */
  readonly groups: FieldGroups;
  /** Whether an extension's section is open (every field). Folded until opened. */
  isOpen(extension: string): boolean;
  setOpen(extension: string, open: boolean): void;
  /** After a redraw: forget the rows kept for nodes it didn't draw, so leaving a node and coming back shows
   *  only what is set. A host that redraws its whole view calls it at the end of each, as a row cache's. */
  sweep(): void;
}

export interface GroupRowsOptions {
  /** The extension's id: a group's state is remembered by it and the group's name. */
  extension: string;
  /** The node the rows are for, by any key unique to it (as the fold's `node`). */
  node: string;
  /** The extension's fields for the node's kind, in the manifest's order. */
  fields: readonly ValueDecl[];
  /** The node's values for the extension, or undefined where it holds none. */
  entry: Record<string, unknown> | undefined;
  /** One field's row, drawn by the host. */
  row: (decl: ValueDecl) => HTMLElement;
  /** A group's heading, drawn by the host. A closed group's is given a disclosure button as its content. */
  group: (name: string) => HTMLElement;
  /** Whether a group starts closed. Absent: none do, and every group is a plain heading. */
  closed?: (group: string) => boolean;
}

export interface FieldGroups {
  /** Every field's row in the manifest's order, a heading wherever the group changes; a closed group's heading a
   *  disclosure counting what's set, with only the set fields under it. Opening or closing one redraws its rows
   *  in place. */
  rows(o: GroupRowsOptions): HTMLElement[];
  /** Whether a group that starts closed has been opened. */
  isOpen(extension: string, group: string): boolean;
  setOpen(extension: string, group: string, open: boolean): void;
  /** After a redraw: forget the rows kept for nodes it didn't draw, as the fold's `sweep`. */
  sweep(): void;
}

/** The group a field is in, if any. */
const groupOf = (decl: ValueDecl): string | undefined => (decl as { group?: string }).group;

/**
 * Closed groups for a host's view: one per view, kept across its redraws, so a group stays open from node to
 * node. The inspector's comes with its fold; Project Settings keeps one of its own.
 */
export function fieldGroups(): FieldGroups {
  const open = new Set<string>();
  const shown = new Map<string, { fields: Set<string>; used: boolean }>();
  const openKey = (extension: string, group: string): string => `${extension}\u0000${group}`;

  const groups: FieldGroups = {
    isOpen: (extension, group) => open.has(openKey(extension, group)),
    setOpen(extension, group, on) {
      const key = openKey(extension, group);
      if (on) open.add(key); else open.delete(key);
      // Closing again starts from what is set now.
      for (const k of shown.keys()) if (k.startsWith(`${extension}\u0000`) && k.endsWith(`\u0000${group}`)) shown.delete(k);
    },
    sweep() {
      for (const [key, entry] of shown) { if (!entry.used) shown.delete(key); else entry.used = false; }
    },
    rows(o) {
      // Runs: a group's fields together, as the manifest orders them. A group whose fields come apart is two runs
      // under one state.
      const runs: { group: string | undefined; fields: ValueDecl[] }[] = [];
      for (const decl of o.fields) {
        const g = groupOf(decl);
        const last = runs[runs.length - 1];
        if (last && last.group === g) last.fields.push(decl);
        else runs.push({ group: g, fields: [decl] });
      }
      const out: HTMLElement[] = [];
      const redraws = new Map<string, (() => void)[]>();
      for (const run of runs) {
        const g = run.group;
        if (g === undefined) { out.push(...run.fields.map((d) => o.row(d))); continue; }
        if (!o.closed?.(g)) { out.push(o.group(g), ...run.fields.map((d) => o.row(d))); continue; }
        const heading = o.group(g);
        heading.classList.add("shell-group");
        const cap = el("button", "shell-group-cap");
        cap.type = "button";
        heading.replaceChildren(cap);
        const body = el("div", "shell-group-body");
        const shownKey = `${o.extension}\u0000${o.node}\u0000${g}`;
        const draw = (): void => {
          const isOpen = groups.isOpen(o.extension, g);
          // The count is the whole group's, across its runs.
          const set = o.fields.filter((f) => groupOf(f) === g && isSet(f, o.entry?.[f.name])).map((f) => f.name);
          let show: Set<string> | undefined;
          if (!isOpen) {
            const was = shown.get(shownKey);
            show = was ? new Set([...was.fields, ...set]) : new Set(set);
            shown.set(shownKey, { fields: show, used: true });
          }
          cap.replaceChildren(iconNode(isOpen ? "expanded" : "collapsed"), el("span", "shell-group-name", foldCaption(g, set.length)));
          cap.setAttribute("aria-expanded", String(isOpen));
          cap.dataset["tip"] = isOpen ? `Show only the ${g} fields set here` : `Show every ${g} field`;
          heading.classList.toggle("shell-group-open", isOpen);
          body.replaceChildren(...run.fields.filter((d) => !show || show.has(d.name)).map((d) => o.row(d)));
        };
        const list = redraws.get(g) ?? [];
        list.push(draw);
        redraws.set(g, list);
        cap.addEventListener("click", () => {
          groups.setOpen(o.extension, g, !groups.isOpen(o.extension, g));
          for (const d of redraws.get(g) ?? []) d();
        });
        draw();
        out.push(heading, body);
      }
      return out;
    },
  };
  return groups;
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

  const groups = fieldGroups();
  const fold: ExtensionFold = {
    groups,
    isOpen: (extension) => open.has(extension),
    setOpen(extension, on) {
      if (on) open.add(extension); else open.delete(extension);
      // Folding again starts from what is set now.
      for (const key of shown.keys()) if (key.startsWith(`${extension}\u0000`)) shown.delete(key);
    },
    sweep() {
      for (const [key, entry] of shown) { if (!entry.used) shown.delete(key); else entry.used = false; }
      groups.sweep();
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
        if (show) {
          // Folded: the set fields, each group's under a plain heading; a group's closing applies once it's open.
          let group: string | undefined;
          for (const decl of o.fields) {
            if (!show.has(decl.name)) continue;
            const g = groupOf(decl);
            if (g !== undefined && g !== group) { group = g; rows.push(o.group(g)); }
            rows.push(o.row(decl));
          }
        } else {
          rows.push(...groups.rows({ extension: o.extension, node: o.node, fields: o.fields, entry: o.entry, row: o.row, group: o.group,
            ...(o.closed ? { closed: o.closed } : {}) }));
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
