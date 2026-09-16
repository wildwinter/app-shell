// ---------------------------------------------------------------------------
// The tool-window kit, RENDERER half: the always-on-top pin button every
// helper window carries (previously pasted verbatim in five places across
// the two apps). The matching chrome CSS - .swin-head drag bar, .swin-pin,
// .swin-close - ships as tool-window.css.
//
// The head bar (toolWindowHead) and the follow toggle (followButton) live here
// too since 0.39. The frameless drag bar itself needs no JS at all: it is markup + the
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

// --- the head ------------------------------------------------------------------

export interface ToolWindowHeadOptions {
  /** The window's own name. Constant: it says which window this is, so it must
   *  not change as projects open and close. Omitted by a window whose mode
   *  tabs stand where the title would be (Find): pass them as `tabs`. */
  title?: string;
  /** Mode tabs in the title's place (Find's bar: modes left, pin and close right). */
  tabs?: HTMLElement;
  /** A pin BUILT ALREADY, for a window that mounts its chrome once and drives
   *  the button with `pin.set(on)` rather than rebuilding the bar. That is the
   *  better shape (no re-entrancy question, survives a partial repaint), so the
   *  helper takes either. */
  pin?: { el: HTMLElement };
  pinned?: boolean;
  onPin?: (on: boolean) => void;
  onClose: () => void;
  /** Between the title and the spacer: a subtitle, the project name. */
  lead?: (Node | string | null)[];
  /** Between the spacer and the pin: this window's own controls. */
  trail?: (Node | string | null)[];
  /** An extra class beside `swin-head`, for a window that styles its own bar. */
  className?: string;
  /**
   * Escape closes the window (default true): the family's rule, written once
   * here rather than per window. Off for a window that layers Escape (a play
   * surface dismisses its own panels first and closes last): it installs its
   * own listener and calls `onClose` when nothing smaller is left.
   */
  esc?: boolean;
}

/** The one Escape listener per window. The head may be rebuilt on every render
 *  (a play surface does), so the listener is installed once and reads the
 *  latest close through this slot. */
let escClose: (() => void) | undefined;
let escWired = false;
function wireEsc(): void {
  if (escWired) return;
  escWired = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !escClose) return;
    const t = e.target;
    // A field's own Escape (clearing, cancelling an edit) comes first.
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (t instanceof HTMLElement && t.isContentEditable) return;
    escClose();
  });
}

/** The `.swin-head` bar every tool window wears: title (or tabs), lead, spacer,
 *  trail, pin, close. The close button says "Close (Esc)" once, here, rather
 *  than in every window. */
export function toolWindowHead(opts: ToolWindowHeadOptions): HTMLElement {
  const keep = (parts: (Node | string | null)[] | undefined): (Node | string)[] =>
    (parts ?? []).filter((p): p is Node | string => p !== null);
  const pin = opts.pin
    ?? pinButton({ pinned: opts.pinned ?? true, onToggle: opts.onPin ?? (() => {}) });
  if (opts.esc !== false) { escClose = opts.onClose; wireEsc(); }
  return el("header", { className: `swin-head${opts.className ? ` ${opts.className}` : ""}` },
    ...(opts.title !== undefined ? [el("span", { className: "swin-title", text: opts.title })] : []),
    ...(opts.tabs ? [opts.tabs] : []),
    ...keep(opts.lead),
    el("span", { className: "swin-spacer" }),
    ...keep(opts.trail),
    pin.el,
    el("button", { className: "swin-close", tip: "Close (Esc)", onClick: opts.onClose }, iconNode("close")),
  );
}

// --- follow in the editor -------------------------------------------------------

export interface FollowButtonOptions {
  on: boolean;
  /** Persist the choice. The button reflects the click itself. */
  onToggle: (on: boolean) => void;
  /** What the editor opens as the run goes: "line" (Patterpad), "card"
   *  (Storyletter). Default "line". */
  what?: string;
}

/** A toggle and the handle to drive it, the same shape `pinButton` returns. */
export interface FollowButton {
  el: HTMLButtonElement;
  /** Reflect a state decided elsewhere, without calling `onToggle`. */
  set: (on: boolean) => void;
}

/**
 * "Follow in the editor": the play surface's toggle that makes the EDITOR
 * follow the run, opening each line / card as it plays. Both play surfaces
 * built one (patterpad play.ts, studio table.ts) with the same label and
 * paraphrased tips; this is the one wording.
 *
 * The LABEL is the careful part. "Follow" alone would match the vocabulary of
 * a window that follows the editor; this is the other direction, the editor
 * following the run. Off by default and remembered by the host: following is
 * the author asking for it.
 */
export function followButton(opts: FollowButtonOptions): FollowButton {
  const what = opts.what ?? "line";
  const b = el("button", "btn swin-follow", "Follow in the editor");
  b.type = "button";
  let on = opts.on;
  const reflect = (): void => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    const label = on
      ? `The editor opens each ${what} as it plays. Click to stop.`
      : `Open each ${what} in the editor as it plays`;
    b.dataset["tip"] = label;
  };
  reflect();
  b.addEventListener("click", () => { on = !on; reflect(); opts.onToggle(on); });
  return { el: b, set: (next: boolean) => { on = next; reflect(); } };
}
