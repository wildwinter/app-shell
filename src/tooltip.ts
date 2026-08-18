// ---------------------------------------------------------------------------
// A single themed tooltip the family controls, replacing native `title`
// rollovers: those are unstyled OS chrome and appear on the platform's slow
// (~1s) delay, which is exactly the seam design-language section 4 ("coherent
// to the edges") says not to leave showing.
//
// ONE floating bubble, document-DELEGATED: any element carrying a `data-tip`
// attribute gets it, so a caller just sets `data-tip="..."` anywhere and wires
// nothing. The bubble anchors above the element (flipping below near the top
// edge), uses our own snappy delay and the shared panel-enter motion.
// `initTooltips()` is idempotent, so it is safe to call from more than one
// place in an app that has several entry points.
//
// Lifted from Patterpad's patterpad-surface/web/tooltip.ts, which proved it,
// with the one app-specific rule (suppressed in Writing View) generalised into
// the `suppressed` option so the shell knows nothing about either app's modes.
// ---------------------------------------------------------------------------

// Bold markers: a producer wraps a span in these PRIVATE control chars (U+0002 STX / U+0003 ETX,
// never present in user text) and the renderer turns it into a <strong>. Lets a data-tip bold part
// of itself (a name, a "VO:" prefix) without any HTML, and each segment is still set via
// textContent, so there is no injection risk from user content.
const B_OPEN = "\u0002";
const B_CLOSE = "\u0003";

/** Wrap `s` so it renders bold inside a tooltip (see the marker note above). */
export function tipBold(s: string): string { return `${B_OPEN}${s}${B_CLOSE}`; }

/** Render `text` into `host`, turning `\u0002…\u0003`-marked spans into <strong>; all set as text (safe). */
function renderTip(host: HTMLElement, text: string): void {
  host.textContent = "";
  const re = /\u0002([^\u0003]*)\u0003/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) host.append(text.slice(last, m.index));
    const strong = document.createElement("strong");
    strong.textContent = m[1] ?? "";
    host.append(strong);
    last = m.index + m[0].length;
  }
  if (last < text.length) host.append(text.slice(last));
}

export interface TooltipOptions {
  /** Called before every show: return true to keep the bubble down. For a mode
   *  that wants no chrome at all (Patterpad's Writing View). */
  suppressed?: () => boolean;
}

let inited = false;
let checked = false; // the one-shot no-host warning below has been scheduled
let suppressed: (() => boolean) | undefined;
const SHOW_DELAY = 350; // ms - snappier than the OS title delay, slow enough not to flicker on pass-through
const EDGE = 6;         // viewport inset so the bubble never touches the window edge
const GAP = 7;          // px between the anchor and the bubble

let tip: HTMLDivElement | null = null;
let timer = 0;
let active: HTMLElement | null = null;
/** The subject of a rect-anchored tip (see `tipAt`), when there is one. */
let activeKey: string | null = null;

function ensureEl(): HTMLDivElement {
  if (tip) return tip;
  const el = document.createElement("div");
  el.className = "tooltip";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  document.body.appendChild(el);
  tip = el;
  return el;
}

/** A rectangle in VIEWPORT coordinates, for anchoring a tip to something that is
 *  not a DOM element: a shape on a canvas, a run of text inside one. */
export interface TipRect { left: number; top: number; width: number; height: number }

const rectOf = (anchor: HTMLElement | TipRect): TipRect =>
  (anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor);

/** Anchor the (already-visible, so measurable) bubble above the anchor, flipping below near the top. */
function place(anchor: HTMLElement | TipRect): void {
  const t = ensureEl();
  const r = rectOf(anchor);
  const tr = t.getBoundingClientRect();
  let top = r.top - tr.height - GAP;
  if (top < EDGE) top = r.top + r.height + GAP; // not enough room above -> below
  let left = r.left + r.width / 2 - tr.width / 2;
  left = Math.max(EDGE, Math.min(left, window.innerWidth - tr.width - EDGE));
  t.style.left = `${Math.round(left)}px`;
  t.style.top = `${Math.round(top)}px`;
}

function show(anchor: HTMLElement): void {
  const text = anchor.dataset["tip"];
  if (!text) return;
  paint(anchor, text);
}

/** Fill, place and reveal the bubble. The one path: both the delegated
 *  `data-tip` route and `tipAt` end up here, so a canvas tip and a button tip
 *  are the same bubble with the same look and the same motion. */
function paint(anchor: HTMLElement | TipRect, text: string): void {
  if (suppressed?.()) return;
  const t = ensureEl();
  // A modal <dialog> (settings, a confirm) renders in the browser TOP LAYER, above every normal-flow
  // element whatever its z-index. If the anchor is inside one, move the bubble into that dialog so it
  // shares the top layer; otherwise keep it on <body>. Re-parenting per show also moves it back out
  // once the modal closes.
  const host: HTMLElement = (anchor instanceof HTMLElement ? anchor.closest<HTMLElement>("dialog[open]") : null)
    ?? document.body;
  if (t.parentElement !== host) host.appendChild(t);
  active = anchor instanceof HTMLElement ? anchor : null;
  renderTip(t, text);
  t.hidden = false;
  t.classList.remove("show"); void t.offsetWidth; // restart the enter animation
  place(anchor);                                  // measure + position now it has content + is visible
  t.classList.add("show");
}

function hide(): void {
  if (timer) { window.clearTimeout(timer); timer = 0; }
  active = null;
  activeKey = null;
  if (tip) { tip.hidden = true; tip.classList.remove("show"); }
}

function schedule(anchor: HTMLElement): void {
  if (anchor === active) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => show(anchor), SHOW_DELAY);
}

/**
 * Show a tip for something that has no DOM node of its own: a card on a canvas,
 * a zone, a pin. The caller says WHERE (a viewport rectangle) and WHAT, and
 * identifies the subject with `key`.
 *
 * The key is what makes this usable from a canvas. Re-calling with the same key
 * re-places the bubble WITHOUT restarting the delay, so a tip can follow its
 * shape while the camera moves; calling with a different key starts the wait
 * again, so sweeping the pointer across a dense board does not strobe.
 *
 * The bubble is ordinary DOM, so it holds its size whatever the canvas is
 * zoomed to. That is the point of it: the label it stands in for is the one
 * thing on a canvas that must not shrink with everything else.
 */
export function tipAt(key: string, rect: TipRect, text: string): void {
  if (key === activeKey) {
    // Already up for this subject: move it, do not re-animate it.
    if (tip && !tip.hidden) { renderTip(tip, text); place(rect); }
    return;
  }
  // A different subject: down first, then wait again. Leaving the old bubble up
  // during the wait would put one card's name over another card, which is worse
  // than no name at all - and it matches the delegated route, where leaving an
  // element hides the tip before the next one is scheduled.
  hide();
  activeKey = key;
  timer = window.setTimeout(() => { timer = 0; paint(rect, text); }, SHOW_DELAY);
}

/** Take any tip down: the pointer has left, or a gesture has started. */
export function hideTip(): void { hide(); }

/**
 * Mount the renderer because something is about to speak the grammar.
 *
 * The themed tooltip is not a feature a host turns on; it is the renderer for a grammar the shell's own
 * components already speak, and `data-tip` with nothing listening draws NOTHING - not the themed
 * bubble, not the platform one. That silence cost Patterpad two releases of a pin with no tooltip, and
 * cost it again when a `title` was converted to `data-tip` in a window that had never mounted this.
 *
 * So `el` calls this whenever it sets a tip. Mounting a delegated listener is the same class of act as
 * `confirmDialog` appending to `document.body`, which this package has always done.
 */
export function ensureTooltipHost(): void { initTooltips(); }

/**
 * One deferred check that an app writing `data-tip` ITSELF has a host, warning if not.
 *
 * `ensureTooltipHost` covers anything built through `el`. It cannot cover a `data-tip` written straight
 * into markup or set by hand, which is the case that leaves a whole window of dead tips with no shell
 * component involved - so that one gets a warning rather than silence. Scheduled once, after the
 * current task, so it sees a rendered document rather than an empty one.
 */
export function checkTooltipHost(): void {
  if (checked) return;
  checked = true;
  setTimeout(() => {
    if (inited || typeof document === "undefined") return;
    if (document.querySelector("[data-tip]")) {
      console.warn("app-shell: something set `data-tip` but no tooltip host is mounted, so those rollovers will not draw. Call initTooltips() once per window.");
    }
  }, 0);
}

const tipAncestor = (n: EventTarget | null): HTMLElement | null =>
  (n instanceof Element ? n.closest<HTMLElement>("[data-tip]") : null);

/**
 * Wire the one delegated controller. Mounting happens once; OPTIONS do not.
 *
 * An explicit call is always authoritative about its options, even after something else has already
 * mounted the listener. That ordering is not hypothetical, and Storyletter caught it before it shipped:
 * once components self-mount (see `ensureTooltipHost`), a host's own
 * `initTooltips({ suppressed })` could land second and be dropped by an early return, silently taking
 * a rule like "no tooltips in Writing View" with it. Nothing would fail and nothing would show.
 *
 * Components therefore call this with NO arguments: they mount the renderer without claiming the
 * options, and the host keeps the last word on behaviour.
 */
export function initTooltips(opts: TooltipOptions = {}): void {
  if (opts.suppressed !== undefined) suppressed = opts.suppressed; // an explicit call always wins
  if (inited) return;
  inited = true;

  document.addEventListener("pointerover", (e) => {
    const el = tipAncestor(e.target);
    if (el) schedule(el);
  });
  document.addEventListener("pointerout", (e) => {
    const el = tipAncestor(e.target);
    if (!el) return;
    const to = (e as PointerEvent).relatedTarget;
    if (to instanceof Node && el.contains(to)) return; // still inside the same anchor
    hide();
  });
  // Keyboard parity: reveal on focus, dismiss on blur.
  document.addEventListener("focusin", (e) => { const el = tipAncestor(e.target); if (el) schedule(el); });
  document.addEventListener("focusout", () => hide());
  // It's ANCHORED (not cursor-following), so anything that moves the layout or context dismisses it.
  document.addEventListener("pointerdown", () => hide(), true);
  document.addEventListener("scroll", () => { if (active) hide(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("blur", () => hide());
}
