// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { el, colourIndex, colourFor, PALETTE, PALETTE_SIZE } from "../src/index.js";

describe("colour hash", () => {
  it("maps a name to a stable slot in range", () => {
    const a = colourIndex("docks");
    expect(a).toBe(colourIndex("docks"));           // stable
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(PALETTE_SIZE);
    expect(colourFor("docks")).toBe(PALETTE[a]);     // css-var reference
    expect(PALETTE).toHaveLength(PALETTE_SIZE);
  });
});

describe("el superset", () => {
  it("accepts a className string (Patterpad style) and text child", () => {
    const n = el("div", "card", "hello");
    expect(n.className).toBe("card");
    expect(n.textContent).toBe("hello");
  });

  it("accepts a props bag with children and onClick (Storylet style)", () => {
    let clicked = false;
    const child = el("span", { text: "x" });
    const n = el("button", { className: "b", title: "t", onClick: () => { clicked = true; } }, child);
    expect(n.className).toBe("b");
    expect(n.title).toBe("t");
    expect(n.firstChild).toBe(child);
    n.click();
    expect(clicked).toBe(true);
  });

  it("both call styles produce identical DOM", () => {
    const a = el("div", "c", "t");
    const b = el("div", { className: "c" }, "t");
    expect(a.outerHTML).toBe(b.outerHTML);
  });

  it("skips null / undefined children", () => {
    const n = el("div", undefined, "a", null, undefined, "b");
    expect(n.childNodes).toHaveLength(2);
  });
});
