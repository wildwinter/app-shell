// ---------------------------------------------------------------------------
// The floating-layer lifecycle every popup and menu shares: a body-appended
// element, display toggling, a scroll / resize follower that keeps it glued to
// its anchor, a click-away dismiss, and the family's exit motion on close.
//
// Patterpad's surface had it (four popups: the cue picker, the slash menu, the
// action menu, the jump picker) and Storyletter's context menu had the same
// idea in eleven lines without the follower (ui-review-2026-09, finding 5).
// This is the surface's, lifted whole. Positioning stays the caller's, because
// it differs per popup: pass a `reposition` closure to `show()` and the
// follower re-runs it on scroll and resize until `close()`.
//
// The element is REUSED across opens (a popup that re-renders on every
// keystroke must not tear itself down each time), which is why a stale exit
// teardown has a token to lose against a reopen.
// ---------------------------------------------------------------------------

import { closeWithExit } from "./exit.js";

export interface Floating {
  /** The floating element. Build content into it; it is appended to <body>
   *  (or the `host` given), hidden until `show()`. */
  readonly el: HTMLElement;
  /** Show `el` and keep `reposition` glued to the anchor on scroll / resize.
   *  Safe to call repeatedly (on every re-render): the follower attaches once. */
  show(reposition: () => void): void;
  /** While open, call `onOutside` on a pointer-down outside `el`, and outside
   *  anything `isInside` accepts (a second flyout, the anchor button).
   *  Idempotent: arms once. */
  dismissOnOutside(onOutside: () => void, isInside?: (target: Node) => boolean): void;
  /** Play the exit, then hide `el`, clear its children, and drop the follower
   *  and any outside listener. */
  close(): void;
  isOpen(): boolean;
}

/** Re-run `reposition` on any scroll or resize until the returned disposer runs. */
function followOnScroll(reposition: () => void): () => void {
  const onMove = (): void => reposition();
  window.addEventListener("scroll", onMove, true);
  window.addEventListener("resize", onMove);
  return () => { window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
}

export interface FloatingOptions {
  /** Where the element is appended. Default <body>. Under a modal <dialog> a
   *  body-level node sits behind the scrim, inert, so a popup opened from
   *  inside one passes the dialog here and paints in its top layer. */
  host?: HTMLElement;
}

export function createFloating(className: string, opts: FloatingOptions = {}): Floating {
  const el = document.createElement("div"); el.className = className; el.style.display = "none";
  (opts.host ?? document.body).appendChild(el);
  let open = false;
  let detach: (() => void) | null = null;
  let outside: ((e: MouseEvent) => void) | null = null;
  let closeToken = 0; // bumped on every show / close so a stale exit teardown cannot clobber a reopen

  const close = (): void => {
    if (!open) return;
    open = false;
    detach?.(); detach = null; // stop following + dismissing immediately; it is on its way out
    if (outside) { document.removeEventListener("mousedown", outside, true); outside = null; }
    const myToken = ++closeToken;
    // Play the exit, THEN hide + clear. A reopen during the fade must win:
    // show() bumps closeToken, and this guard abandons the stale teardown.
    closeWithExit(el, () => {
      if (myToken !== closeToken) return;
      el.style.display = "none"; el.replaceChildren(); el.classList.remove("closing");
    });
  };

  const show = (reposition: () => void): void => {
    closeToken++; el.classList.remove("closing"); // cancel any in-flight exit, undo its class
    open = true; el.style.display = "block"; reposition();
    detach ??= followOnScroll(reposition);
  };

  const dismissOnOutside = (onOutside: () => void, isInside?: (target: Node) => boolean): void => {
    if (outside) return; // already armed
    outside = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (!el.contains(t) && !(isInside?.(t) ?? false)) onOutside();
    };
    document.addEventListener("mousedown", outside, true);
  };

  return { el, show, dismissOnOutside, close, isOpen: () => open };
}
