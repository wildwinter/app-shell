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
import { iconNode } from "./icons.js";

export interface PinButtonOptions {
  pinned: boolean;
  /** Persist the choice. The button reflects the click itself. */
  onToggle: (on: boolean) => void;
}

/** A pin and the handle to drive it, the same shape `saveIndicator` returns. */
export interface PinButton {
  el: HTMLButtonElement;
  /**
   * Reflect a pin state decided ELSEWHERE, without calling `onToggle`.
   *
   * The state is not always the button's to choose: main re-pins a helper window
   * on Reset View, and the window is told after the fact. Before this existed a
   * host had to reach in and set the class, the aria and the title by hand,
   * which is three chances to disagree with the button about what it is showing.
   */
  set: (pinned: boolean) => void;
}

/** The always-on-top pin: `.swin-pin`, aria-pressed, and a tooltip that says
 *  what a click will do (the richest of the family's variants, kept). */
export function pinButton(opts: PinButtonOptions): PinButton {
  const b = el("button", "swin-pin");
  b.type = "button";
  // The vocabulary's pin (it used to be a hand-drawn copy of the same shape,
  // pasted in five places across the two apps before it came here).
  b.append(iconNode("pin"));
  let pinned = opts.pinned;
  const reflect = (): void => {
    b.classList.toggle("on", pinned);
    b.setAttribute("aria-pressed", String(pinned));
    // The THEMED rollover, not the platform's. 0.21.0 swept `title` out of this
    // package and missed this one, so every helper window in the family had a
    // single control waiting on the OS delay and then drawing the OS bubble,
    // sitting beside controls that did not. `title` was also the button's only
    // accessible name (the glyph is an aria-hidden SVG), so the label has to go
    // to `aria-label` as it moves, or dropping `title` would take the name too.
    const label = pinned ? "Pinned on top. Click to unpin." : "Keep on top";
    b.dataset["tip"] = label;
    b.setAttribute("aria-label", label);
  };
  reflect();
  b.addEventListener("click", () => { pinned = !pinned; reflect(); opts.onToggle(pinned); });
  return { el: b, set: (next: boolean) => { pinned = next; reflect(); } };
}
