// The exit motion helper (exit.ts). Pinned because every closing surface in the
// suite routes through it, and its two failure modes are both invisible to a
// glance: a panel torn down mid-fade, and a panel that never tears down at all.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeWithExit } from "../src/exit.js";

const withDuration = (seconds: string): void => {
  // jsdom computes no animation, so a duration has to be faked to exercise the
  // waiting path at all.
  vi.spyOn(window, "getComputedStyle").mockReturnValue(
    { animationDuration: seconds } as unknown as CSSStyleDeclaration,
  );
};

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.body.replaceChildren(); });

describe("closeWithExit", () => {
  it("marks the element closing so the CSS can swap the keyframes", () => {
    const el = document.createElement("div");
    closeWithExit(el, () => {});
    expect(el.classList.contains("closing")).toBe(true);
  });

  it("tears down SYNCHRONOUSLY when there is no animation", () => {
    // The reduced-motion path, and jsdom's default. Somebody who has asked for
    // less motion should get an instant close, not an invisible wait.
    const el = document.createElement("div");
    let done = false;
    closeWithExit(el, () => { done = true; });
    expect(done).toBe(true);
  });

  it("waits for the animation, and only its OWN", () => {
    vi.useFakeTimers();
    withDuration("0.17s");
    const el = document.createElement("div");
    const inner = document.createElement("span");
    el.append(inner);
    document.body.append(el);
    let done = false;
    closeWithExit(el, () => { done = true; });

    // An inner element finishing its own animation must not tear the panel down
    // around it: content inside a panel animates too.
    inner.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(done).toBe(false);

    el.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(done).toBe(true);
  });

  it("falls back to a timeout when animationend never arrives", () => {
    // A hidden or interrupted animation raises no event, and a panel that never
    // tears down is worse than one that closes abruptly.
    vi.useFakeTimers();
    withDuration("0.17s");
    const el = document.createElement("div");
    let done = false;
    closeWithExit(el, () => { done = true; });
    expect(done).toBe(false);
    vi.advanceTimersByTime(170 + 120 + 1);
    expect(done).toBe(true);
  });

  it("runs the teardown exactly once", () => {
    vi.useFakeTimers();
    withDuration("0.17s");
    const el = document.createElement("div");
    const done = vi.fn();
    closeWithExit(el, done);
    el.dispatchEvent(new Event("animationend", { bubbles: true }));
    el.dispatchEvent(new Event("animationend", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
