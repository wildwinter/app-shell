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

/** A button on the toast that acts on what it reports: "Undo" after a delete
 *  that undo can bring back (the October 2026 review: Undo replaces "Are you
 *  sure?"). Clicking it runs `run` and dismisses the toast. */
export interface ToastAction {
  label: string;
  run(): void;
}

export interface ToastOptions {
  /** How long it stays, in ms, before the exit plays. Defaults to 4000, or
   *  7000 for an error, or 8000 with an action, which needs time to reach. */
  duration?: number;
  /** A button beside the message. While the pointer or focus is on the toast
   *  its timer waits, so the button never leaves from under a hand. */
  action?: ToastAction;
}

const DURATION: Record<ToastKind, number> = { info: 4000, ok: 4000, error: 7000 };
const ACTION_DURATION = 8000;

let node: HTMLElement | undefined;
let timer = 0;
let seq = 0;
// The current toast's time left and when it started counting, so a hover can
// hold it and a leave can give back what was left.
let remaining = 0;
let startedAt = 0;
let held = false;

function mount(): HTMLElement {
  if (node && node.isConnected) return node;
  // role=status + aria-live=polite: announced without interrupting, which is
  // exactly a toast's manners.
  node = el("div", { className: "shell-toast" });
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.hidden = true;
  // A toast with a button waits while it's being reached for: a hover or the
  // keyboard on it holds the timer, and leaving gives back the time left.
  const hold = (): void => {
    if (held || node!.hidden || !node!.classList.contains("has-action")) return;
    held = true;
    window.clearTimeout(timer);
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  };
  const release = (): void => {
    if (!held) return;
    held = false;
    arm(seq, Math.max(remaining, 1500));
  };
  node.addEventListener("pointerenter", hold);
  node.addEventListener("pointerleave", release);
  node.addEventListener("focusin", hold);
  node.addEventListener("focusout", (e) => { if (!node!.contains(e.relatedTarget as Node | null)) release(); });
  document.body.append(node);
  return node;
}

function arm(id: number, ms: number): void {
  const t = node!;
  window.clearTimeout(timer);
  remaining = ms;
  startedAt = Date.now();
  timer = window.setTimeout(() => {
    // Only hide if this is still the toast that set the timer: a replacement
    // that arrived meanwhile has its own.
    closeWithExit(t, () => { if (seq === id) t.hidden = true; });
  }, ms);
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
  held = false;
  t.className = `shell-toast ${kind}`; // also clears a `.closing` left by a prior dismiss
  if (opts.action) {
    const { label, run } = opts.action;
    const button = el("button", { className: "shell-toast-action", onClick: () => { dismissToast(); run(); } }, label);
    button.type = "button";
    t.replaceChildren(el("span", "shell-toast-text", message), button);
    t.classList.add("has-action");
  } else {
    t.textContent = message;
  }
  t.hidden = false;
  arm(id, opts.duration ?? (opts.action ? ACTION_DURATION : DURATION[kind]));
}

/** Dismiss the current toast now, if any. Plays the exit. */
export function dismissToast(): void {
  if (!node || node.hidden) return;
  window.clearTimeout(timer);
  held = false;
  const id = seq;
  const t = node;
  closeWithExit(t, () => { if (seq === id) t.hidden = true; });
}
