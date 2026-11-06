// ---------------------------------------------------------------------------
// A prompt on the family's dialog frame, for whatever confirmDialog doesn't
// fit: a notice with nothing to confirm, or a choice of more than one way
// forward. Main's prompts (prompt-main.ts) are drawn here too, so a flow
// running in main asks in the app's own chrome. Lifted from Patterpad.
// Styles: dialog.css, controls.css and confirm.css, as confirm's.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { dialogFrame } from "./dialog.js";
import type { AppPrompt } from "./prompt-channels.js";

export type { AppPrompt } from "./prompt-channels.js";

/** Show `opts` and resolve with the index of the button chosen. Buttons are in display order (the way
 *  out first); the default wears the accent and takes the focus; Esc and the backdrop answer `cancelId`.
 *  A notice is one button, and it reads "OK". */
export function promptDialog(opts: AppPrompt): Promise<number> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (i: number): void => { if (done) return; done = true; resolve(i); frame.close(); };
    const frame = dialogFrame({ title: opts.title, ...(opts.sub ? { sub: opts.sub } : {}), className: "confirm-dialog", onClose: () => finish(opts.cancelId) });
    for (const para of opts.body ?? []) frame.body.append(el("p", "confirm-body", para));
    let focus: HTMLButtonElement | null = null;
    opts.buttons.forEach((label, i) => {
      const b = el("button", i === opts.defaultId && opts.buttons.length > 1 ? "btn primary confirm-btn" : "btn confirm-btn", label);
      b.type = "button";
      b.addEventListener("click", () => finish(i));
      frame.actions.append(b);
      if (i === opts.defaultId) focus = b;
    });
    frame.dialog.addEventListener("mousedown", (e) => { if (e.target === frame.dialog) finish(opts.cancelId); });
    frame.open();
    (focus as HTMLButtonElement | null)?.focus();
  });
}
