// ---------------------------------------------------------------------------
// The clash resolver: one place to settle what a merge couldn't.
//
// When a pack merge (or a git merge driver) clashes, each app's merged shard
// keeps OUR side and records the clash under its reserved `unresolved` key (the
// travelling record: path, kind, base, ours, theirs), and a sidecar may say
// more. Before this the author hand-edited files. Both families write the same
// shape, so the reading of it is the app's and the drawing is the shell's
// (hands-on review of October 2026, ruling Q21).
//
// THE SEAM: a clash is an opaque id plus display text. Where it is, how a value
// reads, and which kinds can be set as a value are the app's (its adapter);
// so is every write. The shell never touches a file: each decision is a call
// to the adapter, which makes it one undoable step through the app's own
// writer and answers with the clashes left, as the comments popover's
// callbacks answer with the threads.
//
// A DIALOG, on the family's frame, rather than a pane: settling clashes is a
// task you enter and leave, the frame already gives Escape, the focus trap and
// focus back (returnFocus and the fallback), and a pane would be a third
// column in two apps whose layouts differ. Edit is the one verb that needs the
// app, so it closes the dialog and then asks the app to go there; the clash it
// was asked about shows Mark resolved when the resolver opens again (from the
// banner or the menu).
//
// Styles: dialog.css and controls.css for the frame and the buttons,
// clashes.css for the clash list and the banner.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { dialogFrame } from "./dialog.js";
import type { ReturnFocus } from "./dialog.js";
import { canTakeFocus } from "./focus.js";
import { toast } from "./toast.js";

/** Which side of a clash to keep. */
export type ClashSide = "ours" | "theirs";

/** One unresolved clash, as the app's adapter presents it: family-neutral, and
 *  already turned into words. */
export interface Clash {
  /** The adapter's id, unique in the project (a shard and a path, say). */
  id: string;
  /** Where it is, for a person: "Scene Tavern, Ann's second line". */
  where: string;
  /** The travelling record's path (`cards[c_1].priority`), shown small. */
  path: string;
  /** The record's kind: "both-changed", "delete-vs-edit", "added-both",
   *  "structural", or a family's own ("moved"). */
  kind: string;
  /** How to say the kind, when the app has better words than the shell's
   *  (see `clashKindLabel`); needed for a family's own kinds. */
  kindLabel?: string;
  /** Our side as display text; absent when our side has no value. */
  ours?: string;
  /** Their side as display text; absent when their side has no value. */
  theirs?: string;
  /** The common ancestor as display text, when the app wants it shown. */
  base?: string;
  /** Whether "Take theirs" can be written as a value. False for a clash that
   *  isn't one value (Patter's `moved`, a structural clash): the resolver then
   *  offers only Keep mine and Edit. */
  settable: boolean;
  /** More from the sidecar, when there is one: a sentence, shown under the sides. */
  detail?: string;
}

/** What a decision answers: every clash still unresolved, as the project now stands. */
export type ClashesAfter = readonly Clash[] | Promise<readonly Clash[]>;

/** The app's half. Every write goes through the app; the shell only asks. */
export interface ClashAdapter {
  /** Every unresolved clash in the project (the `unresolved` entries, with the
   *  sidecar's detail where there is one). */
  list(): ClashesAfter;
  /** Keep mine ("ours": clear the mark, the shard already holds our side) or
   *  Take theirs ("theirs": write their value and clear the mark), as one
   *  undoable step. Answers with the clashes left. "theirs" is only asked of a
   *  clash that is `settable`. */
  resolve(id: string, side: ClashSide): ClashesAfter;
  /** Go to the place, so the author can edit it by hand. Called once the
   *  resolver has closed, so the app's own focus lands last. */
  edit(id: string): void;
  /** The author has edited it: clear the mark, keeping what is there now, as
   *  one undoable step. Answers with the clashes left. */
  markResolved(id: string): ClashesAfter;
}

export interface ClashResolverOptions {
  adapter: ClashAdapter;
  /** Where focus goes when the resolver closes (not after Edit, where the app
   *  takes it), ahead of the opener (see `DialogFrameOptions.returnFocus`). */
  returnFocus?: ReturnFocus;
  /** Every list the resolver receives, so the app can update its banner and
   *  its menu item as clashes go. */
  onChange?: (clashes: readonly Clash[]) => void;
  /** Runs once, after the resolver has closed, however it closed (before an
   *  Edit's `adapter.edit`). */
  onClose?: () => void;
}

export interface ClashResolver {
  readonly dialog: HTMLDialogElement;
  /** Ask the adapter again (after an undo, or a reload under the resolver). */
  refresh(): Promise<void>;
  close(): void;
  isOpen(): boolean;
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  "both-changed": "Both sides changed it",
  "delete-vs-edit": "Deleted on one side, edited on the other",
  "added-both": "Added on both sides",
  "structural": "The merged result doesn't hold together",
};

/** The shell's words for a clash kind: the clash's own `kindLabel` when it has
 *  one, the shared kinds' sentence otherwise, and the kind itself as a last resort. */
export function clashKindLabel(clash: Pick<Clash, "kind" | "kindLabel">): string {
  return clash.kindLabel ?? KIND_LABELS[clash.kind] ?? clash.kind;
}

/** "1 unresolved clash", "3 unresolved clashes". */
export function clashCountText(count: number): string {
  return `${count} unresolved ${count === 1 ? "clash" : "clashes"}`;
}

// The clashes Edit was pressed on, by id, so the resolver opened again shows
// Mark resolved on them. Module-wide rather than per resolver, because Edit
// closes the resolver; an id leaves when a list arrives without it.
const edited = new Set<string>();

/** Open the clash resolver. Appended at once; lists the adapter's clashes as
 *  soon as `list()` answers. */
export function openClashResolver(opts: ClashResolverOptions): ClashResolver {
  const { adapter } = opts;
  let clashes: readonly Clash[] = [];
  let loaded = false;
  let busy = false;
  let closed = false;
  let editAfterClose: string | undefined;

  const frame = dialogFrame({
    title: "Resolve clashes",
    sub: "A merge kept your side of each of these. Keep it, take theirs, or edit it yourself.",
    className: "shell-clashes",
    // After Edit the app takes focus; giving it back to the opener first is
    // harmless, since `adapter.edit` runs after.
    ...(opts.returnFocus ? { returnFocus: opts.returnFocus } : {}),
    onClose: () => {
      closed = true;
      opts.onClose?.();
      const id = editAfterClose;
      editAfterClose = undefined;
      if (id !== undefined) adapter.edit(id);
    },
  });

  const status = el("p", "shell-clash-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const list = el("div", "shell-clash-list");
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", "Clashes");
  frame.body.append(status, list);

  const done = el("button", "btn", "Close");
  done.type = "button";
  done.addEventListener("click", () => frame.close());
  frame.actions.append(done);

  const cards = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>(".shell-clash")];

  /** Make card `i` the one Tab reaches in the list, and optionally focus it. */
  const rove = (i: number, focus: boolean): void => {
    const all = cards();
    if (all.length === 0) { if (focus) done.focus(); return; }
    const at = Math.max(0, Math.min(i, all.length - 1));
    all.forEach((c, n) => { c.tabIndex = n === at ? 0 : -1; });
    if (focus) all[at]!.focus();
  };

  const side = (label: string, text: string | undefined, cls: string): HTMLElement => {
    const box = el("div", `shell-clash-side ${cls}`);
    box.append(el("div", "shell-clash-side-label", label));
    box.append(text === undefined
      ? el("div", "shell-clash-text absent", "Absent on this side")
      : el("div", "shell-clash-text", text === "" ? "(empty)" : text));
    return box;
  };

  const button = (label: string, cls: string, run: () => void): HTMLButtonElement => {
    const b = el("button", `btn ${cls}`.trim(), label);
    b.type = "button";
    b.disabled = busy;
    b.addEventListener("click", run);
    return b;
  };

  const render = (focusAt?: number): void => {
    // Whatever had focus in the list, by position, so a redraw keeps the place.
    const was = cards().findIndex((c) => c.contains(document.activeElement));
    list.replaceChildren();
    if (!loaded) { status.textContent = "Reading the project…"; return; }
    status.textContent = clashes.length === 0 ? "No clashes left." : `${clashCountText(clashes.length)}.`;
    status.classList.toggle("empty", clashes.length === 0);

    clashes.forEach((clash, i) => {
      const kind = clashKindLabel(clash);
      const card = el("section", "shell-clash");
      card.setAttribute("role", "listitem");
      card.setAttribute("aria-label", `${clash.where}: ${kind}`);
      card.dataset.clashId = clash.id;
      card.tabIndex = -1;

      const head = el("div", "shell-clash-head",
        el("span", "shell-clash-where", clash.where),
        el("span", "shell-clash-kind", kind));
      const path = el("div", "shell-clash-path", clash.path);
      const sides = el("div", "shell-clash-sides",
        side("Mine", clash.ours, "ours"),
        side("Theirs", clash.theirs, "theirs"));
      card.append(head, path);
      if (clash.base !== undefined) card.append(el("div", "shell-clash-base", `Before the merge: ${clash.base === "" ? "(empty)" : clash.base}`));
      card.append(sides);
      if (clash.detail !== undefined && clash.detail !== "") card.append(el("p", "shell-clash-detail", clash.detail));

      const actions = el("div", "shell-clash-actions");
      const wasEdited = edited.has(clash.id);
      if (wasEdited) {
        actions.append(button("Mark resolved", "primary", () => decide(i, () => adapter.markResolved(clash.id))));
      }
      actions.append(button("Keep mine", "", () => decide(i, () => adapter.resolve(clash.id, "ours"))));
      if (clash.settable) {
        actions.append(button("Take theirs", "", () => decide(i, () => adapter.resolve(clash.id, "theirs"))));
      }
      actions.append(button("Edit", "", () => {
        if (busy) return;
        edited.add(clash.id);
        editAfterClose = clash.id;
        frame.close();
      }));
      card.append(actions);
      list.append(card);
    });

    if (focusAt !== undefined) rove(focusAt, true);
    else if (was >= 0) rove(was, true);
    else rove(0, false);
  };

  /** Take a list the adapter answered with, and show it. */
  const take = (next: readonly Clash[], focusAt?: number): void => {
    clashes = next;
    loaded = true;
    const ids = new Set(next.map((c) => c.id));
    for (const id of [...edited]) if (!ids.has(id)) edited.delete(id);
    opts.onChange?.(next);
    if (!closed) render(focusAt);
  };

  /** One decision: buttons off while the app writes, then the clashes left,
   *  with focus on the clash that took this one's place. */
  const decide = (index: number, call: () => ClashesAfter): void => {
    if (busy) return;
    busy = true;
    for (const b of list.querySelectorAll<HTMLButtonElement>("button")) b.disabled = true;
    // Asked at the gesture; a throw is a refusal like a rejection.
    let answer: ClashesAfter;
    try { answer = call(); } catch (err: unknown) { answer = Promise.reject(err); }
    void Promise.resolve(answer)
      .then((next) => { busy = false; take(next, index); })
      .catch((err: unknown) => {
        busy = false;
        toast(`Couldn't resolve that clash: ${err instanceof Error ? err.message : String(err)}`, "error");
        if (!closed) render(index);
      });
  };

  // Up and Down walk the clashes, from a clash or from any button on one;
  // Home and End go to the first and the last. Tab reaches a clash's buttons.
  list.addEventListener("keydown", (e) => {
    const all = cards();
    const at = all.findIndex((c) => c.contains(e.target as Node));
    if (at < 0) return;
    let to: number | undefined;
    if (e.key === "ArrowDown") to = Math.min(at + 1, all.length - 1);
    else if (e.key === "ArrowUp") to = Math.max(at - 1, 0);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = all.length - 1;
    if (to === undefined) return;
    e.preventDefault();
    rove(to, true);
  });

  frame.open();
  render();
  // Somewhere for focus while the list is read; the first clash takes it after.
  done.focus();

  const refresh = async (): Promise<void> => {
    const focusFirst = !loaded;
    try {
      const next = await adapter.list();
      take(next, focusFirst ? 0 : undefined);
      if (focusFirst && !closed && clashes.length === 0 && canTakeFocus(done)) done.focus();
    } catch (err: unknown) {
      loaded = true;
      if (!closed) {
        render();
        status.textContent = `Couldn't read the clashes: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  };
  void refresh();

  return { dialog: frame.dialog, refresh, close: () => frame.close(), isOpen: () => frame.isOpen() };
}

// --- the banner ------------------------------------------------------------------

export interface ClashBannerOptions {
  /** Open the resolver (the same as Project ▸ Resolve Clashes…). */
  onResolve: () => void;
  /** The count to start with; the banner is hidden at 0. */
  count?: number;
}

export interface ClashBanner {
  readonly el: HTMLElement;
  /** Show the new count, or hide the banner at 0. */
  update(count: number): void;
}

/**
 * The condition bar for a project holding clashes: "This project has 3
 * unresolved clashes from a merge." and Resolve…. The app mounts `el` at the top
 * of its window and calls `update` whenever it learns the count (on open, after
 * a merge, from the resolver's `onChange`). Warn-toned, like the stale bar:
 * nothing is lost, but the project won't validate until they're settled.
 */
export function clashBanner(opts: ClashBannerOptions): ClashBanner {
  const msg = el("span", "shell-clash-banner-msg");
  const go = el("button", { className: "shell-clash-banner-go", text: "Resolve…", onClick: () => opts.onResolve() });
  go.type = "button";
  const bar = el("div", "shell-clash-banner", msg, go);
  bar.setAttribute("role", "status");
  const update = (count: number): void => {
    bar.hidden = count <= 0;
    msg.textContent = count <= 0 ? "" : `This project has ${clashCountText(count)} from a merge.`;
  };
  update(opts.count ?? 0);
  return { el: bar, update };
}
