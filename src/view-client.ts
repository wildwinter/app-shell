// ---------------------------------------------------------------------------
// The view client (tier 2 view extensions), for VIEW AUTHORS: what a view's
// web component imports to talk to the app it runs in. Tiny and
// dependency-free: it imports nothing but the protocol's types and constants.
//
//   const app = await connect();
//   const sel = await app.selection();
//   app.on("changed", () => redraw());
//
// Call `connect()` as the view's module loads (the port arrives once the page
// has loaded, and a listener added later misses it). It applies the app's
// theme to the page's root as custom properties (`var(--ink)`, ...), and
// passes on key combinations the view doesn't handle (Mod+Z runs the
// editor's undo); plain typing never leaves the view.
// ---------------------------------------------------------------------------

import { VIEW_API, VIEW_PORT_MESSAGE } from "./view-protocol.js";
import type {
  HostToView, ViewEdit, ViewEventName, ViewEvents, ViewMediaLength, ViewNode, ViewOp, ViewRefusal, ViewRequests,
  ViewSelection, ViewTheme, ViewWelcome,
} from "./view-protocol.js";

export type {
  HostToView, ViewEdit, ViewEventName, ViewEvents, ViewHostName, ViewJson, ViewMediaLength, ViewNode, ViewOp,
  ViewRefusal, ViewRequests, ViewSelection, ViewTheme, ViewWelcome, ViewWritable,
} from "./view-protocol.js";
export { VIEW_API } from "./view-protocol.js";

/** A refused request: the host's sentence as the message, and its refusal (`code`) for the view to act on. */
export class ViewRefusalError extends Error {
  readonly refusal: ViewRefusal;
  constructor(refusal: ViewRefusal) {
    super(refusal.message);
    this.name = "ViewRefusalError";
    this.refusal = refusal;
  }
}

export interface ConnectOptions {
  /** How long to wait for the port and the app's welcome, in ms (default 10000). */
  timeoutMs?: number;
  /** A port already in hand, instead of waiting for the preload's (tests, or a host of another kind). */
  port?: MessagePort;
  /** The window to listen on and apply the theme and keys to (default `window`). */
  window?: Window;
  /** Pass unhandled key combinations on to the app (default true). */
  keys?: boolean;
}

export interface ViewClient {
  /** What the app said on welcoming the view: host, extension, view, theme, writable. */
  readonly welcome: ViewWelcome;
  request<K extends ViewOp>(op: K, args: ViewRequests[K]["args"]): Promise<ViewRequests[K]["value"]>;
  project(): Promise<ViewNode>;
  node(id: string, opts?: { children?: boolean }): Promise<ViewNode | null>;
  selection(): Promise<ViewSelection>;
  media(ids: string[]): Promise<{ [id: string]: ViewMediaLength }>;
  write(label: string, edits: ViewEdit[]): Promise<{ written: number }>;
  select(id: string): Promise<boolean>;
  /** Play a line's take in the app: true when it plays, false when it has none. Rejects (`unsupported`, or
   *  `bad-request` from an app before app-shell 0.60) where the app plays no audio. */
  play(id: string): Promise<boolean>;
  /** Stop the take playing: true when one was. */
  stop(): Promise<boolean>;
  /** Listen for an event; returns the unsubscribe. */
  on<K extends ViewEventName>(name: K, fn: (value: ViewEvents[K]) => void): () => void;
  close(): void;
}

/** Set the theme's tokens as custom properties on the root, and its colour scheme. */
export function applyTheme(theme: ViewTheme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(theme.tokens)) if (name.startsWith("--")) root.style.setProperty(name, value);
  root.style.setProperty("color-scheme", theme.scheme);
}

const isMac = (w: Window): boolean => {
  const nav = w.navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? "");
};

const NAMED: Record<string, string> = {
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Escape: "Esc", " ": "Space",
};

/** A key event in the shell's portable spelling ("Mod+Shift+Z"), or null for a bare modifier. */
export function comboOf(e: KeyboardEvent, mac: boolean): string | null {
  if (["Meta", "Control", "Shift", "Alt", "OS"].includes(e.key)) return null;
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (mac && e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else key = NAMED[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  parts.push(key);
  return parts.join("+");
}

/** The combinations whose page default is the page's own undo: the app's runs instead. */
const UNDO = new Set(["Mod+Z", "Mod+Shift+Z", "Mod+Y"]);

/** Wait for the app's port, say hello, and resolve once the app welcomes the view (rejected with its sentence). */
export function connect(opts: ConnectOptions = {}): Promise<ViewClient> {
  const w = opts.window ?? window;
  const timeoutMs = opts.timeoutMs ?? 10000;
  return new Promise<ViewClient>((resolve, reject) => {
    let settled = false;
    const fail = (message: string, port?: MessagePort): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener("message", onWindow);
      port?.close();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("The app didn't answer this view in time."), timeoutMs);

    const begin = (port: MessagePort): void => {
      w.removeEventListener("message", onWindow);
      const first = (e: MessageEvent): void => {
        const msg = e.data as HostToView;
        if (!msg || typeof msg !== "object") return;
        if (msg.t === "refused") { port.removeEventListener("message", first as EventListener); fail(msg.message, port); return; }
        if (msg.t !== "welcome" || settled) return;
        settled = true;
        clearTimeout(timer);
        port.removeEventListener("message", first as EventListener);
        resolve(client(port, msg, w, opts.keys ?? true));
      };
      port.addEventListener("message", first as EventListener);
      port.start();
      port.postMessage({ t: "hello", api: VIEW_API });
    };
    function onWindow(e: MessageEvent): void {
      if (e.source !== w) return;
      const d = e.data as unknown;
      const ours = d === VIEW_PORT_MESSAGE || (typeof d === "object" && d !== null && (d as { type?: unknown }).type === VIEW_PORT_MESSAGE);
      const port = e.ports?.[0];
      if (ours && port) begin(port);
    }
    if (opts.port) begin(opts.port);
    else w.addEventListener("message", onWindow);
  });
}

function client(port: MessagePort, welcome: ViewWelcome, w: Window, keys: boolean): ViewClient {
  let next = 1;
  let closed = false;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners = new Map<ViewEventName, Set<(value: never) => void>>();
  const root = w.document.documentElement;
  applyTheme(welcome.theme, root);

  const onMessage = (e: MessageEvent): void => {
    const msg = e.data as HostToView;
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "reply") {
      const p = waiting.get(msg.id);
      if (!p) return;
      waiting.delete(msg.id);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new ViewRefusalError(msg.refusal));
    } else if (msg.t === "event") {
      if (msg.name === "theme") applyTheme(msg.value as ViewTheme, root);
      for (const fn of listeners.get(msg.name) ?? []) {
        try { (fn as (v: unknown) => void)(msg.value); } catch (err) { console.error(err); }
      }
    }
  };
  port.addEventListener("message", onMessage as EventListener);

  const mac = isMac(w);
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || closed || !(e.metaKey || e.ctrlKey)) return;
    const combo = comboOf(e, mac);
    if (!combo) return;
    if (UNDO.has(combo)) e.preventDefault();
    port.postMessage({ t: "key", combo });
  };
  if (keys) w.addEventListener("keydown", onKey);

  const request = <K extends ViewOp>(op: K, args: ViewRequests[K]["args"]): Promise<ViewRequests[K]["value"]> => {
    if (closed) return Promise.reject(new Error("This view's connection to the app is closed."));
    const id = next++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      port.postMessage({ t: "request", id, op, args });
    });
  };

  return {
    welcome,
    request,
    project: () => request("project", {}),
    node: (id, o) => request("node", o?.children !== undefined ? { id, children: o.children } : { id }),
    selection: () => request("selection", {}),
    media: (ids) => request("media", { ids }),
    write: (label, edits) => request("write", { label, edits }),
    select: (id) => request("select", { id }),
    play: (id) => request("play", { id }),
    stop: () => request("stop", {}),
    on(name, fn) {
      let set = listeners.get(name);
      if (!set) listeners.set(name, (set = new Set()));
      set.add(fn as (value: never) => void);
      return () => { set.delete(fn as (value: never) => void); };
    },
    close() {
      if (closed) return;
      closed = true;
      w.removeEventListener("keydown", onKey);
      port.removeEventListener("message", onMessage as EventListener);
      port.close();
      for (const p of waiting.values()) p.reject(new Error("This view's connection to the app is closed."));
      waiting.clear();
    },
  };
}
