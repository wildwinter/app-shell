// ---------------------------------------------------------------------------
// A themed in-app confirmation modal (design-language "coherent to the
// edges": never a stock OS dialog). The promise API is Patterpad's surface
// confirm; the build is native <dialog> + showModal() so the focus trap and
// Esc handling come free. Two deliberate corrections over that original,
// kept when Patterpad migrates here: the destructive button wears --danger
// (a required host token - the surface one mistakenly used --accent), and
// initial focus lands on Cancel so a stray Enter cannot destroy anything.
//
// Styles ship as confirm.css (import it beside tokens.css). Callers keep the
// elide-the-dialog rule: when nothing is at stake, don't ask.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

export interface ConfirmOptions {
  title: string;
  body: string;
  /** The destructive button's label ("Delete box", "Restart"). */
  confirmLabel: string;
}

/** Resolves true on confirm; false on Cancel / Esc / backdrop. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const cancel = el("button", "confirm-btn cancel", "Cancel");
    const danger = el("button", "confirm-btn danger", opts.confirmLabel);
    cancel.type = "button";
    danger.type = "button";
    const dlg = el(
      "dialog",
      "confirm-dialog",
      el("div", "confirm-title", opts.title),
      el("div", "confirm-body", opts.body),
      el("div", "confirm-actions", cancel, danger),
    );
    dlg.setAttribute("aria-label", opts.title);
    document.body.append(dlg);

    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      resolve(ok);
      // Exit motion: .closing swaps the enter keyframes for their reverse
      // (zero-duration under prefers-reduced-motion, so teardown is instant).
      dlg.classList.add("closing");
      const dur = parseFloat(getComputedStyle(dlg).animationDuration) || 0;
      const teardown = (): void => { dlg.close(); dlg.remove(); };
      if (dur === 0) { teardown(); return; }
      const timer = setTimeout(teardown, dur * 1000 + 120);
      dlg.addEventListener("animationend", (e) => {
        if (e.target !== dlg) return;
        clearTimeout(timer);
        teardown();
      });
    };

    cancel.addEventListener("click", () => finish(false));
    danger.addEventListener("click", () => finish(true));
    // Esc arrives as the dialog's cancel event; route it through the exit motion.
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    // A mousedown that lands on the dialog element itself is the backdrop.
    dlg.addEventListener("mousedown", (e) => { if (e.target === dlg) finish(false); });

    dlg.showModal();
    cancel.focus();
  });
}
