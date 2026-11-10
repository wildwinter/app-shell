// A declared field's help, kept out of the way: the field's caption, with a small "?" after it, whose rollover is the help,
// and the same help above the control when it takes keyboard focus (Pattershot's brief field-help-as-a-tooltip,
// ruled by Ian 2026-11-10). The help stays in the page, visually hidden, as the control's description, so a screen
// reader still reads it. What a chosen value means, and a field's problem, stay under the control: they change
// with the value, and a problem is a fault to fix.

import { ensureTooltipHost, hideTip, tipFor } from "./tooltip.js";

/** Give `caption` the help: its rollover (the themed tooltip, hovering the caption or its "?"), and the "?" drawn
 *  after it by the stylesheet (`.has-help`), so the caption's own text is unchanged. None: both taken off. */
export function captionHelp(caption: HTMLElement, help: string): void {
  caption.classList.toggle("has-help", help !== "");
  if (help === "") { delete caption.dataset["tip"]; return; }
  caption.dataset["tip"] = help;
  ensureTooltipHost();
}

/** Show the field's help above whichever control in `row` takes keyboard focus (not a click: a pointer has the
 *  mark to hover). `help` is read at the moment, so a row that updates keeps it current. */
export function helpOnKeyboardFocus(row: HTMLElement, help: () => string): void {
  row.addEventListener("focusin", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target || !keyboardFocus(target)) return;
    // A part of a list or a map has its own row: its own help, not the list's.
    if (target.closest(".shell-fieldrow") !== row) return;
    tipFor(target, help());
  });
  row.addEventListener("focusout", () => hideTip());
}

/** Whether `el` has focus the way a keyboard gives it (`:focus-visible`); false where that can't be told. */
function keyboardFocus(el: HTMLElement): boolean {
  try { return el.matches(":focus-visible"); } catch { return false; }
}
