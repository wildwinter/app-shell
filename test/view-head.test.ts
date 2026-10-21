// The view window's head (view-head.ts) as the preload wires it: the pin and close send to main, main's state
// moves the pin, and Escape closes unless a field or the view took it.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { VIEW_CLOSE_CHANNEL, VIEW_HEAD_CHANNEL, VIEW_PIN_CHANNEL, viewHeadHtml, wireViewHead } from "../src/view-head.js";

function setUp(pinned?: boolean) {
  document.body.innerHTML = `${viewHeadHtml({ title: "Sheet", ...(pinned !== undefined ? { pinned } : {}) })}<input id="f">`;
  const sent: unknown[][] = [];
  const listeners = new Map<string, (e: unknown, ...a: unknown[]) => void>();
  wireViewHead(document, { send: (...a) => { sent.push(a); }, on: (ch, fn) => listeners.set(ch, fn) });
  const pin = document.querySelector<HTMLButtonElement>("[data-view-pin]");
  return { sent, listeners, pin };
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => { document.body.innerHTML = ""; });

describe("wireViewHead", () => {
  it("sends the pin's new state, and reflects main's", () => {
    const { sent, listeners, pin } = setUp(true);
    pin!.click();
    expect(sent).toEqual([[VIEW_PIN_CHANNEL, false]]);
    expect(pin!.classList.contains("on")).toBe(false);
    expect(pin!.getAttribute("aria-label")).toBe("Keep on top");
    listeners.get(VIEW_HEAD_CHANNEL)!(null, { pinned: true });
    expect(pin!.getAttribute("aria-pressed")).toBe("true");
    expect(pin!.title).toBe("Pinned on top. Click to unpin.");
    listeners.get(VIEW_HEAD_CHANNEL)!(null, "junk");
    expect(pin!.getAttribute("aria-pressed")).toBe("true");
  });

  it("has no pin with nothing to pin above, and close sends close", () => {
    const { sent, pin } = setUp();
    expect(pin).toBeNull();
    document.querySelector<HTMLButtonElement>("[data-view-close]")!.click();
    expect(sent).toEqual([[VIEW_CLOSE_CHANNEL]]);
  });

  it("closes on Escape, but not from a field or once the view has taken it", async () => {
    const { sent } = setUp(false);
    document.getElementById("f")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const taken = (e: KeyboardEvent): void => e.preventDefault();
    window.addEventListener("keydown", taken);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    window.removeEventListener("keydown", taken);
    await flush();
    expect(sent).toEqual([]);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await flush();
    expect(sent).toEqual([[VIEW_CLOSE_CHANNEL]]);
  });

  it("does nothing on a page with no head", () => {
    document.body.innerHTML = "<x-y></x-y>";
    const on = vi.fn();
    wireViewHead(document, { send: vi.fn(), on });
    expect(on).not.toHaveBeenCalled();
  });
});
