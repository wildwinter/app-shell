// The pin button. Its state is not always its own to choose, which is the whole
// reason `set` exists, so that is what these pin down.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { pinButton } from "../src/tool-window-web.js";

afterEach(() => document.body.replaceChildren());

describe("pinButton", () => {
  it("reflects its starting state in the class, the aria and the tooltip", () => {
    const on = pinButton({ pinned: true, onToggle: () => {} });
    expect(on.el.classList.contains("on")).toBe(true);
    expect(on.el.getAttribute("aria-pressed")).toBe("true");
    expect(on.el.dataset["tip"]).toBe("Pinned on top: click to unpin");
    expect(on.el.getAttribute("aria-label")).toBe("Pinned on top: click to unpin");
    expect(on.el.title).toBe(""); // the PLATFORM rollover, never raised

    const off = pinButton({ pinned: false, onToggle: () => {} });
    expect(off.el.classList.contains("on")).toBe(false);
    expect(off.el.dataset["tip"]).toBe("Click to keep on top");
    expect(off.el.getAttribute("aria-label")).toBe("Click to keep on top");
  });

  it("says what a CLICK WILL DO, not what the state is", () => {
    // The difference matters on a toggle: "Keep on top" on an already-pinned
    // button reads as a description of the current state to one person and as a
    // promise about the click to another.
    const p = pinButton({ pinned: false, onToggle: () => {} });
    p.el.click();
    expect(p.el.dataset["tip"]).toBe("Pinned on top: click to unpin");
  });

  it("toggles, and reports the NEW state to the host", () => {
    const onToggle = vi.fn();
    const p = pinButton({ pinned: true, onToggle });
    p.el.click();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(p.el.classList.contains("on")).toBe(false);
    p.el.click();
    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(p.el.classList.contains("on")).toBe(true);
  });

  it("set() reflects a state decided elsewhere WITHOUT calling back", () => {
    // Main re-pins a helper window on Reset View and tells the window afterwards.
    // Calling onToggle there would be the window reporting news back to the only
    // party that already knew it, and in a host that persists on toggle it would
    // write the value it was just handed.
    const onToggle = vi.fn();
    const p = pinButton({ pinned: false, onToggle });
    p.set(true);
    expect(p.el.classList.contains("on")).toBe(true);
    expect(p.el.getAttribute("aria-pressed")).toBe("true");
    expect(p.el.dataset["tip"]).toBe("Pinned on top: click to unpin");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("keeps clicking from where set() left it", () => {
    // The internal state has to MOVE, not just the drawing: a set(true) followed
    // by a click must unpin, not pin again.
    const onToggle = vi.fn();
    const p = pinButton({ pinned: false, onToggle });
    p.set(true);
    p.el.click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
