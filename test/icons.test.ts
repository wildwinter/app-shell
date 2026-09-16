// The icon vocabulary, drawn: every word has one drawing on the family grid,
// the node factory sizes and clones, and the deprecated glyph table is exactly
// what it was, so an app that has not moved yet is not broken by the move.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { icon, iconSvg, iconNode, iconHtml, iconNameOfGlyph, isIconName, ICON_NAMES, ICON_SIZE, type IconName } from "../src/icons.js";
import { iconBtn, stageChips, tagChips } from "../src/dom.js";
import { renderStepperBar } from "../src/stepper.js";
import { paintVcBadges, vcBadgeFor, lockNotice } from "../src/vc-view.js";
import { staleBar } from "../src/stale.js";
import { historyNav } from "../src/nav-history.js";
import { pinButton } from "../src/tool-window-web.js";

afterEach(() => document.body.replaceChildren());

const WORDS: IconName[] = [
  "close", "more", "collapsed", "expanded", "dropdown",
  "back", "forward", "up", "down", "arrowLeft", "arrowRight",
  "tick", "locked", "readOnly", "checkedOut", "modified", "untracked", "warning", "dot", "play", "restart",
  "viewCards", "viewTable", "viewNode", "record",
  "grip", "add", "connect", "search", "pin", "settings",
  "note", "comment",
];

describe("the drawn vocabulary", () => {
  it("has every word, once, on the 24 grid, unsized, hidden from readers", () => {
    expect([...ICON_NAMES].sort()).toEqual([...WORDS].sort());
    for (const name of WORDS) {
      const svg = iconSvg[name];
      expect(svg, name).toMatch(/^<svg viewBox="0 0 24 24" /);
      expect(svg, name).toMatch(/aria-hidden="true"/);
      // The ROOT carries no size and no Lucide baggage; an inner <rect> keeps
      // its width/height, which is geometry, not size.
      expect(svg.slice(0, svg.indexOf(">")), `${name} root`).not.toMatch(/\swidth=|\sheight=|xmlns=|class=/);
      expect(svg, name).toMatch(/currentColor/);
      expect(svg, name).toMatch(/<\/svg>$/);
    }
  });

  it("strokes at 2.571 on the 24 grid, which is 1.5px at the family's 14px", () => {
    const stroked = WORDS.filter((n) => iconSvg[n].includes('stroke="currentColor"'));
    const filledOnly = WORDS.filter((n) => !iconSvg[n].includes("stroke="));
    expect(stroked.length + filledOnly.length).toBe(WORDS.length);
    for (const n of stroked) expect(iconSvg[n], n).toContain('stroke-width="2.571"');
    expect(Number((2.571 * 14 / 24).toFixed(2))).toBe(1.5);
    // The discs: fill forced, no stroke, so a caller's colour is the whole disc.
    expect(filledOnly.sort()).toEqual(["dot", "modified", "record"]);
    for (const n of filledOnly) expect(iconSvg[n], n).toContain('fill="currentColor"');
  });

  it("keeps the inner width/height that a rect needs (the lock body, the grid cells)", () => {
    expect(iconSvg.locked).toContain('<rect width="18" height="11"');
    expect(iconSvg.viewCards).toContain('<rect width="7" height="7"');
  });

  it("iconNode returns a fresh, sized SVG each time, stamped with the word", () => {
    const a = iconNode("close");
    const b = iconNode("close");
    expect(a).not.toBe(b);
    expect(a.tagName.toLowerCase()).toBe("svg");
    expect(a.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(a.getAttribute("width")).toBe(String(ICON_SIZE));
    expect(a.getAttribute("height")).toBe("14");
    expect(a.getAttribute("data-icon")).toBe("close");
    expect(a.getAttribute("aria-hidden")).toBe("true");
    expect(a.getAttribute("viewBox")).toBe("0 0 24 24");
    const big = iconNode("play", 20);
    expect(big.getAttribute("width")).toBe("20");
    expect(big.getAttribute("height")).toBe("20");
    // A mutation on one clone does not leak into the template or the next clone.
    a.setAttribute("width", "99");
    expect(iconNode("close").getAttribute("width")).toBe("14");
  });

  it("iconHtml is the same drawing as a sized string", () => {
    const html = iconHtml("tick", 12);
    expect(html).toMatch(/^<svg width="12" height="12" data-icon="tick" viewBox="0 0 24 24"/);
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const fromHtml = holder.firstElementChild!;
    const fromNode = iconNode("tick", 12);
    // Same drawing, same size, same word; attribute ORDER is the parser's.
    expect(fromHtml.innerHTML).toBe(fromNode.innerHTML);
    for (const a of ["width", "height", "data-icon", "viewBox", "stroke-width", "aria-hidden"]) {
      expect(fromHtml.getAttribute(a), a).toBe(fromNode.getAttribute(a));
    }
  });

  it("knows its words and the deprecated glyphs they replace", () => {
    expect(isIconName("close")).toBe(true);
    expect(isIconName("✕")).toBe(false);
    expect(isIconName("toString")).toBe(false);
    expect(iconNameOfGlyph("✕")).toBe("close");
    expect(iconNameOfGlyph("↑")).toBe("up");
    expect(iconNameOfGlyph("▾")).toBe("expanded");   // first in table order of the two that shared it
    expect(iconNameOfGlyph("x")).toBeUndefined();
  });
});

describe("the deprecated glyph table", () => {
  it("is unchanged, so an app still setting text is not broken by the move", () => {
    expect(icon).toEqual({
      close: "✕", more: "⋯", collapsed: "▸", expanded: "▾", dropdown: "▾",
      back: "‹", forward: "›", up: "↑", down: "↓",
      tick: "✓", locked: "⊘", readOnly: "○", checkedOut: "✎", modified: "●", untracked: "+",
      warning: "‼", dot: "●", play: "▶", restart: "⟲", viewCards: "▦", viewTable: "☰", viewNode: "◈",
      grip: "⠿", add: "+", note: "✎", comment: "❝",
    });
    expect(Object.keys(icon)).toHaveLength(26);
    // Every old word is still a word.
    for (const k of Object.keys(icon)) expect(isIconName(k), k).toBe(true);
  });

  it("keeps the legacy 16-grid note pair byte for byte", () => {
    expect(iconSvg.noteFilled).toMatch(/^<svg viewBox="0 0 16 16" width="13" height="13"/);
    expect(iconSvg.noteOutline).toMatch(/^<svg viewBox="0 0 16 16" width="13" height="13"/);
  });
});

describe("the shell's own chrome draws the set", () => {
  it("iconBtn holds an svg, not text, from a word or from a legacy glyph", () => {
    const byWord = iconBtn("up", "Move up", () => {});
    expect(byWord.textContent).toBe("");
    expect(byWord.querySelector("svg")?.getAttribute("data-icon")).toBe("up");
    expect(byWord.querySelector("svg")?.getAttribute("width")).toBe("14");
    expect(byWord.dataset["tip"]).toBe("Move up");
    expect(byWord.getAttribute("aria-label")).toBe("Move up");
    expect(byWord.title).toBe("");
    // An app that still passes the typed character gets the drawing it stood for.
    const byGlyph = iconBtn("✕", "Remove", () => {}, false, true);
    expect(byGlyph.textContent).toBe("");
    expect(byGlyph.querySelector("svg")?.getAttribute("data-icon")).toBe("close");
    expect(byGlyph.classList.contains("danger")).toBe(true);
    // Anything else is still set as text (the old behaviour, on its way out).
    expect(iconBtn("?", "Help", () => {}).textContent).toBe("?");
  });

  it("chips draw their remove and move controls at chip size", () => {
    const tags = tagChips({ values: ["a"] });
    expect(tags.querySelector(".shell-tag-x svg")?.getAttribute("data-icon")).toBe("close");
    expect(tags.querySelector(".shell-tag-x svg")?.getAttribute("width")).toBe("10");
    const stages = stageChips({ stages: ["one", "two"] });
    const words = [...stages.querySelectorAll(".shell-tag-x svg")].map((s) => s.getAttribute("data-icon"));
    expect(words).toEqual(["back", "forward", "close", "back", "forward", "close"]);
  });

  it("the stepper's three controls are drawn at 12px", () => {
    const h = document.createElement("div");
    renderStepperBar(h, { items: [{ text: "a" }, { text: "b" }], at: 0, onClose: () => {}, onStep: () => {}, onGo: () => {} });
    const words = [...h.querySelectorAll(".stepbar-nav svg")].map((s) => `${s.getAttribute("data-icon")}@${s.getAttribute("width")}`);
    expect(words).toEqual(["back@12", "forward@12", "close@12"]);
    for (const b of h.querySelectorAll(".stepbar-nav")) expect(b.textContent).toBe("");
  });

  it("a version-control badge names its word and draws it; the glyph is only for the deprecated caller", () => {
    expect(vcBadgeFor({ key: "a", writable: false, lockedBy: ["bo"] })).toMatchObject({ name: "locked", glyph: "⊘", cls: "vc-locked" });
    expect(vcBadgeFor({ key: "a", writable: false })?.name).toBe("readOnly");
    document.body.innerHTML = `<div id="r"><i data-vc="a"></i></div>`;
    paintVcBadges(document.getElementById("r")!, new Map([["a", { key: "a", writable: true, dirty: true }]]));
    const badge = document.querySelector(".vc-badge")!;
    expect(badge.textContent).toBe("");
    expect(badge.querySelector("svg")?.getAttribute("data-icon")).toBe("modified");
    expect(badge.querySelector("svg")?.getAttribute("width")).toBe("12");
    expect(badge.getAttribute("aria-label")).toBe("Modified. Local changes aren't committed yet.");
    expect(lockNotice(["bo"]).querySelector(".vc-lock-glyph svg")?.getAttribute("data-icon")).toBe("locked");
  });

  it("the stale bar's restart is a node beside the word, not a character inside it", () => {
    const go = staleBar({ subject: "The scene", onRestart: () => {} }).querySelector(".stale-bar-go")!;
    expect(go.textContent).toBe("Restart");
    expect(go.querySelector("svg")?.getAttribute("data-icon")).toBe("restart");
  });

  it("the history pair are arrows (time), the pane toggles chevrons (structure)", () => {
    const nav = historyNav(() => {}, () => {});
    const words = [...nav.el.querySelectorAll("svg")].map((s) => s.getAttribute("data-icon"));
    expect(words).toEqual(["arrowLeft", "arrowRight"]);
    expect(nav.el.textContent).toBe("");
  });

  it("the pin button draws the vocabulary's pin", () => {
    expect(pinButton({ pinned: false, onToggle: () => {} }).el.querySelector("svg")?.getAttribute("data-icon")).toBe("pin");
  });
});
