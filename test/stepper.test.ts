// The stepper bar: the walk, the wrap, the empty cases, and the two segments
// Patterpad's bars did not have.
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderStepperBar, type StepperItem } from "../src/stepper.js";

const items: StepperItem[] = [
  { kind: "error", kindClass: "sev-error", where: "arrival [when]", text: "no such tag" },
  { kind: "warning", kindClass: "sev-warning", where: "departure", text: "never dealt" },
];

function host(): HTMLElement { return document.createElement("div"); }

describe("renderStepperBar", () => {
  it("shows the count, the position and the current entry", () => {
    const h = host();
    renderStepperBar(h, { items, at: 0, tone: "danger", onStep: () => {}, onGo: () => {} });
    expect(h.hidden).toBe(false);
    expect(h.querySelector(".stepbar-count")?.textContent).toBe("2");
    expect(h.querySelector(".stepbar-count")?.className).toContain("danger");
    expect(h.querySelector(".stepbar-of")?.textContent).toBe("1/2");
    expect(h.querySelector(".stepbar-cat")?.className).toContain("sev-error");
    expect(h.querySelector(".stepbar-where")?.textContent).toBe("arrival [when]");
    expect(h.querySelector(".stepbar-msg")?.textContent).toBe("no such tag");
  });

  it("wraps in both directions, so the walk has no dead end", () => {
    const h = host();
    const onStep = vi.fn();
    renderStepperBar(h, { items, at: 0, onStep, onGo: () => {} });
    const [prev, next] = [...h.querySelectorAll<HTMLButtonElement>(".stepbar-nav")];
    prev!.click();
    expect(onStep).toHaveBeenLastCalledWith(1);     // back from the first is the last
    next!.click();
    expect(onStep).toHaveBeenLastCalledWith(1);
  });

  it("drops the steppers for a list of one", () => {
    const h = host();
    renderStepperBar(h, { items: [items[0]!], at: 0, onStep: () => {}, onGo: () => {} });
    expect(h.querySelector(".stepbar-of")).toBeNull();
    expect(h.querySelectorAll(".stepbar-nav").length).toBe(0);
  });

  it("clamps an index that points off the end", () => {
    // A list that shrank under a bar pointing at its last entry: show the new
    // last one rather than nothing at all.
    const h = host();
    renderStepperBar(h, { items, at: 9, onStep: () => {}, onGo: () => {} });
    expect(h.querySelector(".stepbar-of")?.textContent).toBe("2/2");
  });

  it("reports the current index on go", () => {
    const h = host();
    const onGo = vi.fn();
    renderStepperBar(h, { items, at: 1, onStep: () => {}, onGo });
    h.querySelector<HTMLButtonElement>(".stepbar-cur")!.click();
    expect(onGo).toHaveBeenCalledWith(1);
  });

  it("hides itself when empty and ambient, and stays up when it is a mode", () => {
    const h = host();
    renderStepperBar(h, { items: [], at: 0, onStep: () => {}, onGo: () => {} });
    expect(h.hidden).toBe(true);
    expect(h.childElementCount).toBe(0);

    renderStepperBar(h, { items: [], at: 0, empty: "No open comments.", onStep: () => {}, onGo: () => {} });
    expect(h.hidden).toBe(false);
    expect(h.querySelector(".stepbar-empty")?.textContent).toBe("No open comments.");
    expect(h.querySelector(".stepbar-count")?.textContent).toBe("0");
  });

  it("puts actions before the close button, and skips the nulls", () => {
    const h = host();
    const onClose = vi.fn();
    const fix = document.createElement("button");
    fix.className = "fixbtn";
    renderStepperBar(h, { items, at: 0, actions: [fix, null, undefined], onClose, onStep: () => {}, onGo: () => {} });
    const tail = [...h.children].slice(-2).map((c) => c.className);
    expect(tail).toEqual(["fixbtn", "stepbar-nav stepbar-close"]);
    h.querySelector<HTMLButtonElement>(".stepbar-close")!.click();
    expect(onClose).toHaveBeenCalled();
  });

  it("omits the kind and where segments when an entry has neither", () => {
    const h = host();
    renderStepperBar(h, { items: [{ text: "just the line" }], at: 0, onStep: () => {}, onGo: () => {} });
    expect(h.querySelector(".stepbar-cat")).toBeNull();
    expect(h.querySelector(".stepbar-where")).toBeNull();
    expect(h.querySelector(".stepbar-msg")?.textContent).toBe("just the line");
  });
});
