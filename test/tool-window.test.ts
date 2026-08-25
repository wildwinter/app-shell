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

const { savedWindowRect, centeredOnPrimary, rescueToolWindow, pinToolWindow } = await import("../src/tool-window.js");

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
      setBounds: (b: unknown) => calls.push(`bounds:${JSON.stringify(b)}`),
      show: () => calls.push("show"),
      moveTop: () => calls.push("moveTop"),
    };
    rescueToolWindow(w as never, DEF);
    // No pin: rescuing used to setAlwaysOnTop(true), which on macOS floats the
    // window above every other APPLICATION and stuck that way. Raising within
    // our own stack is what a rescue means.
    expect(calls).toEqual([
      "restore",
      `bounds:${JSON.stringify({ ...DEF, ...centeredOnPrimary(DEF) })}`,
      "show", "moveTop",
    ]);
  });

  it("is a no-op for a missing or destroyed window", () => {
    rescueToolWindow(undefined, DEF);
    rescueToolWindow({ isDestroyed: () => true } as never, DEF);
  });
});

// The pin. `alwaysOnTop` floats a window above every other APPLICATION on
// macOS and Windows, so a pinned Board meant nothing else on the machine
// could come to the front (a Storyletter user report, 2026-08-25). What a pin
// means is "above MY app's main window", and the mechanism that says exactly
// that on both platforms is a CHILD window. Expectations written first.
describe("pinToolWindow", () => {
  const win = () => {
    const calls: string[] = [];
    return { calls, w: {
      isDestroyed: () => false,
      setAlwaysOnTop: (on: boolean) => calls.push(`aot:${on}`),
      setParentWindow: (p: unknown) => calls.push(`parent:${p === null ? "none" : (p as { name: string }).name}`),
    } };
  };
  const parent = { name: "main", isDestroyed: () => false };

  it("pins by parenting, and clears any alwaysOnTop an older build left", () => {
    const { calls, w } = win();
    pinToolWindow(w as never, parent as never, true);
    expect(calls).toEqual(["aot:false", "parent:main"]);
  });

  it("unpins by clearing the parent", () => {
    const { calls, w } = win();
    pinToolWindow(w as never, parent as never, false);
    expect(calls).toEqual(["aot:false", "parent:none"]);
  });

  it("never parents to a missing or destroyed main window", () => {
    const { calls, w } = win();
    pinToolWindow(w as never, undefined, true);
    pinToolWindow(w as never, { name: "gone", isDestroyed: () => true } as never, true);
    expect(calls).toEqual(["aot:false", "parent:none", "aot:false", "parent:none"]);
  });

  it("is a no-op for a missing or destroyed tool window", () => {
    pinToolWindow(undefined, parent as never, true);
    pinToolWindow({ isDestroyed: () => true } as never, parent as never, true);
  });
});
