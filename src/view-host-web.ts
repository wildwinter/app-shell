// ---------------------------------------------------------------------------
// The view host, RENDERER half (tier 2 view extensions): `hostView` answers a
// view over its MessagePort from an adapter over the app's own model, in the
// editor's renderer, which holds what the writer sees. `onViewPort` takes the
// ports main hands the editor (through the editor preload's snippet, README
// v0.58), and `readTheme` reads the palette a view draws in.
//
// What hostView guarantees, whatever the adapter does: nothing answered
// before a hello for this API; every request's shape checked; `ext` kept to
// the view's own extension and its manifest's `reads`; writes refused whole
// when not writable; a throw answered as `failed`; `changed` debounced.
// ---------------------------------------------------------------------------

import { VIEW_API, VIEW_PORT_MESSAGE } from "./view-protocol.js";
import type {
  HostToView, ViewAdapter, ViewEdit, ViewEventName, ViewEvents, ViewHandle, ViewJson, ViewNode, ViewOp, ViewPortMeta,
  ViewRefusal, ViewTheme, ViewWelcome,
} from "./view-protocol.js";

/** The palette names the family's apps define, read for a view's theme. */
const PALETTE_TOKENS = [
  "--bg", "--surface", "--card", "--ink", "--muted", "--line", "--line-soft", "--accent", "--accent-soft", "--on-accent",
  "--danger", "--warn", "--ok", "--font-ui", "--font-read", "--font-mono",
  ...Array.from({ length: 12 }, (_, i) => `--char-${i}`),
];
/** The shell's grammar tokens (tokens.css) a view can use too. The animations are left out: their keyframes
 *  live in the app's stylesheets, not the view's. */
const GRAMMAR_TOKENS = [
  "--color-scheme", "--chrome-size", "--scrim", "--shadow-1", "--shadow-2", "--shadow-3",
  "--ease-standard", "--dur-quick", "--dur-base", "--dur-settle", "--dur-slow", "--dur-panel", "--dur-exit",
  "--radius-sm", "--radius-md", "--radius-lg", "--radius-pill", "--scroll-thumb", "--scroll-thumb-hover",
];
/** Every token `readTheme` reads, in order. */
export const VIEW_THEME_TOKENS: readonly string[] = [...PALETTE_TOKENS, ...GRAMMAR_TOKENS];

/**
 * The app's theme as a view needs it: each of `VIEW_THEME_TOKENS` the root sets, computed, and the scheme from
 * the root's computed `color-scheme` (dark when it's exactly "dark"; with both, the OS's preference; else light).
 */
export function readTheme(root: Element = document.documentElement, tokens: readonly string[] = VIEW_THEME_TOKENS): ViewTheme {
  const style = getComputedStyle(root);
  const out: Record<string, string> = {};
  for (const name of tokens) {
    const value = style.getPropertyValue(name).trim();
    if (value !== "") out[name] = value;
  }
  const declared = (style.getPropertyValue("color-scheme") || (style as unknown as { colorScheme?: string }).colorScheme || "").trim();
  const words = declared.split(/\s+/);
  let scheme: "light" | "dark" = "light";
  if (declared === "dark") scheme = "dark";
  else if (words.includes("light") && words.includes("dark")) {
    scheme = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return { scheme, tokens: out };
}

/**
 * Take the ports main hands this window for views: the editor preload posts each with its meta (README v0.58).
 * A second port for the same `meta.window` means one end reloaded: close the old `hostView` handle and host the
 * new port. Returns the unsubscribe.
 */
export function onViewPort(
  fn: (port: MessagePort, meta: ViewPortMeta) => void, target: Window = window, closed?: (meta: ViewPortMeta) => void,
): () => void {
  const listener = (e: MessageEvent): void => {
    if (e.source !== target) return;
    const data = e.data as { type?: unknown; meta?: unknown } | null;
    if (!data || typeof data !== "object" || data.type !== VIEW_PORT_MESSAGE) return;
    const port = e.ports?.[0];
    const meta = data.meta as ViewPortMeta | undefined;
    if (!meta || typeof meta.window !== "number" || typeof meta.extension !== "string" || typeof meta.view !== "string") return;
    if (meta.closed === true) { closed?.(meta); return; }
    if (!port) return;
    fn(port, meta);
  };
  target.addEventListener("message", listener);
  return () => target.removeEventListener("message", listener);
}

export interface HostViewOptions {
  /** What main said about this view with its port. */
  meta: ViewPortMeta;
  /** The manifest's `reads`: the other extensions whose data the view sees. */
  reads: readonly string[];
  /** The theme to send; `readTheme()` by default. */
  theme?: () => ViewTheme;
  /** The extension's and the view's names, for the refusal sentence; the ids by default. */
  names?: { extension?: string; view?: string };
  /** How long `changed` waits to gather nodes before it's sent, in ms (default 100). */
  debounceMs?: number;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v !== "";

function isJson(v: unknown, depth = 0): v is ViewJson {
  if (depth > 64) return false;
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isJson(x, depth + 1));
  if (isObj(v)) return Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every((x) => isJson(x, depth + 1));
  return false;
}

const bad = (message: string): ViewRefusal => ({ code: "bad-request", message });

/** The args' shape for each op, or why not. */
function argsProblem(op: ViewOp, args: Record<string, unknown>): string | null {
  switch (op) {
    case "project": case "selection": return null;
    case "node":
      if (!isId(args["id"])) return "A node request names the node by its id.";
      if (args["children"] !== undefined && typeof args["children"] !== "boolean") return "A node request's children is true or false.";
      return null;
    case "media":
      if (!Array.isArray(args["ids"]) || !args["ids"].every(isId)) return "A media request lists the lines' ids.";
      return null;
    case "select":
      return isId(args["id"]) ? null : "A select request names the node by its id.";
    case "write": {
      if (typeof args["label"] !== "string" || args["label"].trim() === "") return "A write has a label, for the undo step.";
      const edits = args["edits"];
      if (!Array.isArray(edits)) return "A write lists its edits.";
      for (const e of edits) {
        if (!isObj(e) || !isId(e["node"])) return "Each edit names its node by id.";
        if (typeof e["field"] !== "string" || !NAME.test(e["field"])) return "Each edit names one of the extension's fields, never a path inside one.";
        if ("value" in e && e["value"] !== undefined && !isJson(e["value"])) return `The value for ${e["field"]} isn't plain JSON.`;
      }
      return null;
    }
  }
}

const OPS: readonly ViewOp[] = ["project", "node", "selection", "media", "write", "select"];

/**
 * Answer a view over its port from the app's adapter. Returns the handle the app calls as its model, selection,
 * theme, or locks change, and `close()` when the view goes (or a new port for it arrives).
 */
export function hostView(port: MessagePort, adapter: ViewAdapter, opts: HostViewOptions): ViewHandle {
  const { meta } = opts;
  const ext = meta.extension;
  const allowed = new Set([ext, ...opts.reads]);
  const theme = opts.theme ?? (() => readTheme());
  const debounceMs = opts.debounceMs ?? 100;
  let welcomed = false;
  let closed = false;
  let pending: Set<string> | "all" | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const post = (msg: HostToView): void => { if (!closed) port.postMessage(msg); };
  const emit = <K extends ViewEventName>(name: K, value: ViewEvents[K]): void => {
    if (welcomed) post({ t: "event", name, value });
  };

  const filterNode = (node: ViewNode): ViewNode => {
    const keptExt: Record<string, ViewNode["ext"][string]> = {};
    for (const [id, data] of Object.entries(node.ext ?? {})) if (allowed.has(id)) keptExt[id] = data;
    const base: ViewNode = { id: node.id, kind: node.kind, parent: node.parent, label: node.label, host: node.host ?? {}, ext: keptExt };
    const out: ViewNode = typeof node.held === "string" ? { ...base, held: node.held } : base;
    return node.children ? { ...out, children: node.children.map(filterNode) } : out;
  };

  const answer = async (op: ViewOp, args: Record<string, unknown>): Promise<{ value: unknown } | { refusal: ViewRefusal }> => {
    switch (op) {
      case "project": return { value: filterNode(await adapter.project()) };
      case "node": {
        const node = await adapter.node(args["id"] as string, args["children"] === true);
        return { value: node ? filterNode(node) : null };
      }
      case "selection": return { value: await adapter.selection() };
      case "media":
        if (!adapter.media) return { refusal: { code: "unsupported", message: "This app has no recordings or timings for lines." } };
        return { value: await adapter.media(args["ids"] as string[]) };
      case "select": return { value: await adapter.select(args["id"] as string) };
      case "write": {
        const writable = adapter.writable(ext);
        if (writable.readOnly) return { refusal: { code: "read-only", message: writable.why ?? "This project is read-only just now." } };
        const edits = (args["edits"] as ViewEdit[]).map((e) => ("value" in e && e.value !== undefined
          ? { node: e.node, field: e.field, value: e.value } : { node: e.node, field: e.field }));
        if (edits.length === 0) return { value: { written: 0 } };
        if (edits.length > 1) {
          const projectId = (await adapter.project()).id;
          const onProject = edits.filter((e) => e.node === projectId).length;
          if (onProject > 0 && onProject < edits.length) {
            return { refusal: bad("A write changes the project or other nodes, not both: they undo separately. Make two writes.") };
          }
        }
        const refused = await adapter.write(ext, args["label"] as string, edits);
        if (refused) return { refusal: refused };
        return { value: { written: edits.length } };
      }
    }
  };

  const request = async (msg: Record<string, unknown>): Promise<void> => {
    const id = msg["id"];
    if (typeof id !== "number" || !Number.isInteger(id)) return;   // nothing to answer to
    const reply = (r: { value: unknown } | { refusal: ViewRefusal }): void =>
      post("refusal" in r ? { t: "reply", id, ok: false, refusal: r.refusal } : { t: "reply", id, ok: true, value: r.value });
    const op = msg["op"];
    if (typeof op !== "string" || !OPS.includes(op as ViewOp)) {
      reply({ refusal: bad(`There's no request called ${JSON.stringify(op)}.`) });
      return;
    }
    const args = msg["args"] ?? {};
    if (!isObj(args)) { reply({ refusal: bad("A request's args are an object.") }); return; }
    const problem = argsProblem(op as ViewOp, args);
    if (problem) { reply({ refusal: bad(problem) }); return; }
    try {
      reply(await answer(op as ViewOp, args));
    } catch (e) {
      reply({ refusal: { code: "failed", message: `The app couldn't do that: ${e instanceof Error ? e.message : String(e)}` } });
    }
  };

  const hello = (msg: Record<string, unknown>): void => {
    const api = msg["api"];
    if (api !== VIEW_API) {
      const who = `${opts.names?.extension ?? ext}'s ${opts.names?.view ?? meta.view}`;
      const message = typeof api === "number"
        ? `${who} was built for view API ${api}; this app serves ${VIEW_API}.`
        : `${who} didn't say which view API it was built for; this app serves ${VIEW_API}.`;
      post({ t: "refused", message });
      close(false);
      return;
    }
    const welcome: ViewWelcome = {
      t: "welcome", api: VIEW_API, host: adapter.host,
      extension: { id: ext, version: meta.version, ...(meta.pinned !== undefined ? { pinned: meta.pinned } : {}) },
      view: meta.view,
      theme: theme(),
      writable: adapter.writable(ext),
    };
    welcomed = true;
    post(welcome);
  };

  const onMessage = (e: MessageEvent): void => {
    const msg = e.data as unknown;
    if (closed || !isObj(msg)) return;
    if (!welcomed) {
      // Nothing is answered before the hello.
      if (msg["t"] === "hello") hello(msg);
      return;
    }
    if (msg["t"] === "request") void request(msg);
    else if (msg["t"] === "key" && typeof msg["combo"] === "string") adapter.key?.(msg["combo"]);
  };
  port.addEventListener("message", onMessage as EventListener);
  port.start();

  const flush = (): void => {
    timer = undefined;
    const nodes = pending;
    pending = null;
    if (nodes === null) return;
    emit("changed", { nodes: nodes === "all" ? "all" : [...nodes] });
  };

  function close(sayClosing = true): void {
    if (closed) return;
    if (sayClosing) emit("closing", {});
    clearTimeout(timer);
    closed = true;
    port.removeEventListener("message", onMessage as EventListener);
    port.close();
  }

  return {
    changed(nodes) {
      if (closed || !welcomed) return;
      if (nodes === "all" || pending === "all") pending = "all";
      else {
        pending ??= new Set();
        for (const n of nodes) pending.add(n);
      }
      if (timer === undefined) timer = setTimeout(flush, debounceMs);
    },
    selection() {
      if (closed || !welcomed) return;
      void Promise.resolve().then(() => adapter.selection()).then((s) => emit("selection", s), () => {});
    },
    theme() { if (!closed) emit("theme", theme()); },
    writable() { if (!closed) emit("writable", adapter.writable(ext)); },
    close: () => close(true),
  };
}

export interface HostViewsSetup {
  adapter: ViewAdapter;
  /** The manifest's `reads`. */
  reads: readonly string[];
  names?: HostViewOptions["names"];
}

/** Every view open on this editor, hosted together: what `hostViews` returns. */
export interface ViewHosts extends ViewHandle {
  /** How many views are open. */
  readonly size: number;
  /** Stop taking ports and close every view's handle. */
  dispose(): void;
}

/**
 * Host every view main hands this editor: `onViewPort` and `hostView` together, one handle per view window. A
 * new port for a window replaces its old handle (one end reloaded), and a window's `closed` drops it. `setup`
 * gives the adapter for a view, or null to refuse it (its port is closed). The returned handle's calls reach
 * every open view, so the app calls them once on each change.
 */
export function hostViews(setup: (meta: ViewPortMeta) => HostViewsSetup | null, opts: { target?: Window; theme?: () => ViewTheme; debounceMs?: number } = {}): ViewHosts {
  const handles = new Map<number, ViewHandle>();
  const drop = (meta: ViewPortMeta): void => { handles.get(meta.window)?.close(); handles.delete(meta.window); };
  const stop = onViewPort((port, meta) => {
    drop(meta);
    const s = setup(meta);
    if (!s) { port.close(); return; }
    handles.set(meta.window, hostView(port, s.adapter, {
      meta, reads: s.reads,
      ...(s.names !== undefined ? { names: s.names } : {}),
      ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
      ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
    }));
  }, opts.target ?? window, drop);
  const each = (f: (h: ViewHandle) => void): void => { for (const h of handles.values()) f(h); };
  return {
    get size() { return handles.size; },
    changed: (nodes) => each((h) => h.changed(nodes)),
    selection: () => each((h) => h.selection()),
    theme: () => each((h) => h.theme()),
    writable: () => each((h) => h.writable()),
    close: () => { each((h) => h.close()); handles.clear(); },
    dispose: () => { stop(); each((h) => h.close()); handles.clear(); },
  };
}
