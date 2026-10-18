// ---------------------------------------------------------------------------
// Window hardening for both apps (patterkit design/family-parity-2026-10.md
// item 12): one content security policy, and guards on navigation and
// window.open for every window the app makes.
//
// The policy is a `<meta http-equiv="Content-Security-Policy">` on each page,
// since the apps load their pages from files in a release build and a header
// cannot reach those. `familyCsp` is the one spelling of it: a page's meta
// carries `familyCsp(...)` for that page, and each app's tests check every page
// against it, so a new page cannot ship without one. Styles allow
// 'unsafe-inline' because both editors set inline styles (ProseMirror does, in
// Patterpad); scripts never do.
//
// The guards: a window never navigates away from the page it loaded, never
// opens another window, and never attaches a webview. A link to the web asks
// the app to open it in the browser instead (`openExternal`), and nothing else
// leaves the app. `guardAllWindows` applies them to every web contents the app
// creates, tool windows and any later window included, which is why it is the
// one call each app makes, at startup.
//
// No Electron import: the module takes the app and the web contents it is
// handed, so it runs under test without Electron.
// ---------------------------------------------------------------------------

import type { App, WebContents } from "electron";

/** A policy as directives: each name with its sources. */
export type CspDirectives = Record<string, readonly string[]>;

/** The family's base policy: everything from the app itself, inline styles, and images also from data URLs. */
export const FAMILY_CSP: CspDirectives = {
  "default-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
};

/**
 * The family's policy with a page's additions, as the meta's `content`. An addition to a directive the base
 * has extends it (`{ "img-src": ["blob:"] }` keeps `'self' data:`); a new directive is added. Directives come
 * out in the base's order, then the page's.
 */
export function familyCsp(extra: CspDirectives = {}): string {
  const merged = new Map<string, string[]>();
  for (const [name, sources] of Object.entries(FAMILY_CSP)) merged.set(name, [...sources]);
  for (const [name, sources] of Object.entries(extra)) {
    // A directive the base leaves out falls back to default-src, so an addition starts from that.
    const into = merged.get(name) ?? [...(FAMILY_CSP["default-src"] ?? [])];
    for (const s of sources) if (!into.includes(s)) into.push(s);
    merged.set(name, into);
  }
  return [...merged].map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}

/** The policy a page's HTML carries in its meta, or null when it has none. */
export function cspOfPage(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag) ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    return content ? content[1]!.trim() : null;
  }
  return null;
}

export interface WindowGuardOptions {
  /** Open a web address in the browser (Electron's `shell.openExternal`). Given, a link to an http, https or
   *  mailto address that the page tried to navigate to or open goes here; absent, it goes nowhere. */
  openExternal?: (url: string) => void;
  /** Told of everything refused, for a dev console. */
  onBlocked?: (what: "navigate" | "window" | "webview", url: string) => void;
}

const EXTERNAL = new Set(["http:", "https:", "mailto:"]);

const parse = (url: string): URL | null => { try { return new URL(url); } catch { return null; } };

/**
 * Whether `to` is the page `from` already is: the same document, a hash or query apart. A dev server's page
 * may move within its own origin (a reload, its own client); a file page may not move to another file.
 */
export function isSamePage(from: string, to: string): boolean {
  const a = parse(from), b = parse(to);
  if (!a || !b || a.protocol !== b.protocol) return false;
  if (a.protocol === "http:" || a.protocol === "https:") return a.origin === b.origin;
  return a.host === b.host && a.pathname === b.pathname;
}

/** The guards on one web contents. */
export function guardWebContents(contents: WebContents, opts: WindowGuardOptions = {}): void {
  const away = (what: "navigate" | "window", url: string): void => {
    opts.onBlocked?.(what, url);
    const target = parse(url);
    if (target && EXTERNAL.has(target.protocol)) opts.openExternal?.(url);
  };
  contents.on("will-navigate", (event, url) => {
    if (isSamePage(contents.getURL(), url)) return;
    event.preventDefault();
    away("navigate", url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    away("window", url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
    opts.onBlocked?.("webview", "");
  });
}

/** The guards on every web contents the app creates from now on: the one call each app makes, at startup. */
export function guardAllWindows(app: App, opts: WindowGuardOptions = {}): void {
  app.on("web-contents-created", (_event, contents) => guardWebContents(contents, opts));
}
