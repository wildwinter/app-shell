// A dialog's own width always beats the frame's default, whatever order the stylesheets load in.
//
// Each dialog sets its width as a custom property on its content class (`.kit-gallery { --dialog-width:
// 880px }`), on the same element as the frame's `.shell-dialog`. At equal weight the sheet loaded last
// wins, and a bundler is free to reorder sheets: Patterpad 0.24's build moved dialog.css into a chunk
// loaded after the app's own CSS, and New Project opened at the frame's 420px instead of 880px
// (2026-10-06). The frame's default therefore sits inside :where(), which weighs nothing.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const css = (file: string): string => readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** Every rule in a sheet that sets --dialog-width, as [selector, body]. */
const widthRules = (file: string): string[] =>
  (css(file).match(/[^{}]+\{[^{}]*--dialog-width\s*:[^{}]*\}/g) ?? []).map((r) => r.slice(0, r.indexOf("{")).trim());

describe("dialog widths", () => {
  it("sets the frame's default at zero weight, so it never beats a dialog's own", () => {
    expect(widthRules("dialog.css")).toEqual([":where(.shell-dialog)"]);
  });

  it("has every dialog that sets its own width do it with a plain class, which outweighs the default", () => {
    const sheets = readdirSync(SRC).filter((f) => f.endsWith(".css") && f !== "dialog.css");
    const selectors = sheets.flatMap(widthRules);
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) expect(sel).toMatch(/^\.[a-z][a-z0-9-]*$/);
  });
});
