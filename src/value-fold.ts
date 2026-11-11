// ---------------------------------------------------------------------------
// An extension's fields folded to the ones a node sets (Pattershot's brief,
// "extension fields folded", rulings F1 to F9, 2026-10-20). An extension meant
// to be left alone on most nodes drew every field on every node, nearly all
// empty. Folded, its section is the caption, with a disclosure and a count of
// what the node sets; unfolded, every field, as before. Closed means closed
// (Pattershot's brief extension-section-closed-and-built-in-map-entries, Ian,
// 2026-11-11): a folded section used to show its set fields too, and a writer
// seeing some took the section for open and the rest for missing.
//
// One rule for the family, so Patterpad and Storyletter fold alike:
// - set means the node holds a value that differs from the toolkit's
//   `defaultOf`, compared deeply (`isSet`); a field is set or not as a whole;
// - the fold is per extension and kind of node (a line's, a block's), and
//   stays as left while the author moves between nodes (for the session: it
//   isn't stored);
// - a closed section's caption counts its problems and says the first, since
//   closed it draws no row to say them;
// - a host with an Add menu draws only the sections `drawn` says to, and
//   offers the rest there (design/proposals/inspector-one-door.md, P1 to P7);
// - keys the extension doesn't declare (the host's tail) count as set, and
//   show only when open; the host's lead (a lock line) always shows.
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
  /** The node the section is for, by any key unique to it: the open section's closed groups keep their rows while the host
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
  /** The kind of node ("line", "block", "scene"): the section's open state is remembered by extension and kind,
   *  so opening it on a line leaves the block's and the scene's closed. Absent: by extension alone. */
  kind?: string;
  /** The problems in the node's values for the extension, as sentences. A closed section's caption counts them
   *  and says the first as its rollover, since closed it draws no row to say them. */
  problems?: readonly string[];
  /** Called after the caption opens or closes the section: a host that leaves out sections that aren't `drawn`
   *  redraws here, so one closed with nothing set goes back to its Add menu. */
  onToggle?: (open: boolean) => void;
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
  /** Whether an extension's section is open (every field) on a kind of node. Folded until opened. */
  isOpen(extension: string, kind?: string): boolean;
  setOpen(extension: string, open: boolean, kind?: string): void;
  /** Whether a node has anything to show for an extension: the section is open, or the node sets something, or
   *  there's a problem to say. A host with an Add menu draws only these, and offers the rest there by the
   *  extension's name ("you see what's attached, and Add offers the rest", patterkit
   *  design/proposals/inspector-one-door.md). Takes what `section` takes. */
  drawn(o: Pick<FoldSectionOptions, "extension" | "kind" | "fields" | "entry" | "tail" | "problems">): boolean;
  /** After a redraw: forget what the open section's closed groups kept for nodes it didn't draw (the groups'
   *  `sweep`). A host that redraws its whole view calls it at the end of each, as a row cache's. */
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
  /** Every field's row in the manifest's order, a heading wherever the group changes. A group that can be closed
   *  holds only its fields at their defaults: the ones set here are drawn above its heading, with the fields
   *  outside it, so closed it is its heading alone and opening it reveals exactly what was hidden. A field moves
   *  only when the group closes or the node changes, never while it's being edited; a group with every field set
   *  has no heading. Opening or closing one redraws its rows in place. */
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
  /** Per node and group: the fields drawn above the heading, as they were set when the group last settled (when
   *  the node was first drawn, or the group closed). Fixed in between, so a field doesn't move while it's edited. */
  const promoted = new Map<string, { fields: Set<string>; used: boolean }>();
  const openKey = (extension: string, group: string): string => `${extension}\u0000${group}`;

  const groups: FieldGroups = {
    isOpen: (extension, group) => open.has(openKey(extension, group)),
    setOpen(extension, group, on) {
      const key = openKey(extension, group);
      if (on) open.add(key); else open.delete(key);
      // Closing settles the group: what is set now moves above its heading next time it draws.
      if (!on) for (const k of promoted.keys()) if (k.startsWith(`${extension}\u0000`) && k.endsWith(`\u0000${group}`)) promoted.delete(k);
    },
    sweep() {
      for (const [key, entry] of promoted) { if (!entry.used) promoted.delete(key); else entry.used = false; }
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
        // The fields set here when the group settled, drawn last before its heading in the manifest's order.
        const key = `${o.extension}\u0000${o.node}\u0000${g}`;
        let above = promoted.get(key);
        if (!above) {
          above = { fields: new Set(o.fields.filter((f) => groupOf(f) === g && isSet(f, o.entry?.[f.name])).map((f) => f.name)), used: true };
          promoted.set(key, above);
        }
        above.used = true;
        const fixed = above.fields;
        const top = el("div", "shell-group-above");
        const heading = o.group(g);
        heading.classList.add("shell-group");
        const cap = el("button", "shell-group-cap");
        cap.type = "button";
        heading.replaceChildren(cap);
        const body = el("div", "shell-group-body");
        const draw = (): void => {
          const isOpen = groups.isOpen(o.extension, g);
          const inside = run.fields.filter((d) => !fixed.has(d.name));
          top.replaceChildren(...run.fields.filter((d) => fixed.has(d.name)).map((d) => o.row(d)));
          cap.replaceChildren(iconNode(isOpen ? "expanded" : "collapsed"), el("span", "shell-group-name", g));
          cap.setAttribute("aria-expanded", String(isOpen));
          cap.dataset["tip"] = isOpen ? `Hide the ${g} fields left at their defaults` : `Show the ${g} fields left at their defaults`;
          heading.classList.toggle("shell-group-open", isOpen);
          // A group whose every field is set has nothing to hold, so no heading.
          heading.hidden = inside.length === 0;
          body.replaceChildren(...(isOpen ? inside.map((d) => o.row(d)) : []));
        };
        const list = redraws.get(g) ?? [];
        list.push(draw);
        redraws.set(g, list);
        cap.addEventListener("click", () => {
          const closing = groups.isOpen(o.extension, g);
          groups.setOpen(o.extension, g, !closing);
          // Closing settles it: what's set now goes above the heading, what was cleared back into the group.
          if (closing) {
            fixed.clear();
            for (const f of o.fields) if (groupOf(f) === g && isSet(f, o.entry?.[f.name])) fixed.add(f.name);
          }
          for (const d of redraws.get(g) ?? []) d();
        });
        draw();
        out.push(top, heading, body);
      }
      return out;
    },
  };
  return groups;
}

/** The caption's words: the name, then what's set and what's wrong, when there's either:
 *  "Pattershot (2 set, 1 problem)". */
export function foldCaption(name: string, set: number, problems = 0): string {
  const parts = [
    ...(set > 0 ? [`${set} set`] : []),
    ...(problems > 0 ? [`${problems} ${problems === 1 ? "problem" : "problems"}`] : []),
  ];
  return parts.length > 0 ? `${name} (${parts.join(", ")})` : name;
}

/**
 * The fold for a host's inspector: one per host, kept across its redraws, so the fold stays as left from node
 * to node.
 */
export function extensionFold(): ExtensionFold {
  const open = new Set<string>();
  const openKey = (extension: string, kind?: string): string => `${extension}\u0000${kind ?? ""}`;
  /** Everything the node holds for the extension: its set fields, and the keys it no longer declares (the tail,
   *  one row each). */
  const setCount = (o: Pick<FoldSectionOptions, "fields" | "entry" | "tail">): number =>
    o.fields.filter((f) => isSet(f, o.entry?.[f.name])).length + (o.tail?.length ?? 0);
  const groups = fieldGroups();
  const fold: ExtensionFold = {
    groups,
    isOpen: (extension, kind) => open.has(openKey(extension, kind)),
    setOpen(extension, on, kind) { if (on) open.add(openKey(extension, kind)); else open.delete(openKey(extension, kind)); },
    drawn: (o) => open.has(openKey(o.extension, o.kind)) || setCount(o) > 0 || (o.problems?.length ?? 0) > 0,
    sweep() { groups.sweep(); },
    section(o) {
      const sec = el("div", `shell-fold${o.className ? ` ${o.className}` : ""}`);
      sec.dataset["extension"] = o.extension;
      const cap = el("button", `shell-fold-cap${o.captionClassName ? ` ${o.captionClassName}` : ""}`);
      cap.type = "button";
      const body = el("div", "shell-fold-body");
      sec.append(cap, body);
      const key = openKey(o.extension, o.kind);

      const draw = (): void => {
        const isOpen = open.has(key);
        const problems = o.problems ?? [];
        cap.replaceChildren(iconNode(isOpen ? "expanded" : "collapsed"), el("span", "shell-fold-name", foldCaption(o.caption, setCount(o), problems.length)));
        cap.setAttribute("aria-expanded", String(isOpen));
        // Closed, the caption is the only place a problem inside can be said.
        cap.dataset["tip"] = isOpen ? `Hide the ${o.caption} fields`
          : problems.length > 0 ? `${problems[0]}\nShow the ${o.caption} fields` : `Show the ${o.caption} fields`;
        cap.classList.toggle("has-problem", problems.length > 0);
        sec.classList.toggle("shell-fold-open", isOpen);
        // Closed means closed: the caption and its count, and the lead (a lock line says why nothing can be
        // edited), but no fields.
        const rows: HTMLElement[] = [...(o.lead ?? [])];
        if (isOpen) {
          rows.push(...groups.rows({ extension: o.extension, node: o.node, fields: o.fields, entry: o.entry, row: o.row, group: o.group,
            ...(o.closed ? { closed: o.closed } : {}) }));
          rows.push(...(o.tail ?? []));
        }
        body.replaceChildren(...rows);
      };
      cap.addEventListener("click", () => {
        const next = !open.has(key);
        fold.setOpen(o.extension, next, o.kind);
        draw();
        o.onToggle?.(next);
      });
      draw();
      return sec;
    },
  };
  return fold;
}
