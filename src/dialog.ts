// ---------------------------------------------------------------------------
// dialogFrame: the one modal skeleton every dialog in the family sits on.
//
// Title, an optional sub line, a body the caller fills, an actions row the
// caller fills, on a native <dialog> so the focus trap and Escape come from the
// platform. Four scrims and three panel drawings had grown across five shell
// files and a dozen app dialogs (ui-review-2026-09, findings 9 and 30); this is
// the frame they all sit on now, and the shell's own dialogs (confirm, identity,
// about, notes) were moved onto it first, which is how it is proven.
//
// What the frame owns: the backdrop, the panel, the enter and exit motion
// (closeWithExit), Escape, and giving focus back to whatever had it when the
// dialog opened, or, when that has gone from the page (an inspector that
// re-rendered under the dialog), to the caller's `returnFocus`, the nearest
// surviving ancestor that can take focus, or the host's fallback
// (`setDialogFocusFallback`). What it does not own: the content classes, the buttons'
// meaning, and when to close. The caller keeps those.
//
// Styles ship as dialog.css. The action buttons are expected to wear `.btn`
// from controls.css; the frame does not draw buttons of its own.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { closeWithExit } from "./exit.js";
import { canTakeFocus } from "./focus.js";

/** An element to give focus to when a dialog closes, or a function asked for
 *  one at that moment (so it can find what a re-render put in the opener's
 *  place). */
export type ReturnFocus = HTMLElement | (() => HTMLElement | null | undefined);

let hostFallback: (() => HTMLElement | null | undefined) | null = null;

/** The host's last resort for focus after any dialog closes (the main editing
 *  area, say), when neither the dialog's `returnFocus`, its opener nor any
 *  ancestor of the opener still in the page can take it. One per window; null
 *  clears it. */
export function setDialogFocusFallback(fallback: (() => HTMLElement | null | undefined) | null): void {
  hostFallback = fallback;
}

export interface DialogFrameOptions {
  /** The heading. Also the dialog's accessible name. */
  title: string;
  /** One plain sentence under the heading, if the title needs one. */
  sub?: string;
  /** Extra class(es) on the <dialog>, for the caller's own content rules and
   *  width (`--dialog-width` on the class; see dialog.css). */
  className?: string;
  /** Runs once, after the dialog has left the document, however it closed. */
  onClose?: () => void;
  /** Where focus goes when the dialog closes, ahead of the opener: for a
   *  caller that knows the opener will be re-rendered. A function is called
   *  at close. An answer that can't take focus (null, detached, disabled) is
   *  passed over, and the frame goes on to the opener, then the nearest
   *  ancestor of the opener still in the page that can take focus, then the
   *  host's `setDialogFocusFallback`. */
  returnFocus?: ReturnFocus;
}

export interface DialogFrame {
  readonly dialog: HTMLDialogElement;
  /** Fill this with the content. */
  readonly body: HTMLElement;
  /** Fill this with the buttons, right-aligned; empty, it draws nothing. */
  readonly actions: HTMLElement;
  /** Show modally. Records what had focus (and its ancestors) so `close()`
   *  can give it back. */
  open(): void;
  /** Play the exit, tear down, restore focus. Idempotent. */
  close(): void;
  isOpen(): boolean;
}

/** Build a dialog on the family's frame. Appended to <body> at once (so an
 *  `open()` on the next line has nothing to wait for); shown only on `open()`. */
export function dialogFrame(opts: DialogFrameOptions): DialogFrame {
  const dialog = el("dialog", `shell-dialog ${opts.className ?? ""}`.trim());
  const body = el("div", "shell-dialog-body");
  const actions = el("div", "shell-dialog-actions");
  dialog.append(el("h2", "shell-dialog-title", opts.title));
  if (opts.sub !== undefined) dialog.append(el("p", "shell-dialog-sub", opts.sub));
  dialog.append(body, actions);
  dialog.setAttribute("aria-label", opts.title);
  document.body.append(dialog);

  let state: "closed" | "open" | "closing" = "closed";
  let opener: Element | null = null;
  // The opener's ancestors as they were at open, nearest first: once the
  // opener is detached, its own parent chain ends at the detached subtree.
  let openerLine: Element[] = [];

  const giveFocusBack = (): void => {
    const given = typeof opts.returnFocus === "function" ? opts.returnFocus() : opts.returnFocus;
    const candidates: Array<Element | null | undefined> = [given, opener];
    for (const n of openerLine) if (n.isConnected) candidates.push(n);
    candidates.push(hostFallback?.());
    candidates.find(canTakeFocus)?.focus();
  };

  const teardown = (): void => {
    dialog.remove();
    // Back to the control that opened this. The platform does it for a plain
    // dialog.close(), but the exit motion ends in a remove(), and a removed
    // dialog restores nothing.
    giveFocusBack();
    opener = null;
    openerLine = [];
    state = "closed";
    opts.onClose?.();
  };

  const close = (): void => {
    if (state !== "open") return;
    state = "closing";
    closeWithExit(dialog, () => { if (dialog.open) dialog.close(); teardown(); });
  };

  // Escape arrives as the cancel event; route it through the exit motion.
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  // Closed by someone else (a form with method="dialog", or a direct
  // dialog.close()): no motion to play, tear down at once.
  dialog.addEventListener("close", () => { if (state === "open") teardown(); });

  return {
    dialog, body, actions,
    open() {
      if (state !== "closed") return;
      opener = document.activeElement;
      openerLine = [];
      for (let n = opener?.parentElement ?? null; n && n !== document.body; n = n.parentElement) openerLine.push(n);
      state = "open";
      dialog.showModal();
    },
    close,
    isOpen: () => state === "open",
  };
}
