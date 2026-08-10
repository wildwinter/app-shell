// ---------------------------------------------------------------------------
// A floating panel anchored to the thing it is about: Patterpad's
// `openAnchoredPanel`, lifted and generalised.
//
// Patterpad's condition, effects, jump and gameId editors all use one, and so do
// Storyletter's comment threads. Two implementations of one idea existed for
// about a day, which is exactly the drift the shell is for - and Patterpad's was
// the mature one, so this is that, not the one written second.
//
// The behaviours are all learnt from use, and each is a bug somebody hit:
//
//   - Re-clicking the SAME anchor toggles the panel off and returns null,
//     rather than closing and reopening with a flicker. Callers must handle the
//     null.
//   - A DIFFERENT anchor swaps rather than stacking: only one is ever open.
//   - The outside-click listener is armed a tick late, or the very click that
//     opened the panel would close it again.
//   - `ignoreDown` spares body-level inner popovers, which are outside the
//     panel in the DOM but inside it as far as the author is concerned.
//   - `deferEscape` leaves Escape to an inner popover when one is open, so one
//     key does not close two things.
//
// Placement is the part worth reading. It flips to whichever side of the anchor
// has MORE room, keeps clear of any bottom bars the app names, caps at 70% of
// the window and scrolls its body. A panel that opens cramped against a status
// bar with empty space above it is the failure this avoids.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

export interface AnchoredPanel {
  panel: HTMLElement;
  /** The content area to populate: the header is built for you. */
  body: HTMLElement;
  /** Idempotent; fires the caller's `onClose` exactly once. */
  close: () => void;
}

export interface AnchoredPanelOptions {
  anchor: HTMLElement;
  /** Extra class(es) on the panel, for app-specific sizing or colour. */
  className?: string;
  title: string;
  width: number;
  /**
   * Which side to try first.
   *
   * `"left"` suits a panel hung off a row in a right-hand pane (Patterpad's
   * inspector); `"below"` suits one hung off a button in a document's header
   * (Storyletter's topline). Either way it flips when the room is not there.
   */
  prefer?: "left" | "below";
  /** Selectors for chrome the panel must not cover - a problems bar, a review
   *  bar - so those stay usable while it is open. */
  keepClear?: string[];
  /** A pointerdown inside something matching this does NOT close the panel. */
  ignoreDown?: string;
  /** While something matching this exists, Escape belongs to it, not to us. */
  deferEscape?: string;
  onClose?: () => void;
}

/** The one open panel. Only ever one, which is what makes toggling meaningful. */
let current: { anchor: HTMLElement; panel: HTMLElement; close: () => void } | null = null;

export function openAnchoredPanel(opts: AnchoredPanelOptions): AnchoredPanel | null {
  if (current) {
    const prev = current;
    current = null;
    prev.close();
    if (prev.anchor === opts.anchor) return null;   // a toggle, not a reopen
  }

  const panel = el("div", `shell-anchored ${opts.className ?? ""}`.trim());
  const closeBtn = el("button", "shell-anchored-close", "✕");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  const body = el("div", "shell-anchored-body");
  panel.append(
    el("div", "shell-anchored-head", el("span", "shell-anchored-title", opts.title), closeBtn),
    body,
  );
  document.body.append(panel);
  placeAnchored(panel, opts.anchor, opts.width, opts.prefer ?? "below", opts.keepClear ?? []);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    if (current?.panel === panel) current = null;
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    panel.remove();
    opts.onClose?.();
  };
  closeBtn.addEventListener("click", close);

  const onDown = (e: PointerEvent): void => {
    const target = e.target as Node;
    if (panel.contains(target) || opts.anchor.contains(target)) return;
    if (opts.ignoreDown !== undefined && target instanceof Element && target.closest(opts.ignoreDown)) return;
    close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    if (opts.deferEscape !== undefined && document.querySelector(opts.deferEscape)) return;
    close();
  };
  // Next tick: the click that opened this is still travelling.
  setTimeout(() => {
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);

  current = { anchor: opts.anchor, panel, close };
  return { panel, body, close };
}

/** Close whatever is open. For a navigation or a re-render: a panel anchored to
 *  an element that no longer exists would hang in the air. */
export function closeAnchoredPanel(): void {
  const open = current;
  current = null;
  open?.close();
}

/** Patterpad's placement, with the side as a parameter. */
export function placeAnchored(
  panel: HTMLElement, anchor: HTMLElement, width: number,
  prefer: "left" | "below", keepClear: string[],
): void {
  const a = anchor.getBoundingClientRect();
  const GAP = 10;
  const CAP = window.innerHeight * 0.7;
  const MIN_H = 140;
  panel.style.width = `${width}px`;

  // Horizontally: left of the anchor when asked and there is room, otherwise
  // aligned to it and nudged back inside the window.
  const leftOf = a.left - width - GAP;
  const alignedRight = Math.min(a.right - width, window.innerWidth - width - 8);
  panel.style.left = `${Math.round(prefer === "left" && leftOf >= 8
    ? leftOf
    : Math.max(8, prefer === "left" ? a.left : alignedRight))}px`;

  // Vertically: whichever side has more room, staying off the app's bottom bars.
  let bottomLimit = window.innerHeight - 8;
  for (const selector of keepClear) {
    const bar = document.querySelector(selector);
    if (!bar) continue;
    const r = bar.getBoundingClientRect();
    if (r.height > 0) bottomLimit = Math.min(bottomLimit, r.top - 6);
  }
  const roomBelow = bottomLimit - (a.bottom + GAP);
  const roomAbove = (a.top - GAP) - 8;
  if (roomAbove > roomBelow) {
    panel.style.top = "auto";
    panel.style.bottom = `${Math.round(window.innerHeight - (a.top - GAP))}px`;
    panel.style.maxHeight = `${Math.round(Math.max(MIN_H, Math.min(CAP, roomAbove)))}px`;
  } else {
    panel.style.bottom = "auto";
    panel.style.top = `${Math.round(Math.max(8, a.bottom + GAP))}px`;
    panel.style.maxHeight = `${Math.round(Math.max(MIN_H, Math.min(CAP, roomBelow)))}px`;
  }
}
