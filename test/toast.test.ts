// The toast (toast.ts): the two apps' transient remark, drawn one way.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast, dismissToast } from "../src/toast.js";

const node = (): HTMLElement => document.querySelector(".shell-toast") as HTMLElement;

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("toast", () => {
  it("mounts its own node, announced politely", () => {
    // No host markup: a second window gets the whole thing by importing it.
    toast("Bundle published");
    const t = node();
    expect(t).toBeTruthy();
    expect(t.hidden).toBe(false);
    expect(t.textContent).toBe("Bundle published");
    expect(t.getAttribute("role")).toBe("status");
    expect(t.getAttribute("aria-live")).toBe("polite");
  });

  it("carries the kind on the class, and info is the plain case", () => {
    toast("Saved");
    expect(node().className).toBe("shell-toast info");
    toast("Published", "ok");
    expect(node().className).toBe("shell-toast ok");
    toast("Save refused", "error");
    expect(node().className).toBe("shell-toast error");
  });

  it("replaces rather than stacks", () => {
    toast("one"); toast("two"); toast("three");
    expect(document.querySelectorAll(".shell-toast").length).toBe(1);
    expect(node().textContent).toBe("three");
  });

  it("stays 4s, and 7s for an error", () => {
    vi.useFakeTimers();
    toast("Saved");
    vi.advanceTimersByTime(3999);
    expect(node().hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(node().hidden).toBe(true);   // jsdom: no animation, so the exit is synchronous

    toast("Save refused", "error");
    vi.advanceTimersByTime(4000);
    expect(node().hidden).toBe(false);  // an error is still up where an info would be gone
    vi.advanceTimersByTime(3000);
    expect(node().hidden).toBe(true);
  });

  it("a replacement is not hidden by its predecessor's timer", () => {
    // The trap: toast A schedules a hide at 4s; toast B arrives at 3s and should
    // stay its full 4s, not vanish a second later when A's timer fires.
    vi.useFakeTimers();
    toast("A");
    vi.advanceTimersByTime(3000);
    toast("B");
    vi.advanceTimersByTime(1500);       // 4.5s after A, 1.5s after B
    expect(node().hidden).toBe(false);
    expect(node().textContent).toBe("B");
    vi.advanceTimersByTime(2500);       // 4s after B
    expect(node().hidden).toBe(true);
  });

  it("honours an explicit duration", () => {
    vi.useFakeTimers();
    toast("brief", "info", { duration: 500 });
    vi.advanceTimersByTime(499);
    expect(node().hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(node().hidden).toBe(true);
  });

  it("dismisses on request, and a dismiss is a no-op with nothing up", () => {
    toast("Saved");
    dismissToast();
    expect(node().hidden).toBe(true);
    expect(() => dismissToast()).not.toThrow();
  });

  it("routes the exit through the shared motion helper", () => {
    // The `.closing` class is what the CSS swaps keyframes on.
    vi.useFakeTimers();
    let sawClosing = false;
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation(((e: Element) => {
      if (e.classList.contains("closing")) sawClosing = true;
      return { animationDuration: "0s" } as unknown as CSSStyleDeclaration;
    }) as typeof window.getComputedStyle);
    toast("Saved");
    vi.advanceTimersByTime(4000);
    expect(sawClosing).toBe(true);
    spy.mockRestore();
  });

  it("carries an action button that runs once and dismisses (Undo replaces \"Are you sure?\")", () => {
    const run = vi.fn();
    toast("Deleted \u201cThe Road North\u201d.", "info", { action: { label: "Undo", run } });
    const t = node();
    expect(t.classList.contains("has-action")).toBe(true);
    expect(t.querySelector(".shell-toast-text")?.textContent).toBe("Deleted \u201cThe Road North\u201d.");
    const b = t.querySelector<HTMLButtonElement>(".shell-toast-action")!;
    expect(b.textContent).toBe("Undo");
    expect(b.type).toBe("button");
    b.click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(t.classList.contains("closing") || t.hidden).toBe(true);
  });

  it("gives an action 8s, and holds while the pointer is on it", () => {
    vi.useFakeTimers();
    toast("Deleted \u201cA\u201d.", "info", { action: { label: "Undo", run: () => {} } });
    const t = node();
    vi.advanceTimersByTime(5000);
    t.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(60000);
    expect(t.hidden).toBe(false);
    expect(t.classList.contains("closing")).toBe(false);
    t.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(2999);
    expect(t.classList.contains("closing")).toBe(false);
    vi.advanceTimersByTime(2);
    expect(t.classList.contains("closing") || t.hidden).toBe(true);
  });

  it("drops the action when a plain toast replaces it", () => {
    toast("Deleted.", "info", { action: { label: "Undo", run: () => {} } });
    toast("Saved");
    expect(node().querySelector(".shell-toast-action")).toBeNull();
    expect(node().classList.contains("has-action")).toBe(false);
    expect(node().textContent).toBe("Saved");
  });
});
