// ---------------------------------------------------------------------------
// The tool-window kit, MAIN-PROCESS half: the detached helper-window
// machinery both apps had grown four copies of (Patterpad's Play + Search +
// Coverage, Storyletter's Board + Find). Remembered bounds with a
// disconnected-monitor guard, debounced persistence, the Reset View rescue,
// and the pinnable window factory they compose into.
//
// This module imports electron, so it ships as its own subpath
// (@wildwinter/app-shell/tool-window) - never import it from renderer code.
// The renderer half (pin button, .swin drag-bar grammar) lives in the root
// export + tool-window.css.
//
// Two deliberate corrections over the Patterpad originals, for when it
// migrates here: rescueToolWindow re-pins EVERY window it rescues (Patterpad
// re-pinned only Play, so its store lied about Search + Coverage), and the
// factory always wires closed-cleanup through an identity guard.
// ---------------------------------------------------------------------------

import { BrowserWindow, app, screen } from "electron";
import { join } from "node:path";
import type { Satellite } from "./session.js";

export interface ToolWindowSize {
  width: number;
  height: number;
}

export interface ToolWindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

/** The per-window store slice every app remembers: where it was, whether it
 *  floats. (Patterpad's PlayWindowState, generalised.) */
export interface ToolWindowState {
  bounds?: ToolWindowBounds;
  pinned: boolean;
}

/** Use a remembered rect only if it still intersects a live display (a window
 *  saved on a now-disconnected monitor must not open offscreen). Falls back
 *  to the default size; a remembered size is kept even when the position is
 *  dropped (Electron then centres it). */
export function savedWindowRect(
  saved: ToolWindowBounds | undefined,
  def: ToolWindowSize,
  min: ToolWindowSize,
): ToolWindowBounds {
  if (!saved) return { ...def };
  const w = Math.max(min.width, saved.width), h = Math.max(min.height, saved.height);
  if (saved.x != null && saved.y != null) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return saved.x! + w > a.x + 40 && saved.x! < a.x + a.width - 40 && saved.y! + h > a.y + 20 && saved.y! < a.y + a.height - 20;
    });
    if (onScreen) return { x: saved.x, y: saved.y, width: w, height: h };
  }
  return { width: w, height: h };
}

/** Persist a helper window's bounds as the user moves / resizes / closes it
 *  (debounced 400ms; close flushes synchronously). */
export function rememberBounds(w: BrowserWindow, write: (bounds: ToolWindowBounds) => void): void {
  const saveBounds = (): void => { if (!w.isDestroyed()) write(w.getBounds()); };
  let boundsTimer: ReturnType<typeof setTimeout> | undefined;
  const queueSave = (): void => { clearTimeout(boundsTimer); boundsTimer = setTimeout(saveBounds, 400); };
  w.on("resize", queueSave);
  w.on("move", queueSave);
  w.on("close", () => { clearTimeout(boundsTimer); saveBounds(); });
}

/** Centre a rect on the primary display's work area. */
export function centeredOnPrimary(size: ToolWindowSize): { x: number; y: number } {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: Math.round(a.x + (a.width - size.width) / 2), y: Math.round(a.y + (a.height - size.height) / 2) };
}

/** Reset View's per-window half: un-minimise, re-pin (always - the store
 *  says pinned:true after a rescue, so the window must agree), default size,
 *  centred on the primary display, shown. The host clears its remembered
 *  bounds itself (that's a store concern). No focus steal: helpers show
 *  behind the editor. */
export function rescueToolWindow(w: BrowserWindow | undefined | null, def: ToolWindowSize): void {
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  w.setBounds({ ...def, ...centeredOnPrimary(def) });
  w.show();
  // Raise within OUR stack. This used to setAlwaysOnTop(true), which on macOS
  // and Windows floats the window above every other APPLICATION - and stuck
  // that way, since nothing ever unset it.
  w.moveTop();
}

/** macOS pinned windows, for the activation toggle below. */
const macPinned = new Set<BrowserWindow>();
let macActivationWired = false;
function wireMacActivation(): void {
  if (macActivationWired) return;
  macActivationWired = true;
  // Floating is a GLOBAL window level: left on while another app is front,
  // the pinned window would sit over that app too - the exact 2026-08-25
  // complaint. Scoping it to our app's active state keeps the pin meaning
  // "above my editor" and nothing more.
  app.on("did-become-active", () => { for (const w of macPinned) if (!w.isDestroyed()) w.setAlwaysOnTop(true, "floating"); });
  app.on("did-resign-active", () => { for (const w of macPinned) if (!w.isDestroyed()) w.setAlwaysOnTop(false); });
}

/**
 * The pin: keep a tool window above THIS APP'S MAIN WINDOW, not above the
 * world. Two findings shaped the mechanism, one per platform family:
 *
 * - Bare `alwaysOnTop` (the first implementation) floats the window over
 *   every other application on macOS and Windows, so a pinned Board meant
 *   nothing else on the machine could come to the front (a Storyletter user
 *   report, 2026-08-25).
 * - A CHILD window (the second implementation) is position-coupled to its
 *   parent on macOS: dragging the editor dragged the Board with it (a
 *   Storyletter user report, 2026-08-28). Windows and Linux owned windows do
 *   not move with their owner, so the child mechanism stays right for them.
 *
 * So: on macOS the pin is ACTIVATION-SCOPED alwaysOnTop - floating while
 * this app is active, dropped the moment it resigns - which is above the
 * editor without following its drags and without covering anyone else. On
 * Windows and Linux the pin is a child window, which stays over its parent
 * and stacks normally against everything else. Each branch clears the other
 * mechanism first, which also heals a window an older build pinned the old
 * way. `platform` is a seam for the tests; leave it defaulted.
 */
export function pinToolWindow(
  w: BrowserWindow | undefined | null, parent: BrowserWindow | undefined | null, on: boolean,
  platform: NodeJS.Platform = process.platform,
): void {
  if (!w || w.isDestroyed()) return;
  if (platform === "darwin") {
    w.setParentWindow(null);
    if (on) {
      if (!macPinned.has(w)) {
        macPinned.add(w);
        w.once("closed", () => macPinned.delete(w));
      }
      wireMacActivation();
      // Raise only when the app is active now; otherwise the next
      // did-become-active raises it.
      w.setAlwaysOnTop(BrowserWindow.getFocusedWindow() !== null, "floating");
    } else {
      macPinned.delete(w);
      w.setAlwaysOnTop(false);
    }
    return;
  }
  w.setAlwaysOnTop(false);
  w.setParentWindow(on && parent && !parent.isDestroyed() ? parent : null);
}

export interface ToolWindowOptions {
  title: string;
  /** Renderer entry, relative to rendererDir (e.g. "table.html", "search/index.html"). */
  page: string;
  /** Absolute path of the built renderer dir (join(import.meta.dirname, "../renderer")). */
  rendererDir: string;
  /** Absolute path of the preload bridge. */
  preload: string;
  rect: ToolWindowBounds;
  min?: ToolWindowSize;
  /** false = frameless: the renderer draws its own slim drag bar (.swin-head). */
  frame?: boolean;
  /** The window to PIN ABOVE: the app's main window, resolved at open time (a
   *  getter, because the main window can be recreated). With `pinned` true
   *  the new tool window rides above it - on macOS via activation-scoped
   *  alwaysOnTop (a child window there follows the editor's drags), on
   *  Windows and Linux as a child window (bare alwaysOnTop there floats over
   *  the whole machine). See pinToolWindow for both findings. */
  pinTo?: () => BrowserWindow | undefined;
  /** Start pinned (the host remembers); flip later with `pinToolWindow`. */
  pinned?: boolean;
  /** Wire debounced bounds persistence into the host's store slice. */
  remember?: (bounds: ToolWindowBounds) => void;
  /** Fired when THIS window closes (identity-guarded; a stale close never
   *  clears a newer window). Null the host's handle here. */
  onClosed?: () => void;
}

/** The pinnable detached-window factory (hardened webPreferences, one
 *  preload, electron-vite's dev-URL/file split). Focuses and returns the
 *  existing window when there is one; otherwise creates, wires, and loads. */
export function openToolWindow(existing: BrowserWindow | undefined | null, opts: ToolWindowOptions): BrowserWindow {
  if (existing && !existing.isDestroyed()) { existing.focus(); return existing; }
  const w = new BrowserWindow({
    ...opts.rect,
    ...(opts.min !== undefined ? { minWidth: opts.min.width, minHeight: opts.min.height } : {}),
    show: false,
    title: opts.title,
    ...(opts.frame !== undefined ? { frame: opts.frame } : {}),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: opts.preload,
    },
  });
  if (opts.pinTo !== undefined) pinToolWindow(w, opts.pinTo(), opts.pinned ?? false);
  if (opts.remember) rememberBounds(w, opts.remember);
  w.once("ready-to-show", () => w.show());
  if (opts.onClosed) w.on("closed", opts.onClosed);
  if (process.env["ELECTRON_RENDERER_URL"]) void w.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/${opts.page}`);
  else void w.loadFile(join(opts.rendererDir, opts.page));
  return w;
}

// ---------------------------------------------------------------------------
// The tool windows AS DATA: one row per window, and everything that walks the
// windows walks the rows. Lifted from Storyletter's TOOL_WINDOWS table +
// openToolWindowFor + rescueWindows (studio/src/main/index.ts), where it had
// replaced four near-identical openX() functions whose differences were all
// mistakes (only one forwarded its console; Reset View rescued two of four).
// Patterpad's three hand copies (createPlayWindow / createSearchWindow /
// createCoverageWindow and a four-branch rescueWindows) become three rows.
//
// Two things the table makes structurally impossible: forgetting to register
// a window as a satellite for the project-changed nudge (every row is
// registered when a session is given), and Reset View rescuing a subset (it
// walks the rows).
// ---------------------------------------------------------------------------


export interface ToolWindowSpec<N extends string = string> {
  /** The window's key: the store slice it remembers under, the dev-console
   *  prefix, and what `open(name)` takes. */
  name: N;
  title: string;
  /** Renderer entry, relative to the env's rendererDir. */
  page: string;
  def: ToolWindowSize;
  min: ToolWindowSize;
  /** The remembered rect, read at open time (a store read-through). */
  bounds: () => ToolWindowBounds | undefined;
  /** Persist a moved / resized rect (debounced by the factory). */
  remember: (bounds: ToolWindowBounds) => void;
  /** Whether it starts pinned above the editor (both apps default true). */
  pinned: () => boolean;
  /** Frameless (the family's shape: the renderer draws `toolWindowHead`).
   *  Default false = frameless; pass `frame: true` for an OS title bar. */
  frame?: boolean;
  /** The project-changed channel for THIS window when it differs from the
   *  env's (Storyletter's Links window listens on "links:focus"). */
  channel?: string;
  /** Drop what main caches for the outgoing project on this window's behalf
   *  (a coverage report, a search anchor). Runs whether the window is open
   *  or not: see session.ts. */
  clear?: () => void;
}

export interface ToolWindowEnv {
  /** Absolute path of the built renderer dir. */
  rendererDir: string;
  /** Absolute path of the preload bridge. */
  preload: string;
  /** The window to pin above: the app's main window, resolved at open time. */
  pinTo: () => BrowserWindow | undefined;
  /** Register every row as a satellite of the project session, so a new
   *  project cannot open underneath a tool window that still shows the old
   *  one. `channel` is the nudge each window listens on (a row may override). */
  session?: { addSatellite: (satellite: Satellite) => () => void; channel: string };
  /** Reset View's store half, run first: forget every remembered rect and
   *  set pinned true (`resetWindows(store)` from app-store, or the app's own). */
  resetStore?: () => void;
  /** The channel a rescued window's renderer hears its re-pin on, so its pin
   *  button agrees with the store (default "state:pinned"). */
  pinChannel?: string;
  /** Runs once per window created: forward its console in dev, say. */
  onOpened?: (w: BrowserWindow, name: string) => void;
}

export interface ToolWindows<N extends string> {
  /** Open (or focus) one window by name. */
  open(name: N): BrowserWindow;
  /** The live window, if open. */
  get(name: N): BrowserWindow | undefined;
  /** Reset View's window half, over the table: store reset, then every open
   *  window restored, default size, centred, re-pinned, and told so. */
  rescue(): void;
  /** Every window that is open right now. */
  all(): BrowserWindow[];
  readonly names: readonly N[];
}

/** Build the table. The windows are owned here: a host reads them through
 *  `get(name)` rather than holding module variables of its own. */
export function defineToolWindows<N extends string>(specs: ToolWindowSpec<N>[], env: ToolWindowEnv): ToolWindows<N> {
  const live = new Map<N, BrowserWindow>();
  const byName = (name: N): ToolWindowSpec<N> => {
    const found = specs.find((s) => s.name === name);
    if (!found) throw new Error(`no tool window "${name}"`);
    return found;
  };
  const get = (name: N): BrowserWindow | undefined => {
    const w = live.get(name);
    return w && !w.isDestroyed() ? w : undefined;
  };
  if (env.session) {
    for (const spec of specs) {
      env.session.addSatellite({
        window: () => get(spec.name),
        channel: spec.channel ?? env.session.channel,
        ...(spec.clear ? { clear: spec.clear } : {}),
      });
    }
  }
  const open = (name: N): BrowserWindow => {
    const spec = byName(name);
    const existing = get(name);
    const opened = openToolWindow(existing, {
      title: spec.title, page: spec.page, frame: spec.frame ?? false,
      rendererDir: env.rendererDir, preload: env.preload,
      rect: savedWindowRect(spec.bounds(), spec.def, spec.min),
      min: spec.min,
      pinTo: env.pinTo,
      pinned: spec.pinned(),
      remember: spec.remember,
    });
    if (opened !== existing) {
      live.set(name, opened);
      // Identity-guarded: a stale close never clears a newer window.
      opened.on("closed", () => { if (live.get(name) === opened) live.delete(name); });
      env.onOpened?.(opened, name);
    }
    return opened;
  };
  const rescue = (): void => {
    env.resetStore?.();
    for (const spec of specs) rescueToolWindow(get(spec.name), spec.def);
    // ACTUALLY pin them, then tell them. `rescueToolWindow` restores, resizes,
    // centres and raises but never pins; the store now says pinned, so the
    // window and its button have to agree before the claim is made.
    for (const spec of specs) {
      const w = get(spec.name);
      if (!w) continue;
      pinToolWindow(w, env.pinTo(), true);
      w.webContents.send(env.pinChannel ?? "state:pinned", true);
    }
  };
  return {
    open, get, rescue,
    all: () => specs.map((s) => get(s.name)).filter((w): w is BrowserWindow => w !== undefined),
    names: specs.map((s) => s.name),
  };
}
