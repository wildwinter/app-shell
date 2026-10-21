// ---------------------------------------------------------------------------
// The view window's head (tier 2 view extensions): the shell's `.swin-head`
// (title, pin, close) drawn by the HOST above a view, so a view window wears
// the same chrome as every other tool window. The page the scheme serves
// carries the markup (`viewPage`); the view preload wires it here, in its own
// isolated world, and talks to main on the channels below. The view's own
// code never reaches them: it has no ipcRenderer.
//
// No Electron import: the preload passes its ipcRenderer in, so this runs
// under test as it is.
// ---------------------------------------------------------------------------

import { iconHtml } from "./icons.js";
import { isEditableTarget } from "./util.js";

/** Main to the preload: the pin's state, sent each time the page loads. */
export const VIEW_HEAD_CHANNEL = "wildwinter-view:head";
/** The preload to main: the writer clicked the pin (its new state). */
export const VIEW_PIN_CHANNEL = "wildwinter-view:pin";
/** The preload to main: the writer clicked close, or pressed Escape. */
export const VIEW_CLOSE_CHANNEL = "wildwinter-view:close";

/** What main tells the head on `VIEW_HEAD_CHANNEL`. */
export interface ViewHeadState { readonly pinned: boolean }

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The pin's label: what a click will do, as `pinButton` says it. */
export const pinLabel = (pinned: boolean): string => (pinned ? "Pinned on top. Click to unpin." : "Keep on top");

/** The head's options, from the page's URL. */
export interface ViewHeadOptions {
  title: string;
  /** The pin's state, or absent for a window with nothing to pin above (no pin drawn). */
  pinned?: boolean;
}

/**
 * The head's markup: `toolWindowHead`'s bar (title, spacer, pin, close) as HTML, since the view's page is
 * served, not built by the shell's renderer code. `title` stands in for the themed tooltip, which the view's
 * page doesn't load.
 */
export function viewHeadHtml(opts: ViewHeadOptions): string {
  const pin = opts.pinned === undefined ? "" : (() => {
    const label = pinLabel(opts.pinned);
    return `<button type="button" class="swin-pin${opts.pinned ? " on" : ""}" data-view-pin aria-pressed="${opts.pinned}" aria-label="${label}" title="${label}">${iconHtml("pin")}</button>`;
  })();
  return `<header class="swin-head" data-view-head><span class="swin-title">${escapeHtml(opts.title)}</span>`
    + `<span class="swin-spacer"></span>${pin}`
    + `<button type="button" class="swin-close" data-view-close aria-label="Close (Esc)" title="Close (Esc)">${iconHtml("close")}</button></header>`;
}

/**
 * The head's styles: tool-window.css's chrome rules, with the tokens.css values as fallbacks, since the view's
 * page has neither stylesheet and gets the palette only once the view's client applies the theme.
 */
export const VIEW_HEAD_CSS = `
body { display: flex; flex-direction: column; }
.swin-head {
  -webkit-app-region: drag; flex: none;
  display: flex; align-items: center; gap: 6px; padding: 7px 10px;
  background: var(--surface, Canvas); font-size: var(--chrome-size, 14px);
  border-bottom: 1px solid var(--line-soft, var(--line, color-mix(in oklab, CanvasText 15%, transparent)));
}
.swin-head button { -webkit-app-region: no-drag; }
.swin-title { font: 600 13px/1.2 var(--font-ui, system-ui, sans-serif); color: var(--muted, GrayText); }
.swin-spacer { flex: 1; }
.swin-pin, .swin-close {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 1px solid transparent; border-radius: var(--radius-sm, 6px);
  cursor: pointer; color: var(--muted, GrayText); line-height: 0; padding: 4px;
  transition: background var(--dur-quick, 120ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
    border-color var(--dur-quick, 120ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
    color var(--dur-quick, 120ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}
.swin-pin:hover, .swin-close:hover { border-color: var(--line, GrayText); color: var(--ink, CanvasText); }
.swin-pin svg { display: block; }
.swin-pin.on {
  color: var(--accent, AccentColor); border-color: var(--accent, AccentColor);
  background: color-mix(in oklab, var(--accent, AccentColor) 12%, transparent);
}
.swin-close { font: 13px var(--font-ui, system-ui, sans-serif); padding: 2px 7px; }
`;

/** The part of ipcRenderer the head needs. */
export interface ViewHeadIpc {
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

/**
 * Wire the head the page carries, if it carries one: the pin and close send to main, main's state moves the
 * pin, and Escape closes the window, the family's rule, standing aside for a field's own Escape and for one the
 * view has `preventDefault()`ed (looked at once the event has finished, so a view's handler anywhere counts).
 * Called by the view preload once the document is parsed.
 */
export function wireViewHead(doc: Document, ipc: ViewHeadIpc): void {
  const head = doc.querySelector("[data-view-head]");
  if (!head) return;
  const pin = head.querySelector<HTMLButtonElement>("[data-view-pin]");
  let pinned = pin?.getAttribute("aria-pressed") === "true";
  const reflect = (): void => {
    if (!pin) return;
    pin.classList.toggle("on", pinned);
    pin.setAttribute("aria-pressed", String(pinned));
    pin.setAttribute("aria-label", pinLabel(pinned));
    pin.title = pinLabel(pinned);
  };
  pin?.addEventListener("click", () => { pinned = !pinned; reflect(); ipc.send(VIEW_PIN_CHANNEL, pinned); });
  head.querySelector("[data-view-close]")?.addEventListener("click", () => ipc.send(VIEW_CLOSE_CHANNEL));
  ipc.on(VIEW_HEAD_CHANNEL, (_event, state) => {
    if (typeof state === "object" && state !== null && typeof (state as ViewHeadState).pinned === "boolean") {
      pinned = (state as ViewHeadState).pinned;
      reflect();
    }
  });
  const win = doc.defaultView;
  win?.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || isEditableTarget(e.target)) return;
    win.setTimeout(() => { if (!e.defaultPrevented) ipc.send(VIEW_CLOSE_CHANNEL); }, 0);
  });
}
