// The context menu and popover (context-menu.ts): Escape closes, a disabled
// item does nothing, the menu stays inside the viewport, one at a time.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openContextMenu, openPopover } from "../src/context-menu.js";

afterEach(() => { document.body.replaceChildren(); });

const menu = (): HTMLElement | null => document.querySelector<HTMLElement>(".ctxmenu");
const items = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>(".ctxmenu-item")];

describe("openContextMenu", () => {
  it("draws one button per item at the point asked for", () => {
    openContextMenu(40, 50, [{ label: "Rename", onClick: () => {} }, { label: "Delete scene", danger: true, onClick: () => {} }]);
    expect(menu()?.style.left).toBe("40px");
    expect(menu()?.style.top).toBe("50px");
    expect(items().map((b) => b.textContent)).toEqual(["Rename", "Delete scene"]);
    expect(items()[1]!.classList.contains("danger")).toBe(true);
    expect(menu()?.getAttribute("role")).toBe("menu");
  });

  it("runs the item and closes on click", () => {
    const rename = vi.fn();
    openContextMenu(0, 0, [{ label: "Rename", onClick: rename }]);
    items()[0]!.click();
    expect(rename).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it("Escape closes it", () => {
    openContextMenu(0, 0, [{ label: "Rename", onClick: () => {} }]);
    expect(menu()).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu()).toBeNull();
  });

  it("a pointerdown outside closes it; one inside does not", () => {
    openContextMenu(0, 0, [{ label: "Rename", onClick: () => {} }]);
    items()[0]!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu()).not.toBeNull();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu()).toBeNull();
  });

  it("a disabled item is inert: greyed, not activated, and the menu stays open", () => {
    const up = vi.fn();
    openContextMenu(0, 0, [{ label: "Move up", disabled: true, onClick: up }]);
    const item = items()[0]!;
    expect(item.disabled).toBe(true);
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(up).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it("clamps into the viewport", () => {
    // jsdom lays nothing out, so the menu reports the size it would have.
    const proto = HTMLElement.prototype;
    const real = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      const left = parseFloat(this.style.left) || 0, top = parseFloat(this.style.top) || 0;
      return { left, top, width: 160, height: 80, right: left + 160, bottom: top + 80, x: left, y: top, toJSON() { return {}; } } as DOMRect;
    };
    try {
      openContextMenu(window.innerWidth - 10, window.innerHeight - 10, [{ label: "Rename", onClick: () => {} }]);
      expect(menu()?.style.left).toBe(`${window.innerWidth - 160 - 6}px`);
      expect(menu()?.style.top).toBe(`${window.innerHeight - 80 - 6}px`);
    } finally { proto.getBoundingClientRect = real; }
  });

  it("only one is ever open", () => {
    openContextMenu(0, 0, [{ label: "One", onClick: () => {} }]);
    openContextMenu(0, 0, [{ label: "Two", onClick: () => {} }]);
    expect(document.querySelectorAll(".ctxmenu")).toHaveLength(1);
    expect(items()[0]!.textContent).toBe("Two");
  });
});

describe("openPopover", () => {
  it("hosts what build returns under the anchor, and onClose runs once however it closes", () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const onClose = vi.fn();
    let closeIt: (() => void) | null = null;
    openPopover(anchor, (close) => { closeIt = close; const d = document.createElement("div"); d.className = "inner"; return d; }, onClose);
    expect(document.querySelector(".popover .inner")).not.toBeNull();
    closeIt!();
    expect(document.querySelector(".popover")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("appends to the host given, so a popover opened inside a modal dialog paints above it", () => {
    const dialog = document.createElement("dialog");
    const anchor = document.createElement("button");
    dialog.append(anchor);
    document.body.append(dialog);
    openPopover(anchor, () => document.createElement("div"), undefined, { host: dialog });
    const pop = document.querySelector<HTMLElement>(".popover")!;
    expect(pop.parentElement).toBe(dialog);
    // Still the one popover, still closed the usual ways.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".popover")).toBeNull();
  });

  it("Escape closes a popover and reports", () => {
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const onClose = vi.fn();
    openPopover(anchor, () => document.createElement("div"), onClose);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".popover")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
