// ---------------------------------------------------------------------------
// The tool-window kit, RENDERER half: the always-on-top pin button every
// helper window carries (previously pasted verbatim in five places across
// the two apps). The matching chrome CSS - .swin-head drag bar, .swin-pin,
// .swin-close - ships as tool-window.css.
//
// The frameless drag bar itself needs no JS at all: it is markup + the
// -webkit-app-region rules in tool-window.css.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

/** The pin glyph (shared across the family; byte-identical everywhere). */
const PIN_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.3V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.7a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`;

export interface PinButtonOptions {
  pinned: boolean;
  /** Persist the choice (the button keeps its own visual state). */
  onToggle: (on: boolean) => void;
}

/** The always-on-top pin: `.swin-pin`, aria-pressed, and a tooltip that says
 *  what a click will do (the richest of the family's variants, kept). */
export function pinButton(opts: PinButtonOptions): HTMLButtonElement {
  const b = el("button", "swin-pin");
  b.type = "button";
  b.innerHTML = PIN_ICON;
  let pinned = opts.pinned;
  const reflect = (): void => {
    b.classList.toggle("on", pinned);
    b.setAttribute("aria-pressed", String(pinned));
    b.title = pinned ? "Pinned on top: click to unpin" : "Click to keep on top";
  };
  reflect();
  b.addEventListener("click", () => { pinned = !pinned; reflect(); opts.onToggle(pinned); });
  return b;
}
