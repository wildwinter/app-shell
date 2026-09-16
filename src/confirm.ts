// ---------------------------------------------------------------------------
// A themed in-app confirmation modal (design-language "coherent to the
// edges": never a stock OS dialog). The promise API is Patterpad's surface
// confirm; the build sits on the family's dialog frame (dialog.ts), so the
// focus trap, Esc, the scrim and the exit motion are the frame's. Two
// deliberate corrections over that original, kept when Patterpad migrates
// here: the destructive button wears --danger (a required host token; the
// surface one mistakenly used --accent), and initial focus lands on Cancel so
// a stray Enter cannot destroy anything.
//
// Styles: dialog.css + controls.css for the frame and the buttons, confirm.css
// for what is confirm's own (its width, its body copy). Callers keep the
// elide-the-dialog rule: when nothing is at stake, don't ask.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { dialogFrame } from "./dialog.js";

export interface ConfirmOptions {
  title: string;
  body: string;
  /** The destructive button's label ("Delete box", "Restart"). */
  confirmLabel: string;
}

/** Resolves true on confirm; false on Cancel / Esc / backdrop. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    // Resolve on the gesture, not after the exit motion: the caller acts on the
    // answer at once, and the fade plays over whatever it does.
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      resolve(ok);
      frame.close();
    };
    const frame = dialogFrame({
      title: opts.title, className: "confirm-dialog",
      onClose: () => finish(false),   // Esc, or closed by someone else
    });
    const cancel = el("button", "btn confirm-btn cancel", "Cancel");
    const danger = el("button", "btn danger confirm-btn", opts.confirmLabel);
    cancel.type = "button";
    danger.type = "button";
    frame.body.append(el("div", "confirm-body", opts.body));
    frame.actions.append(cancel, danger);

    cancel.addEventListener("click", () => finish(false));
    danger.addEventListener("click", () => finish(true));
    // Esc arrives as the dialog's cancel event; the frame routes it through the
    // exit motion and onClose. A mousedown that lands on the dialog element
    // itself is the backdrop.
    frame.dialog.addEventListener("mousedown", (e) => { if (e.target === frame.dialog) finish(false); });

    frame.open();
    cancel.focus();
  });
}
