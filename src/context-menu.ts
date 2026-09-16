// ---------------------------------------------------------------------------
// A right-click context menu and a small anchored popover: a floating list of
// actions at the cursor (or a panel under a control), dismissed on outside
// click or Escape, clamped to the viewport, closed with the family's exit
// motion.
//
// Storyletter's, lifted (ui-review-2026-09, finding 11): its own header had
// named itself an extraction candidate, and it had the two things Patterpad's
// inline `sceneContextMenu` lacked, a `disabled` item and the clamp. A DOM
// popover, not a native menu, so it is themed like everything else.
//
// Styles ship as context-menu.css; import it wherever the module is used,
// including tool windows, which is the bug that made Storyletter give the
// menu its own stylesheet in the first place.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { closeWithExit } from "./exit.js";

export interface ContextItem {
  label: string;
  /** Drawn in --danger: a destructive action, which names its object. */
  danger?: boolean;
  /** Shown greyed and unclickable. For an action that belongs on this menu
   *  but cannot apply right now (Move up on the first row), so the menu keeps
   *  the same shape and the same item stays in the same place every time. */
  disabled?: boolean;
  onClick: () => void;
}

const EDGE = 6;

/** The one open menu or popover. Only ever one, so a fresh open replaces it
 *  and a re-render that removed the anchor cannot leave one hanging in the air. */
let current: (() => void) | null = null;

/** Outside-click / Escape wiring shared by the menu and the popover. The
 *  returned `dismiss` plays the exit and removes the node; `onDismiss` fires
 *  for every way out so a caller can flush on all of them. */
function floating(node: HTMLElement, onDismiss?: () => void): { dismiss: () => void } {
  let gone = false;
  const dismiss = (): void => {
    if (gone) return;
    gone = true;
    if (current === dismiss) current = null;
    window.removeEventListener("pointerdown", onAway, true);
    window.removeEventListener("keydown", onKey, true);
    // A node mid-fade must not take a second click.
    closeWithExit(node, () => node.remove());
    onDismiss?.();
  };
  const onAway = (e: PointerEvent): void => { if (!node.contains(e.target as Node)) dismiss(); };
  const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") { e.preventDefault(); dismiss(); } };
  window.addEventListener("pointerdown", onAway, true);
  window.addEventListener("keydown", onKey, true);
  current?.();
  current = dismiss;
  return { dismiss };
}

/** Clamp a floating node into the viewport, preferring below `anchor` and
 *  flipping above it when there is no room. */
function placeBelow(node: HTMLElement, anchor: DOMRect): void {
  node.style.left = `${anchor.left}px`;
  node.style.top = `${anchor.bottom + 4}px`;
  const r = node.getBoundingClientRect();
  if (r.right > window.innerWidth) node.style.left = `${Math.max(EDGE, window.innerWidth - r.width - EDGE)}px`;
  if (r.bottom > window.innerHeight) node.style.top = `${Math.max(EDGE, anchor.top - r.height - 4)}px`;
}

export interface PopoverOptions {
  /** Where the popover is appended. Default <body>. A popover opened from
   *  inside a modal <dialog> passes the dialog: a body-level node sits behind
   *  the scrim, inert, while one inside the dialog paints in its top layer
   *  (Patterpad's colour swatch popover in Project settings). */
  host?: HTMLElement;
}

/** Open a small panel anchored to an element; `build` gets a close callback.
 *  `onClose` runs however it closes (Escape, outside click, or `close`), the
 *  place to flush an edit the panel was collecting. Only one is ever open. */
export function openPopover(
  anchor: HTMLElement, build: (close: () => void) => HTMLElement, onClose?: () => void, opts: PopoverOptions = {},
): void {
  const pop = el("div", "popover");
  let closed = false;
  const finish = (): void => { if (closed) return; closed = true; onClose?.(); };
  const { dismiss } = floating(pop, finish);
  pop.append(build(dismiss));
  (opts.host ?? document.body).append(pop);
  placeBelow(pop, anchor.getBoundingClientRect());
}

/** Open a context menu at (x, y). Only one is ever open. */
export function openContextMenu(x: number, y: number, items: ContextItem[]): void {
  const menu = el("div", "ctxmenu");
  menu.setAttribute("role", "menu");
  const { dismiss } = floating(menu);

  for (const item of items) {
    const button = el("button", {
      className: `ctxmenu-item${item.danger ? " danger" : ""}`, text: item.label,
      onClick: () => { if (item.disabled === true) return; dismiss(); item.onClick(); },
    });
    button.type = "button";
    button.setAttribute("role", "menuitem");
    if (item.disabled === true) button.disabled = true;
    menu.append(button);
  }

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.append(menu);
  // Keep it on-screen.
  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = `${Math.max(EDGE, window.innerWidth - r.width - EDGE)}px`;
  if (r.bottom > window.innerHeight) menu.style.top = `${Math.max(EDGE, window.innerHeight - r.height - EDGE)}px`;
}
