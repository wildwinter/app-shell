// The per-window store adapters (app-store.ts): a slice reads and writes one
// window's bounds and pin through the shell's record, and resetWindows puts
// every window back to floating with no remembered rectangle.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppStore, windowSlice, resetWindows } from "../src/app-store.js";

let dir = "";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "shell-slice-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const store = () => createAppStore<{ x: number }, { theme: string }>({ dir, defaults: { theme: "paper" } });

describe("windowSlice", () => {
  it("round-trips bounds and the pin through the store, pinned true until written", () => {
    const s = store();
    const board = windowSlice(s, "board");
    expect(board.bounds()).toBeUndefined();
    expect(board.pinned()).toBe(true);
    board.remember({ x: 10, y: 20, width: 600, height: 400 });
    board.setPinned(false);
    expect(board.bounds()).toEqual({ x: 10, y: 20, width: 600, height: 400 });
    expect(board.pinned()).toBe(false);
    expect(s.get().windows["board"]).toEqual({ bounds: { x: 10, y: 20, width: 600, height: 400 }, pinned: false });
    // Reads through the file on the next launch.
    expect(windowSlice(store(), "board").pinned()).toBe(false);
    expect(windowSlice(store(), "find").pinned()).toBe(true);
    expect(windowSlice(store(), "find", { pinned: false }).pinned()).toBe(false);
  });

  it("has the shape a tool-window row spreads in", () => {
    const row = { name: "board", ...windowSlice(store(), "board") };
    expect(typeof row.bounds).toBe("function");
    expect(typeof row.remember).toBe("function");
    expect(typeof row.pinned).toBe("function");
  });
});

describe("resetWindows", () => {
  it("clears every remembered rectangle and re-pins, including names the store has not met", () => {
    const s = store();
    windowSlice(s, "board").remember({ x: -5000, y: 0, width: 600, height: 400 });
    windowSlice(s, "board").setPinned(false);
    windowSlice(s, "find").setPinned(false);
    resetWindows(s, ["links"]);
    const w = s.get().windows;
    expect(w["board"]).toEqual({ pinned: true });
    expect(w["find"]).toEqual({ pinned: true });
    expect(w["links"]).toEqual({ pinned: true });
    // ...and on disk: no `bounds` key survives the reset.
    const file = JSON.parse(readFileSync(join(dir, "app-settings.json"), "utf8")) as { windows: Record<string, unknown> };
    expect(file.windows["board"]).toEqual({ pinned: true });
  });
});
