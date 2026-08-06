// The themed tooltip: the delegated `data-tip` route, and the rect-anchored one
// a canvas uses for shapes that have no DOM node of their own.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hideTip, initTooltips, tipAt, tipBold } from "../src/tooltip.js";

const bubble = (): HTMLElement | null => document.querySelector<HTMLElement>(".tooltip");
const visible = (): boolean => { const t = bubble(); return !!t && !t.hidden; };

/** jsdom measures nothing, so give the bubble and the anchor a size worth
 *  placing against. */
function measured(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () => ({
    ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
}

beforeEach(() => {
  vi.useFakeTimers();
  initTooltips();          // idempotent: the first test wires it, the rest reuse it
  hideTip();
});
afterEach(() => { vi.useRealTimers(); document.body.querySelectorAll("[data-tip]").forEach((n) => n.remove()); });

describe("the delegated route", () => {
  it("waits before showing, and shows what the element says", () => {
    const b = document.createElement("button");
    b.dataset["tip"] = "Fit everything (Home)";
    document.body.append(b);
    b.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(visible()).toBe(false);          // not instant: a pass-through must not flash
    vi.advanceTimersByTime(400);
    expect(bubble()?.textContent).toBe("Fit everything (Home)");
  });

  it("renders a bold run without any HTML from the caller", () => {
    const b = document.createElement("button");
    b.dataset["tip"] = `${tipBold("Ada")} left a note`;
    document.body.append(b);
    b.dispatchEvent(new Event("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(bubble()?.querySelector("strong")?.textContent).toBe("Ada");
    expect(bubble()?.textContent).toBe("Ada left a note");
  });

  it("goes down on Escape", () => {
    const b = document.createElement("button");
    b.dataset["tip"] = "Zoom in";
    document.body.append(b);
    b.dispatchEvent(new Event("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(400);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(visible()).toBe(false);
  });
});

describe("the rect-anchored route", () => {
  const rect = { left: 100, top: 200, width: 60, height: 40 };

  it("shows a tip for something with no element, after the same wait", () => {
    tipAt("c_1", rect, "Arrive at the inn");
    expect(visible()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(bubble()?.textContent).toBe("Arrive at the inn");
  });

  it("re-places the SAME subject without making it wait again", () => {
    tipAt("c_1", rect, "Arrive at the inn");
    vi.advanceTimersByTime(400);
    measured(bubble()!, { left: 0, top: 0, width: 80, height: 20 });
    // A camera move: same card, new position. It should travel, not restart.
    tipAt("c_1", { ...rect, left: 300 }, "Arrive at the inn");
    expect(visible()).toBe(true);
    expect(bubble()?.style.left).toBe("290px");   // centred on the anchor
  });

  it("makes a DIFFERENT subject wait, so sweeping a dense board does not strobe", () => {
    tipAt("c_1", rect, "Arrive at the inn");
    vi.advanceTimersByTime(400);
    tipAt("c_2", rect, "Last orders");
    expect(visible()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(bubble()?.textContent).toBe("Last orders");
  });

  it("comes down when asked, and stays down", () => {
    tipAt("c_1", rect, "Arrive at the inn");
    vi.advanceTimersByTime(400);
    hideTip();
    expect(visible()).toBe(false);
    vi.advanceTimersByTime(400);            // the pending timer must not resurrect it
    expect(visible()).toBe(false);
  });

  it("flips below the anchor when there is no room above", () => {
    tipAt("c_top", { left: 100, top: 4, width: 60, height: 40 }, "Up against the ceiling");
    vi.advanceTimersByTime(400);
    // Anchor top 4 + height 40 + the 7px gap: below, rather than off the window.
    expect(bubble()?.style.top).toBe("51px");
  });
});
