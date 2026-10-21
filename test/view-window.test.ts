// openViewWindow (view-host.ts) with electron mocked: the hardened window on its own partition and the view
// preload, the scheme served and the session guarded once per extension, a fresh port pair to both ends on
// each load of either, the view closed with the editor, and the shell's head: its pin and close from the view's
// own contents only, and its state told again at each load.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseManifest } from "@wildwinter/toolkit/extensions";

const shared = vi.hoisted(() => ({
  made: [] as unknown[],
  sessions: new Map<string, { handled: string[]; guarded: number }>(),
  nextId: 1,
  ipc: new Map<string, ((e: { sender: unknown }, ...a: unknown[]) => void)[]>(),
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
    sent: [string, unknown][] = [];
    send(channel: string, msg: unknown): void { this.sent.push([channel, msg]); }
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
    ipcMain: {
      on: (ch: string, fn: (e: { sender: unknown }, ...a: unknown[]) => void) => { shared.ipc.set(ch, [...(shared.ipc.get(ch) ?? []), fn]); },
      removeListener: (ch: string, fn: unknown) => { shared.ipc.set(ch, (shared.ipc.get(ch) ?? []).filter((f) => f !== fn)); },
    },
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
const { VIEW_CLOSE_CHANNEL, VIEW_HEAD_CHANNEL, VIEW_PIN_CHANNEL } = await import("../src/view-head.js");
const ipcSend = (ch: string, sender: unknown, ...a: unknown[]): void => { for (const fn of shared.ipc.get(ch) ?? []) fn({ sender }, ...a); };

const ROOT = join(import.meta.dirname, "fixtures/probe-view");
const installed = { id: "probe", version: "1.0.0", root: ROOT, manifest: parseManifest(readFileSync(join(ROOT, "probe.extension.json"), "utf8")) };

type Fake = {
  id: number; opts: { title: string; frame?: boolean; webPreferences: Record<string, unknown> }; url: string;
  webContents: { posted: [string, unknown, { n: number; end: number }[]][]; sent: [string, unknown][]; fire(ev: string): void };
  fire(ev: string): void; close(): void; isDestroyed(): boolean;
  setAlwaysOnTop: { mock: { calls: unknown[][] } }; setParentWindow: { mock: { calls: unknown[][] } };
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
    expect(w.opts.frame).toBe(false);
    expect(w.opts.webPreferences).toEqual({
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, navigateOnDragDrop: false,
      preload: viewPreloadPath(), partition: "view-probe", devTools: false,
    });
    expect(viewPreloadPath()).toMatch(/view-preload\.cjs$/);
    // Frameless, so the page carries the head; with nothing to pin above, no pin.
    expect(w.url).toBe("patter-view://probe/?view=inspect&head=Probe+view");
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

  it("wears the shell's head: pin and close from the view's own contents, its state told at each load", async () => {
    const { BrowserWindow } = await import("electron");
    const editor = new BrowserWindow({});
    const onPin = vi.fn();
    const v = openViewWindow({
      installed, view: "inspect", host: "patter", scheme: "patter-view", editor: editor as never, rect: { width: 1, height: 1 },
      title: "Probe view (1.0.0 installed)", pinTo: () => editor as never, pinned: true, onPin,
    });
    const w = v.window as unknown as Fake;
    expect(w.url).toBe("patter-view://probe/?view=inspect&head=Probe+view+%281.0.0+installed%29&pin=1");
    w.webContents.fire("dom-ready");
    expect(w.webContents.sent.at(-1)).toEqual([VIEW_HEAD_CHANNEL, { pinned: true }]);

    // Another window's contents can't pin or close it; a non-boolean pin is ignored.
    ipcSend(VIEW_PIN_CHANNEL, editor.webContents, false);
    ipcSend(VIEW_PIN_CHANNEL, w.webContents, "no");
    ipcSend(VIEW_CLOSE_CHANNEL, editor.webContents);
    expect(onPin).not.toHaveBeenCalled();
    expect(w.isDestroyed()).toBe(false);

    // Its own pin unpins it and is persisted; a reload is told the new state.
    ipcSend(VIEW_PIN_CHANNEL, w.webContents, false);
    expect(onPin).toHaveBeenCalledWith(false);
    w.webContents.fire("dom-ready");
    expect(w.webContents.sent.at(-1)).toEqual([VIEW_HEAD_CHANNEL, { pinned: false }]);

    // Main re-pins it (Reset View): the head is told, and nothing is persisted from here.
    v.setPinned(true);
    expect(w.webContents.sent.at(-1)).toEqual([VIEW_HEAD_CHANNEL, { pinned: true }]);
    expect(onPin).toHaveBeenCalledTimes(1);

    ipcSend(VIEW_CLOSE_CHANNEL, w.webContents);
    expect(w.isDestroyed()).toBe(true);
    expect(shared.ipc.get(VIEW_PIN_CHANNEL)).toEqual([]);
    expect(shared.ipc.get(VIEW_CLOSE_CHANNEL)).toEqual([]);
  });

  it("has an OS title bar and no head with frame: true", async () => {
    const { BrowserWindow } = await import("electron");
    const editor = new BrowserWindow({});
    const v = openViewWindow({ installed, view: "inspect", host: "patter", scheme: "patter-view", editor: editor as never, rect: { width: 1, height: 1 }, frame: true, pinTo: () => editor as never });
    const w = v.window as unknown as Fake;
    expect(w.opts.frame).toBe(true);
    expect(w.url).toBe("patter-view://probe/?view=inspect");
    w.webContents.fire("dom-ready");
    expect(w.webContents.sent).toEqual([]);
    v.close();
  });

  it("throws for a view the manifest doesn't offer", () => {
    expect(() => openViewWindow({ installed, view: "nope", host: "patter", scheme: "patter-view", editor: {} as never, rect: { width: 1, height: 1 } }))
      .toThrow(`Probe has no view called "nope" in this app.`);
  });
});
