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

import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

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

/**
 * The pin: keep a tool window above THIS APP'S MAIN WINDOW, not above the
 * world. `alwaysOnTop` was the first implementation and it floats the window
 * over every other application on macOS and Windows, so a pinned Board meant
 * nothing else on the machine could come to the front (a Storyletter user
 * report, 2026-08-25). A CHILD window is the semantic actually wanted on both
 * platforms: it stays over its parent and stacks normally against everything
 * else. Clearing any alwaysOnTop first also heals a window an older build
 * pinned the old way.
 */
export function pinToolWindow(
  w: BrowserWindow | undefined | null, parent: BrowserWindow | undefined | null, on: boolean,
): void {
  if (!w || w.isDestroyed()) return;
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
   *  getter, because the main window can be recreated). With `pinned` true the
   *  new tool window is parented to it, which keeps it above the editor and
   *  stacks it normally against every other application - the semantic
   *  `alwaysOnTop` (this option's late predecessor) got wrong on macOS and
   *  Windows, where it floats over the whole machine. */
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
