// ---------------------------------------------------------------------------
// The toast: a transient remark from the app - "Bundle published", "Save
// refused: ...", "Spell-check is off" - that shows itself, waits, and leaves.
//
// Both apps grew one without copying the other, and drifted on everything a
// toast can drift on. Patterpad's sat bottom-right, an outlined card on the
// surface colour, entered and left on the shared panel motion, lingered longer
// for an error, and announced itself to a screen reader. Storyletter's sat
// bottom-centre, a solid --danger or --ok block with surface-coloured text, had
// no motion, one duration, and no ARIA. Same three sentences either side.
//
// WHOSE DRAWING WON, and why, since the two differed here in every particular:
//
//   PLACE: bottom-right. A toast is a REMARK, not a condition (that is the stale
//   bar's job), and a remark must not sit over what the author is reading or
//   typing. Bottom-centre lands on the centre column in the editor and on the
//   choice tray in Play; the corner is out of the reading measure, and it is
//   where the platforms put their own notifications, so the eye already knows
//   to glance there and back.
//
//   COLOUR: an outlined card on --surface, with the KIND carried by the border
//   and the text colour. A solid block of --danger shouts, and the design
//   language asks for restraint at the seams; the card also keeps its text as
//   --ink, which reads on every palette without each one having to tune a
//   contrast pair for white-on-red.
//
//   TIME: 4s, 7s for an error. Something went wrong is worth an extra glance.
//
//   MOTION: the shared panel vocabulary in tokens.css, in and out, so a toast
//   moves the way every other transient surface in the family moves.
//
// One toast at a time: a new one replaces the old, never stacks. Rapid events
// (a burst of saves) would otherwise pile up a column of remarks about one
// moment. The dismiss checks it is still dismissing the CURRENT toast, so a
// replacement is never hidden by its predecessor's timer.
//
// Mounted by the module, not by host markup: it appends its own node to
// document.body on first use, so a second window gets the whole thing by
// importing it (multi-window-rules.md section 1). Its CSS travels beside it.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { closeWithExit } from "./exit.js";

/** What the remark is about. `info` is the plain case; `ok` says a thing you
 *  asked for happened; `error` says it did not. */
export type ToastKind = "info" | "ok" | "error";

export interface ToastOptions {
  /** How long it stays, in ms, before the exit plays. Defaults to 4000, or
   *  7000 for an error. */
  duration?: number;
}

const DURATION: Record<ToastKind, number> = { info: 4000, ok: 4000, error: 7000 };

let node: HTMLElement | undefined;
let timer = 0;
let seq = 0;

function mount(): HTMLElement {
  if (node && node.isConnected) return node;
  // role=status + aria-live=polite: announced without interrupting, which is
  // exactly a toast's manners.
  node = el("div", { className: "shell-toast" });
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.hidden = true;
  document.body.append(node);
  return node;
}

/**
 * Show a toast. Replaces any toast already showing.
 *
 * `message` is shown as written; a newline breaks the line ("Bundle
 * published\n<path>"), and a long unbroken token such as a path wraps inside
 * the card rather than spilling past it.
 */
export function toast(message: string, kind: ToastKind = "info", opts: ToastOptions = {}): void {
  const t = mount();
  const id = ++seq;
  t.textContent = message;
  t.className = `shell-toast ${kind}`; // also clears a `.closing` left by a prior dismiss
  t.hidden = false;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    // Only hide if this is still the toast that set the timer: a replacement
    // that arrived meanwhile has its own.
    closeWithExit(t, () => { if (seq === id) t.hidden = true; });
  }, opts.duration ?? DURATION[kind]);
}

/** Dismiss the current toast now, if any. Plays the exit. */
export function dismissToast(): void {
  if (!node || node.hidden) return;
  window.clearTimeout(timer);
  const id = seq;
  const t = node;
  closeWithExit(t, () => { if (seq === id) t.hidden = true; });
}
