// Separators are drawn: the metadata line and the breadcrumb as DOM, with the
// dot and the chevron coming from CSS and the icon vocabulary rather than a
// symbol font.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { metaLine, breadcrumb } from "../src/dom.js";

afterEach(() => document.body.replaceChildren());

describe("metaLine", () => {
  it("renders each part as a span and never types a middle dot", () => {
    const line = metaLine(["6 runs", "200 max steps", "seed 4"]);
    expect(line.className).toBe("shell-meta");
    const parts = [...line.querySelectorAll(".shell-meta-part")].map((p) => p.textContent);
    expect(parts).toEqual(["6 runs", "200 max steps", "seed 4"]);
    expect(line.textContent).not.toContain("·");
    expect(line.textContent).not.toContain("|");
  });

  it("takes nodes as parts and skips the empty ones", () => {
    const strong = document.createElement("strong");
    strong.textContent = "3 errored";
    const line = metaLine(["6 runs", undefined, "", null, strong]);
    expect(line.querySelectorAll(".shell-meta-part")).toHaveLength(2);
    expect(line.querySelector("strong")?.textContent).toBe("3 errored");
  });

  it("draws the separator as a disc in CSS, not a character", () => {
    const css = readFileSync(join(process.cwd(), "src/controls.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const m = /\.shell-meta-part \+ \.shell-meta-part::before \{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    expect(m?.[1]).toContain('content: ""');
    expect(m?.[1]).toMatch(/width: 3px; height: 3px/);
    expect(m?.[1]).toContain("var(--muted)");
  });
});

describe("breadcrumb", () => {
  it("draws an svg chevron between crumbs and no › anywhere", () => {
    const trail = breadcrumb(["Box", "Deck", "Card"]);
    expect(trail.tagName).toBe("NAV");
    expect(trail.querySelectorAll("svg.shell-crumb-sep")).toHaveLength(2);
    expect(trail.querySelector("svg")?.getAttribute("data-icon")).toBe("forward");
    expect(trail.querySelector("svg")?.getAttribute("width")).toBe("12");
    expect(trail.textContent).toBe("BoxDeckCard");
    expect(trail.textContent).not.toContain("›");
  });

  it("makes a crumb with onClick a button, except the last, which is where you are", () => {
    const onBox = vi.fn();
    const onCard = vi.fn();
    const trail = breadcrumb([{ label: "Box", onClick: onBox }, "Deck", { label: "Card", onClick: onCard }]);
    const crumbs = [...trail.querySelectorAll(".shell-crumb")];
    expect(crumbs.map((c) => c.tagName)).toEqual(["BUTTON", "SPAN", "SPAN"]);
    expect(crumbs[2]?.getAttribute("aria-current")).toBe("location");
    (crumbs[0] as HTMLButtonElement).click();
    expect(onBox).toHaveBeenCalledTimes(1);
    expect(onCard).not.toHaveBeenCalled();
    expect(trail.querySelector("[title]")).toBeNull();
  });
});
