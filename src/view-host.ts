// ---------------------------------------------------------------------------
// The view host, MAIN-PROCESS half (tier 2 view extensions, patterkit
// design/view-extensions.md): installed view packages, the view scheme, and
// the view window, which main opens and then hands a MessageChannelMain pair
// to, one port to the view and one to the editor's renderer. After that main
// is out of the path: the editor's renderer answers the view (`hostView`).
//
// This module imports electron, so it ships as its own subpath
// (@wildwinter/app-shell/view-host); never import it from renderer code. The
// packages and the scheme are Electron-free modules of their own, re-exported
// here, so they run under test as they are.
// ---------------------------------------------------------------------------

import { BrowserWindow, MessageChannelMain, session } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { viewsFor } from "@wildwinter/toolkit/extensions";
import type { HostName } from "@wildwinter/toolkit/extensions";
import { openToolWindow } from "./tool-window.js";
import type { ToolWindowBounds, ToolWindowSize } from "./tool-window.js";
import { VIEW_PORT_CHANNEL } from "./view-protocol.js";
import type { ViewPortMeta } from "./view-protocol.js";
import { guardViewSession, serveViews, viewPageUrl } from "./view-serve.js";
import type { ViewSource } from "./view-serve.js";
import type { InstalledExtension } from "./view-package.js";

export {
  readExtensionPackage, packageFromFiles, readTarball, installExtensionPackage, removeInstalledExtension,
  installedExtensions, chooseInstalled, resolveInstalled, compareVersions, planPackageAdd, viewMenuLabel,
} from "./view-package.js";
export type { ExtensionPackage, PackageRead, InstalledExtension, InstalledChoice, PackageAddPlan } from "./view-package.js";
export {
  VIEW_CSP, viewSchemePrivileges, serveViews, viewResponse, viewPage, viewPageUrl, viewContentType, confined,
  guardViewSession, viewRequestAllowed,
} from "./view-serve.js";
export type { ServeViewsOptions, ViewSource, ProtocolLike, ViewSessionLike } from "./view-serve.js";

/** Where the built view preload sits: beside this module in dist. An app that bundles its main process (so
 *  this module's own path is the bundle's) passes `preload` to `openViewWindow` instead. */
export function viewPreloadPath(): string {
  const here = typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));
  return join(here, "view-preload.cjs");
}

/** The session partition a view runs in: in memory, one per extension. */
export const viewPartition = (extension: string): string => `view-${extension}`;

/** The installed package each prepared partition serves, read at each request (a reinstall takes effect). */
const served = new Map<string, ViewSource>();

/** Serve the scheme and guard the session of one extension's partition, once. Called by `openViewWindow`. */
function prepareViewSession(extension: string, source: ViewSource, scheme: string, host: HostName): void {
  const partition = viewPartition(extension);
  const known = served.has(partition);
  served.set(partition, source);
  if (known) return;
  const ses = session.fromPartition(partition);
  serveViews(ses.protocol, { scheme, host, resolve: (id) => (id === extension ? served.get(partition) ?? null : null) });
  guardViewSession(ses, scheme);
}

export interface ViewWindowOptions {
  /** The installed version to open (from `resolveInstalled`). */
  installed: InstalledExtension;
  /** The view's id in the manifest. */
  view: string;
  /** This app. */
  host: HostName;
  /** The view scheme, registered privileged at startup (`viewSchemePrivileges`). */
  scheme: string;
  /** The editor window whose renderer hosts the view (`onViewPort` + `hostView`). */
  editor: BrowserWindow;
  /** The version the project pins, if any: told to both ends. */
  pinnedVersion?: string;
  /** The window's title; the view's name by default (an app may add a version warning). */
  title?: string;
  rect: ToolWindowBounds;
  min?: ToolWindowSize;
  /** OS title bar by default: the view's page is the author's, so it has no shell head. */
  frame?: boolean;
  pinTo?: () => BrowserWindow | undefined;
  pinned?: boolean;
  remember?: (bounds: ToolWindowBounds) => void;
  onClosed?: () => void;
  /** Whether the view window may open devtools (default false). */
  devTools?: boolean;
  /** The view preload's path, when `viewPreloadPath()` can't find it (a bundled main process). */
  preload?: string;
}

export interface ViewWindow {
  readonly window: BrowserWindow;
  readonly meta: ViewPortMeta;
  /** Close the view (the project changed, say). Closing the editor closes it too. */
  close(): void;
}

/**
 * Open a view in a sandboxed tool window of its own: its own in-memory partition serving only its package,
 * no network, no permissions, the view preload and nothing else. Each time the view's page loads, and each
 * time the editor's does while the view is open, both ends get a fresh `MessageChannelMain` pair on
 * `VIEW_PORT_CHANNEL`, the editor's with the `ViewPortMeta`. Throws when the manifest offers no such view here.
 */
export function openViewWindow(opts: ViewWindowOptions): ViewWindow {
  const { installed, editor } = opts;
  const decl = viewsFor(installed.manifest, opts.host).find((v) => v.id === opts.view);
  if (!decl) throw new Error(`${installed.manifest.name} has no view called "${opts.view}" in this app.`);
  prepareViewSession(installed.id, { root: installed.root, manifest: installed.manifest }, opts.scheme, opts.host);

  const w = openToolWindow(null, {
    title: opts.title ?? decl.name,
    url: viewPageUrl(opts.scheme, installed.id, decl.id),
    preload: opts.preload ?? viewPreloadPath(),
    partition: viewPartition(installed.id),
    devTools: opts.devTools ?? false,
    rect: opts.rect,
    frame: opts.frame ?? true,
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.pinTo !== undefined ? { pinTo: opts.pinTo } : {}),
    ...(opts.pinned !== undefined ? { pinned: opts.pinned } : {}),
    ...(opts.remember !== undefined ? { remember: opts.remember } : {}),
    ...(opts.onClosed !== undefined ? { onClosed: opts.onClosed } : {}),
  });
  const meta: ViewPortMeta = {
    window: w.id, extension: installed.id, view: decl.id, version: installed.version,
    ...(opts.pinnedVersion !== undefined ? { pinned: opts.pinnedVersion } : {}),
  };

  let viewLoaded = false;
  const handOver = (): void => {
    if (w.isDestroyed() || editor.isDestroyed()) return;
    const { port1, port2 } = new MessageChannelMain();
    w.webContents.postMessage(VIEW_PORT_CHANNEL, null, [port1]);
    editor.webContents.postMessage(VIEW_PORT_CHANNEL, meta, [port2]);
  };
  const onViewLoad = (): void => { viewLoaded = true; handOver(); };
  // The editor reloaded: its old port went with its page, so the view needs a new one too.
  const onEditorLoad = (): void => { if (viewLoaded) handOver(); };
  const close = (): void => { if (!w.isDestroyed()) w.close(); };
  w.webContents.on("did-finish-load", onViewLoad);
  editor.webContents.on("did-finish-load", onEditorLoad);
  editor.once("closed", close);
  w.once("closed", () => {
    if (!editor.isDestroyed()) {
      // Tell the editor the view has gone, the same way its port came: meta with `closed`, and no port.
      editor.webContents.postMessage(VIEW_PORT_CHANNEL, { ...meta, closed: true }, []);
      editor.webContents.removeListener("did-finish-load", onEditorLoad);
      editor.removeListener("closed", close);
    }
  });
  return { window: w, meta, close };
}
