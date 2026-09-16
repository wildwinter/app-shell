// The chrome scale: every size in the shell's stylesheets is a pixel value off
// the 14px base ("Chrome has its own scale", design-language.md section 4). A
// `rem` in a chrome rule would move with the app's reading root, which is the
// 7 to 10 percent drift the family review measured in Patterpad.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const sheets = readdirSync(SRC).filter((f) => f.endsWith(".css"));
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (f: string): string => readFileSync(join(SRC, f), "utf8");

describe("the chrome scale", () => {
  it("has no rem-sized rule in any shell stylesheet", () => {
    expect(sheets.length).toBeGreaterThan(20);
    const offenders: string[] = [];
    for (const f of sheets) {
      stripComments(read(f)).split("\n").forEach((line, i) => {
        if (/\d(\.\d+)?rem\b/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("names the base as a documented token and sets it on the three chrome roots", () => {
    const tokens = read("tokens.css");
    expect(tokens).toMatch(/--chrome-size:\s*14px/);
    expect(tokens).toContain("Chrome is sized in px off a 14px base; the reading surface alone");
    const rule = (css: string, selector: string): string => {
      const m = new RegExp(`${selector.replace(/[.\-]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(stripComments(css));
      return m?.[1] ?? "";
    };
    expect(rule(read("dialog.css"), ".shell-dialog")).toContain("font-size: var(--chrome-size)");
    expect(rule(read("pane-shell.css"), ".pane-shell")).toContain("font-size: var(--chrome-size)");
    expect(rule(read("tool-window.css"), ".swin-head")).toContain("font-size: var(--chrome-size)");
  });

  it("sizes the panes in pixels: 224 and 384", () => {
    const css = stripComments(read("pane-shell.css"));
    expect(css).toMatch(/--nav-open-w:\s*224px/);
    expect(css).toMatch(/--insp-open-w:\s*384px/);
  });

  it("keeps the shell's reference sizes where Storyletter rendered them", () => {
    // A spot check of the conversion (rem x 16 to the nearest half pixel).
    const controls = stripComments(read("controls.css"));
    expect(controls).toMatch(/\.btn \{[^}]*font: 600 12\.5px var\(--font-ui\)/);
    expect(controls).toMatch(/\.btn\.icon \{[^}]*width: 28px; height: 28px/);
    expect(stripComments(read("tokens.css"))).toMatch(/\.overline \{ font: 600 10\.5px\/1/);
    expect(stripComments(read("tooltip.css"))).toContain("max-width: 352px");
  });
});
