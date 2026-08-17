// ---------------------------------------------------------------------------
// The version-control surface's pure DOM half: folding a snapshot over the
// shard key(s) an item stands for, the one badge that item flies, painting
// those badges onto rows that already exist, and turning a document's editing
// controls off when somebody else holds its shard.
//
// The family's, for the same reason the main half is: it follows from the app
// SHAPE. Patterpad's #145 grammar, by way of Storyletter's port.
//
// Render-FREE by design, and that is load-bearing: a poll repaints badges
// without rebuilding anything, so a mid-edit document is never disturbed.
//
// The one thing an app must supply is WHAT STAYS LIVE in a locked document
// (`staysLive`): reading a shard somebody else holds must remain fully
// possible, so navigation, disclosure and view switches keep working while the
// writing stops - and only the app knows what those look like in its own
// markup.
// ---------------------------------------------------------------------------

import { icon } from "./icons.js";
import { el } from "./dom.js";

/** One shard's state as the renderer sees it. The app's own DTO will be this
 *  shape (it crosses its own bridge); this is what the view needs. */
export interface ShardVc {
  key: string;
  writable: boolean;
  lockedBy?: string[];
  outOfDate?: boolean;
  /** WE hold it: still ours to edit. */
  checkedOutByMe?: boolean;
  /** Tracked, with uncommitted local changes. */
  dirty?: boolean;
  /** Not in version control yet. */
  untracked?: boolean;
}

/** A snapshot, keyed by shard key. Absent = clean, writable, up to date. */
export type VcMap = ReadonlyMap<string, ShardVc>;

/** Fold the state of the shard key(s) an item stands for (a box row spans its
 *  box + tags + hands shards), most actionable winning: any holder locks it,
 *  any stale shard makes it stale, any read-only shard makes it read-only. */
export function foldVc(shards: VcMap, keys: string | undefined): ShardVc | undefined {
  if (!keys) return undefined;
  let out: ShardVc | undefined;
  for (const key of keys.split(" ")) {
    const s = shards.get(key);
    if (!s) continue;
    out ??= { key, writable: true };
    if (!s.writable) out.writable = false;
    if (s.lockedBy?.length) out.lockedBy = [...new Set([...(out.lockedBy ?? []), ...s.lockedBy])];
    if (s.outOfDate) out.outOfDate = true;
    if (s.checkedOutByMe) out.checkedOutByMe = true;
    if (s.dirty) out.dirty = true;
    if (s.untracked) out.untracked = true;
  }
  return out;
}

/** The one badge an item flies, by priority, or null when there is nothing to
 *  say. Monochrome typographic glyphs (never colour emoji), so each inherits
 *  its themed colour and reads the same in Linen and Baize. */
export function vcBadgeFor(s: ShardVc | undefined): { glyph: string; cls: string; title: string } | null {
  if (s?.lockedBy?.length) return { glyph: icon.locked, cls: "vc-locked", title: `Locked by ${s.lockedBy.join(", ")}` };
  if (s?.outOfDate) return { glyph: icon.down, cls: "vc-stale", title: "Out of date - a newer version is on the server" };
  // The three states of a file that is YOURS, most actionable first. Ordered so
  // the badge answers "what would I do about this?" rather than describing the
  // file: a checkout you are holding matters more than the edits inside it, and
  // both matter more than a file the VCS has never seen.
  if (s?.checkedOutByMe) return { glyph: icon.checkedOut, cls: "vc-mine", title: "Checked out by you" };
  if (s?.dirty) return { glyph: icon.modified, cls: "vc-dirty", title: "Modified - uncommitted local changes" };
  if (s?.untracked) return { glyph: icon.untracked, cls: "vc-new", title: "New - not yet committed" };
  // Read-only on disk with NO other holder is still editable: the save checks
  // it out. Muted, and last, because under a lock-based VCS this is the
  // resting state of everything the author has not touched yet.
  if (s && !s.writable) return { glyph: icon.readOnly, cls: "vc-frozen", title: "Read-only on disk - saving checks it out" };
  return null;
}

/** Repaint the badge on every item under `root` that names a shard (its
 *  `data-vc`). In place: no re-render, so nothing loses focus or scroll. */
export function paintVcBadges(root: ParentNode, shards: VcMap): void {
  root.querySelectorAll<HTMLElement>("[data-vc]").forEach((host) => {
    host.querySelector(":scope > .vc-badge")?.remove();
    const badge = vcBadgeFor(foldVc(shards, host.dataset["vc"]));
    if (!badge) return;
    // `tip` carries the accessible name too, so no separate aria-label.
    const span = el("span", { className: `vc-badge ${badge.cls}`, text: badge.glyph, tip: badge.title });
    host.append(span);
  });
}

type Disableable = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Turn a region's editing controls off - or back on, but only the ones WE
 *  turned off, so a control disabled for its own reasons (the first card's
 *  "previous", a redraw-turns box on "always") stays disabled. */
export function lockControls(host: HTMLElement, off: boolean, staysLive: string): void {
  host.classList.toggle("vc-readonly", off);
  if (off) {
    host.querySelectorAll<Disableable>("input, textarea, select, button").forEach((c) => {
      if (c.disabled || (staysLive !== "" && c.matches(staysLive))) return;
      c.disabled = true;
      c.classList.add("vc-off");
    });
  } else {
    host.querySelectorAll<Disableable>(".vc-off").forEach((c) => { c.disabled = false; c.classList.remove("vc-off"); });
  }
}

/** The notice a locked document opens with: who holds it, and why nothing types. */
export function lockNotice(holders: string[]): HTMLElement {
  return el("div", { className: "vc-lock" },
    el("span", { className: "vc-lock-glyph", text: icon.locked }),
    el("span", { text: `Locked by ${holders.join(", ")} - read-only until they release it.` }));
}
