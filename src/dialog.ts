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
// dialog opened. What it does not own: the content classes, the buttons'
// meaning, and when to close. The caller keeps those.
//
// Styles ship as dialog.css. The action buttons are expected to wear `.btn`
// from controls.css; the frame does not draw buttons of its own.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { closeWithExit } from "./exit.js";

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
}

export interface DialogFrame {
  readonly dialog: HTMLDialogElement;
  /** Fill this with the content. */
  readonly body: HTMLElement;
  /** Fill this with the buttons, right-aligned; empty, it draws nothing. */
  readonly actions: HTMLElement;
  /** Show modally. Records what had focus so `close()` can give it back. */
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

  const teardown = (): void => {
    dialog.remove();
    // Back to the control that opened this. The platform does it for a plain
    // dialog.close(), but the exit motion ends in a remove(), and a removed
    // dialog restores nothing.
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    opener = null;
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
      state = "open";
      dialog.showModal();
    },
    close,
    isOpen: () => state === "open",
  };
}
