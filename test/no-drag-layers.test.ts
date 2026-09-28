// Every layer the shell draws over the page is exempt from window-drag regions.
//
// In Electron a click inside a `-webkit-app-region: drag` area goes to the OS as a window drag before
// the page sees it, and a modal making the page behind it inert does not change that. The welcome
// screen is one whole-window drag region, so a dialog opened over it (the first-run identity, About)
// lost every click while the keyboard still worked (2026-09-28, reproduced in a real Electron
// window). `-webkit-app-region: no-drag` on the layer is the fix. jsdom cannot hit-test drag
// regions, so this holds the rule where it lives: each layer's root class, and the stylesheet that
// must exempt it.
// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFloating } from "../src/floating.js";

const SRC = join(process.cwd(), "src");
const css = (file: string): string => readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Each layer the shell attaches to the page, and where its exemption must be written. */
const LAYERS: { owner: string; selector: string; sheet: string }[] = [
  { owner: "dialog.ts (every modal on the frame)", selector: ".shell-dialog", sheet: "dialog.css" },
  { owner: "settings.ts", selector: ".settings-dialog", sheet: "settings.css" },
  { owner: "context-menu.ts (the menu)", selector: ".ctxmenu", sheet: "context-menu.css" },
  { owner: "context-menu.ts (the popover)", selector: ".popover", sheet: "context-menu.css" },
  { owner: "anchored.ts", selector: ".shell-anchored", sheet: "anchored.css" },
  { owner: "toast.ts", selector: ".shell-toast", sheet: "toast.css" },
  { owner: "floating.ts (the caller's class, so an attribute)", selector: "[data-shell-layer]", sheet: "tokens.css" },
];

/** True when the sheet has a rule naming the selector and its descendants as no-drag. */
const exempts = (sheet: string, selector: string): boolean => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = css(sheet).match(/[^{}]+\{[^{}]*-webkit-app-region:\s*no-drag[^{}]*\}/g) ?? [];
  return rules.some((r) => new RegExp(`${esc}\\s*,`).test(r) && new RegExp(`${esc}\\s+\\*`).test(r));
};

afterEach(() => { document.body.replaceChildren(); });

describe("layers drawn over the page never swallow clicks as a window drag", () => {
  for (const layer of LAYERS) {
    it(`${layer.owner}: ${layer.sheet} makes ${layer.selector} and its contents no-drag`, () => {
      expect(exempts(layer.sheet, layer.selector)).toBe(true);
    });
  }

  it("createFloating marks its element, since the class it gets is the caller's", () => {
    expect(createFloating("popup").el.hasAttribute("data-shell-layer")).toBe(true);
  });

  it("the list is complete: every source that attaches to <body> is covered above", () => {
    const attaching = readdirSync(SRC)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /document\.body\.(append|appendChild)\(|\?\? document\.body\)/.test(readFileSync(join(SRC, f), "utf8")));
    // tooltip.ts attaches too, but a tooltip takes no clicks (pointer-events: none), so it needs no exemption.
    const covered = new Set([...LAYERS.map((l) => l.owner.split(" ")[0]!), "tooltip.ts"]);
    expect(attaching.filter((f) => !covered.has(f))).toEqual([]);
  });
});
