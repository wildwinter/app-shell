// ---------------------------------------------------------------------------
// The stepper bar: a bottom bar that walks you through a list of things to
// attend to, one at a time.
//
// Count, previous, position, next, the current thing as a button, and a slot at
// the right for whatever acts on it. That is the whole shape, and it is already
// four bars across two apps: Patterpad's problems bar and its review walk,
// Storyletter's problems bar and its Review Feedback walk. Patterpad drew its
// two with parallel class sets (`.problembar-*` and `.reviewbar-*`) for one
// idea; Storyletter drew its second as the first plus one modifier, which is
// the better rule and the reason this ended up here (design review 2026-08,
// section 5 items 2 and 3).
//
// NO DOMAIN WORD anywhere in it, which is the test that says it belongs in the
// shell rather than in either app. It knows about a list, an index, and three
// pieces of text per entry; it does not know what a problem or a comment is.
// Severity, resolvedness and quick fixes all arrive as strings and elements the
// app made.
//
// TWO THINGS PATTERPAD'S BARS LACK and gain by adopting this: the position
// readout (`3/11`, so the walk has a length and an end rather than just a next),
// and the `where` segment naming what the entry is about before you go there.
//
// STEPPING NAVIGATES, or does not: that is the CALLER's decision and this bar
// takes no view. It reports `onStep` and `onGo` and nothing more. The rule that
// settles it lives in design-language.md - an ambient surface moves the view and
// never the focus; a mode you entered may take you somewhere - and the guard for
// an uncommitted edit belongs to the app, because only the app knows what is
// unsaved.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { icon } from "./icons.js";

export interface StepperItem {
  /**
   * One word for what kind of thing this is: "error", "comment", "resolved".
   * Absent when the bar carries one kind of thing only.
   */
  kind?: string;
  /** An extra class on the kind chip, so an app can colour its own kinds
   *  (Storyletter's `sev-error`, and `done` for a resolved thread). */
  kindClass?: string;
  /** Where it is, in the app's own address. Set in the mono face. */
  where?: string;
  /** The entry itself, in one line. Overflow is clipped, not wrapped: the bar
   *  is one row high and stays that way however long the sentence is. */
  text: string;
}

/** How loud the count is. The app picks; the palette supplies the value. */
export type StepperTone = "danger" | "warn" | "accent" | "muted";

export interface StepperBarOptions {
  items: StepperItem[];
  /** Which one is current. Clamped, so a shrinking list cannot point off the end. */
  at: number;
  tone?: StepperTone;
  /** Go to another index. The bar wraps, so this is always in range. */
  onStep: (next: number) => void;
  /** Take me to what the current entry is about. */
  onGo: (index: number) => void;
  /** What the three controls say they do. Keyboard shortcuts belong in here. */
  tips?: { prev?: string; next?: string; go?: string };
  /**
   * What to say when the list is empty.
   *
   * Absent hides the bar, which is right for an AMBIENT bar: no problems, no
   * problems bar. Present keeps it up, which is right for a MODE: entering the
   * walk and seeing nothing at all reads as a broken command rather than as
   * "there is no feedback".
   */
  empty?: string;
  /** Leave the mode. Drawn as the last control, hard right. */
  onClose?: () => void;
  closeTip?: string;
  /** The right-hand end before the close: a quick fix, say. Nulls are skipped,
   *  so a caller can pass a conditional straight in. */
  actions?: (HTMLElement | null | undefined)[];
}

/** Draw (or hide) the bar in `host`. Idempotent: call it again with new state. */
export function renderStepperBar(host: HTMLElement, opts: StepperBarOptions): void {
  const { items } = opts;
  const close = opts.onClose === undefined ? null : el("button", {
    className: "stepbar-nav stepbar-close", text: icon.close,
    tip: opts.closeTip ?? "Close", onClick: opts.onClose,
  });
  const actions = (opts.actions ?? []).filter((a): a is HTMLElement => a !== null && a !== undefined);

  if (items.length === 0) {
    if (opts.empty === undefined) { host.hidden = true; host.replaceChildren(); return; }
    host.hidden = false;
    host.replaceChildren(
      el("span", { className: "stepbar-count muted", text: "0" }),
      el("span", { className: "stepbar-empty", text: opts.empty }),
      ...actions, ...(close ? [close] : []),
    );
    return;
  }

  host.hidden = false;
  const index = Math.min(Math.max(opts.at, 0), items.length - 1);
  const item = items[index]!;
  const step = (delta: number): void => opts.onStep((index + delta + items.length) % items.length);

  // The steppers are absent for a list of one: two arrows that both come back
  // to where you are is furniture pretending to be a control.
  const nav = items.length > 1
    ? [
        el("button", { className: "stepbar-nav", text: icon.back,
          tip: opts.tips?.prev ?? "Previous", onClick: () => step(-1) }),
        el("span", { className: "stepbar-of", text: `${index + 1}/${items.length}` }),
        el("button", { className: "stepbar-nav", text: icon.forward,
          tip: opts.tips?.next ?? "Next", onClick: () => step(1) }),
      ]
    : [];

  host.replaceChildren(
    el("span", { className: `stepbar-count ${opts.tone ?? "muted"}`, text: String(items.length) }),
    ...nav,
    el("button", { className: "stepbar-cur", tip: opts.tips?.go ?? "Go to this", onClick: () => opts.onGo(index) },
      item.kind === undefined ? null
        : el("span", { className: `stepbar-cat${item.kindClass ? ` ${item.kindClass}` : ""}`, text: item.kind }),
      item.where === undefined ? null : el("span", { className: "stepbar-where", text: item.where }),
      el("span", { className: "stepbar-msg", text: item.text }),
    ),
    ...actions, ...(close ? [close] : []),
  );
}
