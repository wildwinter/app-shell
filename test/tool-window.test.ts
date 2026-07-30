// The tool-window kit's pure logic: the disconnected-monitor guard, the
// centring maths, and the rescue contract - with electron mocked (screen
// geometry is the only thing these functions consume).
import { describe, expect, it, vi } from "vitest";

const displays = [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }];
vi.mock("electron", () => ({
  BrowserWindow: class {},
  screen: {
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays[0],
  },
}));

const { savedWindowRect, centeredOnPrimary, rescueToolWindow } = await import("../src/tool-window.js");

const DEF = { width: 500, height: 400 };
const MIN = { width: 300, height: 200 };

describe("savedWindowRect", () => {
  it("falls back to the default when nothing was saved", () => {
    expect(savedWindowRect(undefined, DEF, MIN)).toEqual(DEF);
  });

  it("keeps an on-screen rect, clamping size up to the minimum", () => {
    expect(savedWindowRect({ x: 100, y: 100, width: 250, height: 150 }, DEF, MIN))
      .toEqual({ x: 100, y: 100, width: 300, height: 200 });
  });

  it("drops the position of an off-screen rect but keeps the size", () => {
    expect(savedWindowRect({ x: 5000, y: 100, width: 600, height: 500 }, DEF, MIN))
      .toEqual({ width: 600, height: 500 });
  });

  it("keeps a size-only memory (no position)", () => {
    expect(savedWindowRect({ width: 800, height: 600 }, DEF, MIN))
      .toEqual({ width: 800, height: 600 });
  });
});

describe("centeredOnPrimary", () => {
  it("centres on the primary work area", () => {
    expect(centeredOnPrimary({ width: 440, height: 300 })).toEqual({ x: 500, y: 300 });
  });
});

describe("rescueToolWindow", () => {
  it("un-minimises, re-pins, centres at the default size, and shows", () => {
    const calls: string[] = [];
    const w = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: () => calls.push("restore"),
      setAlwaysOnTop: (on: boolean) => calls.push(`pin:${on}`),
      setBounds: (b: unknown) => calls.push(`bounds:${JSON.stringify(b)}`),
      show: () => calls.push("show"),
    };
    rescueToolWindow(w as never, DEF);
    expect(calls).toEqual([
      "restore", "pin:true",
      `bounds:${JSON.stringify({ ...DEF, ...centeredOnPrimary(DEF) })}`,
      "show",
    ]);
  });

  it("is a no-op for a missing or destroyed window", () => {
    rescueToolWindow(undefined, DEF);
    rescueToolWindow({ isDestroyed: () => true } as never, DEF);
  });
});
