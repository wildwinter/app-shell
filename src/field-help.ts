// A declared field's help, kept out of the way: the field's caption, whose rollover is the help,
// and the same help above the control when it takes keyboard focus (Pattershot's brief field-help-as-a-tooltip,
// ruled by Ian 2026-11-10, and settings-tables-tidy: no mark, and the chosen value's help in the tooltip too). The
// help stays in the page, visually hidden, as the control's description, so a screen reader still reads it. Only a
// field's problem is drawn under the control: it's a fault to fix.

import { ensureTooltipHost, hideTip, tipBold, tipFor } from "./tooltip.js";

/** A field's tooltip: its own help, then what the chosen value means, the value named in bold. Empty when there's
 *  neither. */
export function helpText(fieldHelp: string, value?: string, valueHelp?: string): string {
  const said = valueHelp && value ? `${tipBold(value)}: ${valueHelp}` : valueHelp ?? "";
  return [fieldHelp, said].filter((t) => t !== "").join("\n");
}

/** Give `caption` the help as its rollover (the themed tooltip, on hovering the caption; a help cursor says it's
 *  there), so the caption's own text is unchanged. None: taken off. */
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
