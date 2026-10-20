// openViewWindow (view-host.ts) with electron mocked: the hardened window on its own partition and the view
// preload, the scheme served and the session guarded once per extension, a fresh port pair to both ends on
// each load of either, and the view closed with the editor.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseManifest } from "@wildwinter/toolkit/extensions";

const shared = vi.hoisted(() => ({
  made: [] as unknown[],
  sessions: new Map<string, { handled: string[]; guarded: number }>(),
  nextId: 1,
}));
vi.mock("electron", () => {
  class Emitter {
    handlers = new Map<string, (() => void)[]>();
    on(ev: string, fn: () => void): this { this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]); return this; }
    once(ev: string, fn: () => void): this { return this.on(ev, fn); }
    removeListener(ev: string, fn: () => void): this { this.handlers.set(ev, (this.handlers.get(ev) ?? []).filter((f) => f !== fn)); return this; }
    fire(ev: string): void { for (const fn of [...(this.handlers.get(ev) ?? [])]) fn(); }
  }
  class Contents extends Emitter {
    posted: [string, unknown, unknown[]][] = [];
    postMessage(channel: string, msg: unknown, ports: unknown[]): void { this.posted.push([channel, msg, ports]); }
  }
  class FakeWindow extends Emitter {
    static getFocusedWindow(): unknown { return null; }
    id = shared.nextId++;
    opts: unknown;
    destroyed = false;
    url = "";
    webContents = new Contents();
    show = vi.fn(); focus = vi.fn(); setParentWindow = vi.fn(); setAlwaysOnTop = vi.fn();
    loadURL = vi.fn((u: string) => { this.url = u; return Promise.resolve(); });
    loadFile = vi.fn(() => Promise.resolve());
    constructor(opts: unknown) { super(); this.opts = opts; shared.made.push(this); }
    isDestroyed(): boolean { return this.destroyed; }
    close(): void { this.destroyed = true; this.fire("closed"); }
  }
  let n = 0;
  return {
    BrowserWindow: FakeWindow,
    MessageChannelMain: class { port1 = { n: ++n, end: 1 }; port2 = { n, end: 2 }; },
    session: {
      fromPartition: (p: string) => {
        const s = { handled: [] as string[], guarded: 0 };
        shared.sessions.set(p, s);
        return {
          protocol: { handle: (scheme: string) => { s.handled.push(scheme); } },
          webRequest: { onBeforeRequest: () => { s.guarded++; } },
          setPermissionRequestHandler: () => {},
          setPermissionCheckHandler: () => {},
        };
      },
    },
    app: { on: () => {} },
    screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }) },
  };
});

const { openViewWindow, viewPreloadPath } = await import("../src/view-host.js");
const { VIEW_PORT_CHANNEL } = await import("../src/view-protocol.js");

const ROOT = join(import.meta.dirname, "fixtures/probe-view");
const installed = { id: "probe", version: "1.0.0", root: ROOT, manifest: parseManifest(readFileSync(join(ROOT, "probe.extension.json"), "utf8")) };

type Fake = {
  id: number; opts: { title: string; frame?: boolean; webPreferences: Record<string, unknown> }; url: string;
  webContents: { posted: [string, unknown, { n: number; end: number }[]][]; fire(ev: string): void };
  fire(ev: string): void; close(): void; isDestroyed(): boolean;
};

describe("openViewWindow", () => {
  it("opens the view hardened, on its own partition, with the view preload, and serves its scheme once", async () => {
    const { BrowserWindow } = await import("electron");
    const editor = new BrowserWindow({}) as unknown as Fake;
    const v = openViewWindow({
      installed, view: "inspect", host: "patter", scheme: "patter-view", editor: editor as never,
      pinnedVersion: "1.0.0", rect: { width: 400, height: 300 },
    });
    const w = v.window as unknown as Fake;
    expect(w.opts.title).toBe("Probe view");
    expect(w.opts.frame).toBe(true);
    expect(w.opts.webPreferences).toEqual({
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, navigateOnDragDrop: false,
      preload: viewPreloadPath(), partition: "view-probe", devTools: false,
    });
    expect(viewPreloadPath()).toMatch(/view-preload\.cjs$/);
    expect(w.url).toBe("patter-view://probe/?view=inspect");
    expect(shared.sessions.get("view-probe")).toEqual({ handled: ["patter-view"], guarded: 1 });
    expect(v.meta).toEqual({ window: w.id, extension: "probe", view: "inspect", version: "1.0.0", pinned: "1.0.0" });

    // Nothing is handed over until the view's page loads; the editor reloading first changes nothing.
    editor.webContents.fire("did-finish-load");
    expect(w.webContents.posted).toEqual([]);
    w.webContents.fire("did-finish-load");
    expect(w.webContents.posted).toHaveLength(1);
    const [vc, vmeta, [vport]] = w.webContents.posted[0]!;
    const [ec, emeta, [eport]] = editor.webContents.posted[0]!;
    expect([vc, ec]).toEqual([VIEW_PORT_CHANNEL, VIEW_PORT_CHANNEL]);
    expect(vmeta).toBeNull();
    expect(emeta).toEqual(v.meta);
    expect(vport!.n).toBe(eport!.n);
    expect(vport!.end).not.toBe(eport!.end);

    // Either end reloading hands over a fresh pair.
    editor.webContents.fire("did-finish-load");
    w.webContents.fire("did-finish-load");
    expect(w.webContents.posted).toHaveLength(3);
    expect(new Set(w.webContents.posted.map((p) => p[2][0]!.n)).size).toBe(3);

    // A second view of the same extension reuses the prepared session.
    const v2 = openViewWindow({ installed, view: "inspect", host: "patter", scheme: "patter-view", editor: editor as never, rect: { width: 1, height: 1 } });
    expect(shared.sessions.get("view-probe")).toEqual({ handled: ["patter-view"], guarded: 1 });

    // The editor closing closes the views.
    editor.close();
    expect(w.isDestroyed()).toBe(true);
    expect((v2.window as unknown as Fake).isDestroyed()).toBe(true);
  });

  it("closes on request, and lets go of the editor", async () => {
    const { BrowserWindow } = await import("electron");
    const editor = new BrowserWindow({}) as unknown as Fake & { handlers: Map<string, unknown[]>; webContents: { handlers: Map<string, unknown[]> } };
    const v = openViewWindow({ installed, view: "inspect", host: "storylets", scheme: "storylet-view", editor: editor as never, rect: { width: 1, height: 1 }, devTools: true, preload: "/x/p.cjs" });
    expect((v.window as unknown as Fake).opts.webPreferences).toMatchObject({ devTools: true, preload: "/x/p.cjs" });
    v.close();
    expect(v.window.isDestroyed()).toBe(true);
    expect(editor.handlers.get("closed")).toEqual([]);
    expect(editor.webContents.handlers.get("did-finish-load")).toEqual([]);
  });

  it("throws for a view the manifest doesn't offer", () => {
    expect(() => openViewWindow({ installed, view: "nope", host: "patter", scheme: "patter-view", editor: {} as never, rect: { width: 1, height: 1 } }))
      .toThrow(`Probe has no view called "nope" in this app.`);
  });
});
