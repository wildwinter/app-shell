// ---------------------------------------------------------------------------
// The view scheme (tier 2 view extensions): `<scheme>://<extension-id>/...`
// serves an installed view package's files and nothing else, every response
// under the view CSP, and the view's session reaches nothing off the scheme.
//
// No Electron import: each function takes the protocol or session it works
// on, so the whole of it runs under test.
// ---------------------------------------------------------------------------

import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";
import { viewsFor } from "@wildwinter/toolkit/extensions";
import type { HostName, Manifest, ViewDecl } from "@wildwinter/toolkit/extensions";
import { VIEW_HEAD_CSS, viewHeadHtml } from "./view-head.js";
import type { ViewHeadOptions } from "./view-head.js";

/** The view CSP: the package's own scripts and styles, inline styles, images and fonts from the package or data
 *  URLs, and no network, frames, forms, or plugins. Sent as a header on every response. */
export const VIEW_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

/** The entry an app adds to its ONE `protocol.registerSchemesAsPrivileged` call (Electron keeps only the last
 *  call, so an app with other schemes lists them all there). Never `bypassCSP`. */
export function viewSchemePrivileges(scheme: string): {
  scheme: string; privileges: { standard: true; secure: true; supportFetchAPI: true };
} {
  return { scheme, privileges: { standard: true, secure: true, supportFetchAPI: true } };
}

/** What the scheme serves for one extension id: the installed version's folder and its manifest. */
export interface ViewSource { readonly root: string; readonly manifest: Manifest }

export interface ServeViewsOptions {
  /** The scheme, without its colon: `patter-view`. */
  scheme: string;
  /** The app the views open in: a view the manifest doesn't offer this host isn't served. */
  host: HostName;
  /** The installed package for an extension id, or null for none. Read at each request. */
  resolve: (extension: string) => ViewSource | null | Promise<ViewSource | null>;
}

/** The URL of a view's page; with `head`, the page carries the shell's head (title, pin, close) above the view. */
export function viewPageUrl(scheme: string, extension: string, view: string, head?: ViewHeadOptions): string {
  const q = new URLSearchParams({ view });
  if (head) {
    q.set("head", head.title);
    if (head.pinned !== undefined) q.set("pin", head.pinned ? "1" : "0");
  }
  return `${scheme}://${extension}/?${q.toString()}`;
}

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".otf": "font/otf", ".wasm": "application/wasm",
};

/** The content type a package file is served with, by its extension. */
export function viewContentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

const headers = (type: string): Record<string, string> => ({
  "Content-Type": type,
  "Content-Security-Policy": VIEW_CSP,
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
});

const notFound = (): Response => new Response("Not found", { status: 404, headers: headers("text/plain; charset=utf-8") });

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The page that hosts a view: its entry as a module script and its element filling the window, below the
 *  shell's head when the window has one. */
export function viewPage(view: Pick<ViewDecl, "name" | "entry" | "element">, head?: ViewHeadOptions): string {
  const el = view.element;   // checked against the custom-element pattern by viewsFor
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(head?.title ?? view.name)}</title>
<style>
html, body { margin: 0; height: 100%; }
body { background: var(--bg, Canvas); color: var(--ink, CanvasText); font-family: var(--font-ui, system-ui, sans-serif); color-scheme: var(--color-scheme, light dark); }
body > ${el} { display: block; ${head ? "flex: 1; min-height: 0" : "height: 100%"}; overflow: auto; }
${head ? VIEW_HEAD_CSS : ""}</style>
<script type="module" src="/${view.entry.split("/").map(encodeURIComponent).join("/")}"></script>
</head><body>${head ? viewHeadHtml(head) : ""}<${el}></${el}></body></html>
`;
}

/** The response for one request on the view scheme. */
export async function viewResponse(url: string, opts: ServeViewsOptions): Promise<Response> {
  let u: URL;
  try { u = new URL(url); } catch { return notFound(); }
  if (u.protocol !== `${opts.scheme}:`) return notFound();
  const source = await opts.resolve(u.hostname);
  if (!source) return notFound();
  if (u.pathname === "/" || u.pathname === "") {
    const id = u.searchParams.get("view");
    const view = id === null ? undefined : viewsFor(source.manifest, opts.host).find((v) => v.id === id);
    if (!view) return notFound();
    const title = u.searchParams.get("head");
    const pin = u.searchParams.get("pin");
    const head = title === null ? undefined : { title, ...(pin !== null ? { pinned: pin === "1" } : {}) };
    return new Response(viewPage(view, head), { status: 200, headers: headers("text/html; charset=utf-8") });
  }
  const file = await confined(source.root, u.pathname);
  if (!file) return notFound();
  try {
    return new Response(new Uint8Array(await readFile(file)), { status: 200, headers: headers(viewContentType(file)) });
  } catch { return notFound(); }
}

/** The file a URL path names inside `root`, or null when it would land anywhere else (or isn't there). */
export async function confined(root: string, pathname: string): Promise<string | null> {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  if (path.includes("\0") || path.includes("\\")) return null;
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  const full = join(root, ...parts);
  const inside = (base: string, p: string): boolean => {
    const rel = relative(base, p);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };
  if (!inside(root, full)) return null;
  // Through links too: the real file must be inside the real root.
  try {
    const [realRoot, realFull] = await Promise.all([realpath(root), realpath(full)]);
    return inside(realRoot, realFull) ? realFull : null;
  } catch { return null; }
}

/** The part of Electron's `Protocol` the scheme needs. */
export interface ProtocolLike {
  handle(scheme: string, handler: (request: Request) => Response | Promise<Response>): void;
}

/** Serve the view scheme on a protocol: the view session's own (`session.fromPartition(...).protocol`), since
 *  views run in a partition of their own. */
export function serveViews(protocol: ProtocolLike, opts: ServeViewsOptions): void {
  protocol.handle(opts.scheme, (request) => viewResponse(request.url, opts));
}

/** The part of Electron's `Session` the guard needs. */
export interface ViewSessionLike {
  webRequest: {
    onBeforeRequest(listener: (details: { url: string }, callback: (response: { cancel?: boolean }) => void) => void): void;
  };
  setPermissionRequestHandler(handler: ((wc: unknown, permission: string, callback: (granted: boolean) => void) => void) | null): void;
  setPermissionCheckHandler?(handler: ((...args: unknown[]) => boolean) | null): void;
}

/** Whether a view session may load a URL: its own scheme, devtools, and inline data only. */
export function viewRequestAllowed(url: string, scheme: string): boolean {
  const colon = url.indexOf(":");
  const protocol = colon < 0 ? "" : url.slice(0, colon).toLowerCase();
  return protocol === scheme || protocol === "devtools" || protocol === "data" || protocol === "blob";
}

/** No network and no permissions for a view's session: anything off the view scheme is cancelled, and every
 *  permission (camera, notifications, clipboard, ...) is refused. */
export function guardViewSession(session: ViewSessionLike, scheme: string): void {
  session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !viewRequestAllowed(details.url, scheme) }));
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler?.(() => false);
}
