// The tool window's head (toolWindowHead) and the follow toggle (followButton).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { toolWindowHead, followButton, pinButton } from "../src/tool-window-web.js";

afterEach(() => document.body.replaceChildren());

const esc = (target?: Element): void => {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
  (target ?? window).dispatchEvent(e);
};

describe("toolWindowHead", () => {
  it("draws title, spacer, trail, a pin and a close that says Close (Esc)", () => {
    const onClose = vi.fn();
    const trail = document.createElement("button");
    const head = toolWindowHead({ title: "Find", trail: [trail, null], onClose });
    expect(head.tagName).toBe("HEADER");
    expect(head.classList.contains("swin-head")).toBe(true);
    expect(head.querySelector(".swin-title")?.textContent).toBe("Find");
    const kids = [...head.children].map((c) => c.className);
    expect(kids).toEqual(["swin-title", "swin-spacer", "", "swin-pin on", "swin-close"]);
    const close = head.querySelector<HTMLButtonElement>(".swin-close")!;
    expect(close.dataset["tip"]).toBe("Close (Esc)");
    expect(close.title).toBe("");
    expect(close.querySelector("svg[data-icon=close]")).not.toBeNull();
    close.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders the pin pinned by default, or takes a pin built already", () => {
    const own = pinButton({ pinned: false, onToggle: () => {} });
    const head = toolWindowHead({ title: "Board", pin: own, onClose: () => {} });
    expect(head.querySelector(".swin-pin")).toBe(own.el);
    const onPin = vi.fn();
    const built = toolWindowHead({ title: "Board", pinned: false, onPin, onClose: () => {} });
    const pin = built.querySelector<HTMLButtonElement>(".swin-pin")!;
    expect(pin.classList.contains("on")).toBe(false);
    pin.click();
    expect(onPin).toHaveBeenCalledWith(true);
  });

  it("puts tabs where the title would be, and adds the extra class", () => {
    const tabs = document.createElement("div");
    const head = toolWindowHead({ tabs, className: "cbar", onClose: () => {} });
    expect(head.classList.contains("cbar")).toBe(true);
    expect(head.querySelector(".swin-title")).toBeNull();
    expect(head.firstElementChild).toBe(tabs);
  });

  it("Escape closes, unless the focus is in a field, unless esc is off", () => {
    const onClose = vi.fn();
    document.body.append(toolWindowHead({ title: "Find", onClose }));
    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
    const input = document.createElement("input");
    document.body.append(input);
    esc(input);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Rebuilt head: the latest close wins.
    const later = vi.fn();
    toolWindowHead({ title: "Find", onClose: later });
    esc();
    expect(later).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // A layered window opts out and owns Escape itself.
    const layered = vi.fn();
    toolWindowHead({ title: "Board", onClose: layered, esc: false });
    esc();
    expect(layered).not.toHaveBeenCalled();
  });
});

describe("followButton", () => {
  it("toggles, reflects, and reports the new state", () => {
    const onToggle = vi.fn();
    const f = followButton({ on: false, onToggle });
    expect(f.el.textContent).toBe("Follow in the editor");
    expect(f.el.classList.contains("on")).toBe(false);
    expect(f.el.getAttribute("aria-pressed")).toBe("false");
    expect(f.el.dataset["tip"]).toBe("Open each line in the editor as it plays");
    f.el.click();
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(f.el.classList.contains("on")).toBe(true);
    expect(f.el.dataset["tip"]).toBe("The editor opens each line as it plays. Click to stop.");
    expect(f.el.title).toBe("");
  });

  it("names what the editor opens, and set() reflects without calling back", () => {
    const onToggle = vi.fn();
    const f = followButton({ on: false, onToggle, what: "card" });
    expect(f.el.dataset["tip"]).toBe("Open each card in the editor as it plays");
    f.set(true);
    expect(f.el.classList.contains("on")).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
    f.el.click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
