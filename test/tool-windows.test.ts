// The tool-window table (defineToolWindows): open-or-focus, the identity
// guard on close, satellites registered per row, and rescue over the rows.
import { describe, expect, it, vi } from "vitest";

const displays = [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }];
const shared = vi.hoisted(() => ({ made: [] as unknown[] }));
vi.mock("electron", () => {
  class FakeWindow {
    static getFocusedWindow(): unknown { return null; }
    opts: unknown;
    destroyed = false;
    minimized = false;
    bounds = { x: 0, y: 0, width: 0, height: 0 };
    handlers = new Map<string, (() => void)[]>();
    sent: [string, unknown][] = [];
    focus = vi.fn();
    show = vi.fn();
    moveTop = vi.fn();
    setParentWindow = vi.fn();
    setAlwaysOnTop = vi.fn();
    loadFile = vi.fn(() => Promise.resolve());
    loadURL = vi.fn(() => Promise.resolve());
    webContents = { send: (c: string, p: unknown) => { this.sent.push([c, p]); } };
    constructor(opts: unknown) { this.opts = opts; shared.made.push(this); }
    isDestroyed(): boolean { return this.destroyed; }
    isMinimized(): boolean { return this.minimized; }
    restore(): void { this.minimized = false; }
    getBounds() { return this.bounds; }
    setBounds(b: typeof this.bounds): void { this.bounds = b; }
    on(ev: string, fn: () => void): void { this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]); }
    once(ev: string, fn: () => void): void { this.on(ev, fn); }
    fire(ev: string): void { for (const fn of this.handlers.get(ev) ?? []) fn(); }
    close(): void { this.destroyed = true; this.fire("closed"); }
  }
  return {
    BrowserWindow: FakeWindow,
    app: { on: () => {} },
    screen: { getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0] },
  };
});

const { defineToolWindows } = await import("../src/tool-window.js");
type Fake = { sent: [string, unknown][]; close(): void; opts: { title: string; frame?: boolean }; setBounds: (b: unknown) => void; bounds: { width: number; height: number } };

const spec = (name: string, pinned = true) => ({
  name, title: name.toUpperCase(), page: `${name}.html`,
  def: { width: 600, height: 400 }, min: { width: 300, height: 200 },
  bounds: () => undefined, remember: vi.fn(), pinned: () => pinned,
});

describe("defineToolWindows", () => {
  it("opens a window from its row, frameless by default, and focuses it the second time", () => {
    shared.made.length = 0;
    const t = defineToolWindows([spec("board"), spec("find")], { rendererDir: "/r", preload: "/p", pinTo: () => undefined });
    const w = t.open("board") as unknown as Fake;
    expect(w.opts.title).toBe("BOARD");
    expect(w.opts.frame).toBe(false);
    expect(t.get("board")).toBe(w);
    expect(t.get("find")).toBeUndefined();
    expect(t.open("board")).toBe(w);
    expect(shared.made.length).toBe(1);
    expect(t.names).toEqual(["board", "find"]);
    expect(t.all()).toEqual([w]);
  });

  it("forgets a window when it closes, and only THAT window", () => {
    const t = defineToolWindows([spec("board")], { rendererDir: "/r", preload: "/p", pinTo: () => undefined });
    const first = t.open("board") as unknown as Fake;
    first.close();
    expect(t.get("board")).toBeUndefined();
    const second = t.open("board");
    expect(second).not.toBe(first);
    // A stale close from the first must not clear the second.
    first.close();
    expect(t.get("board")).toBe(second);
  });

  it("registers every row as a satellite, with the row's own channel and clear when given", () => {
    const added: { channel: string; clear?: () => void; window: () => unknown }[] = [];
    const clear = vi.fn();
    const t = defineToolWindows(
      [spec("board"), { ...spec("links"), channel: "links:focus", clear }],
      { rendererDir: "/r", preload: "/p", pinTo: () => undefined, session: { addSatellite: (s) => { added.push(s); return () => {}; }, channel: "project:changed" } },
    );
    expect(added.map((s) => s.channel)).toEqual(["project:changed", "links:focus"]);
    expect(added[1]?.clear).toBe(clear);
    expect(added[0]?.window()).toBeUndefined();
    const w = t.open("board");
    expect(added[0]?.window()).toBe(w);
  });

  it("rescue resets the store, then restores, recentres, re-pins and tells every OPEN window", () => {
    const resetStore = vi.fn();
    const t = defineToolWindows([spec("board", false), spec("find")], {
      rendererDir: "/r", preload: "/p", pinTo: () => undefined, resetStore, pinChannel: "play:pin",
    });
    const board = t.open("board") as unknown as Fake;
    t.rescue();
    expect(resetStore).toHaveBeenCalledOnce();
    expect(board.bounds).toEqual({ x: 420, y: 250, width: 600, height: 400 });
    expect(board.sent).toEqual([["play:pin", true]]);
    expect(t.get("find")).toBeUndefined();   // never opened, never created by a rescue
  });

  it("throws on a name that is not a row", () => {
    const t = defineToolWindows([spec("board")], { rendererDir: "/r", preload: "/p", pinTo: () => undefined });
    expect(() => t.open("nope" as "board")).toThrow('no tool window "nope"');
  });
});
