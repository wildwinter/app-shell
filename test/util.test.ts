// The small idioms (util.ts).
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plural, debounce, isEditableTarget, formatCount, copyWithFeedback, relativeTime } from "../src/util.js";

describe("plural", () => {
  it("adds an s except for one, or takes the irregular form", () => {
    expect(plural(0, "link")).toBe("0 links");
    expect(plural(1, "link")).toBe("1 link");
    expect(plural(3, "link")).toBe("3 links");
    expect(plural(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once, after the last call, with the last arguments", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1); d(2); d(3);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("cancel drops the pending call; flush runs it now", () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d("a"); d.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    d("b"); d.flush();
    expect(fn).toHaveBeenCalledWith("b");
    d.flush();   // nothing pending: a no-op
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("isEditableTarget", () => {
  it("is true for input, textarea, select and contenteditable, false otherwise", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("select"))).toBe(true);
    const ce = document.createElement("div"); ce.setAttribute("contenteditable", "plaintext-only");
    expect(isEditableTarget(ce)).toBe(true);
    const off = document.createElement("div"); off.setAttribute("contenteditable", "false");
    expect(isEditableTarget(off)).toBe(false);
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});

describe("formatCount", () => {
  it("groups the digits", () => {
    expect(formatCount(1234567)).toBe((1234567).toLocaleString());
    expect(formatCount(7)).toBe("7");
  });
});

describe("copyWithFeedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes the clipboard, lights .copied, and reverts after the delay (restarted by a second copy)", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const el = document.createElement("button");
    await copyWithFeedback(el, "ws://x");
    expect(writeText).toHaveBeenCalledWith("ws://x");
    expect(el.classList.contains("copied")).toBe(true);
    vi.advanceTimersByTime(600);
    await copyWithFeedback(el, "ws://x");
    vi.advanceTimersByTime(600);
    expect(el.classList.contains("copied")).toBe(true);   // restarted, not stacked
    vi.advanceTimersByTime(400);
    expect(el.classList.contains("copied")).toBe(false);
    await copyWithFeedback(el, "y", 50);
    vi.advanceTimersByTime(50);
    expect(el.classList.contains("copied")).toBe(false);
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);
  const ago = (ms: number): number => now - ms;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  it("uses one wording", () => {
    expect(relativeTime(ago(10_000), now)).toBe("just now");
    expect(relativeTime(ago(MIN), now)).toBe("1 minute ago");
    expect(relativeTime(ago(6 * MIN), now)).toBe("6 minutes ago");
    expect(relativeTime(ago(HOUR), now)).toBe("an hour ago");
    expect(relativeTime(ago(3 * HOUR), now)).toBe("3 hours ago");
    expect(relativeTime(ago(DAY), now)).toBe("yesterday");
    expect(relativeTime(ago(5 * DAY), now)).toBe("5 days ago");
    expect(relativeTime(new Date(ago(2 * DAY)), now)).toBe("2 days ago");
    expect(relativeTime(new Date(ago(MIN)).toISOString(), now)).toBe("1 minute ago");
  });

  it("falls back to the date past a week, and never says the future", () => {
    expect(relativeTime(ago(30 * DAY), now)).toBe(new Date(ago(30 * DAY)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
    expect(relativeTime(now + HOUR, now)).toBe("just now");
    expect(relativeTime("not a date", now)).toBe("");
  });
});
