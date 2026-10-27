// Text contrast (contrast.ts): the WCAG maths against known values, theme.css read in cascade order, and the
// high-contrast block in tokens.css held to HIGH_CONTRAST_MIX and to the ratios it promises.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDGE_CONTRAST, HIGH_CONTRAST_MIX, TEXT_CONTRAST, contrastRatio, contrastShortfalls, parseHex, resolveColour,
  themePalettes, withHighContrast,
} from "../src/contrast.js";

const hex = (h: string) => parseHex(h)!;
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("contrastRatio", () => {
  it("is 21 for black on white, 1 for a colour on itself, and matches WCAG's worked values", () => {
    expect(contrastRatio(hex("#000"), hex("#fff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(hex("#777777"), hex("#777777"))).toBe(1);
    expect(contrastRatio(hex("#767676"), hex("#ffffff"))).toBeCloseTo(4.54, 2);
  });
});

describe("resolveColour", () => {
  it("reads hex, var() with a fallback, and color-mix in oklab", () => {
    const p = { "--ink": "#000000", "--bg": "#ffffff", "--soft": "color-mix(in oklab, var(--ink) 100%, var(--bg))" };
    expect(resolveColour("var(--ink)", p)).toEqual([0, 0, 0]);
    expect(resolveColour("var(--nope, var(--bg))", p)).toEqual([1, 1, 1]);
    expect(resolveColour("var(--soft)", p)).toEqual([0, 0, 0]);
    const mid = resolveColour("color-mix(in oklab, var(--ink) 50%, var(--bg))", p)!;
    expect(mid[0]).toBeGreaterThan(0.3);
    expect(mid[0]).toBeLessThan(0.5);
    expect(resolveColour("transparent", p)).toBeNull();
  });
});

describe("themePalettes", () => {
  const css = `@import "x.css";
:root { --bg: #ffffff; --ink: #000000; --muted: #999999; /* a comment; with a semicolon */ }
:root[data-theme="paper"] { --color-scheme: light; }
:root[data-theme="night"], :root[data-theme="slate"] { --bg: #111111; --ink: #eeeeee; }
:root[data-theme="slate"] { --muted: #888888; }
@media (prefers-color-scheme: dark) { :root:not([data-theme]) { --bg: #111111; --ink: #eeeeee; } }
@media (prefers-contrast: more) { :root { --muted: #000000; } }`;
  it("builds each palette over :root in cascade order, with the OS dark, and ignores other media", () => {
    const p = themePalettes(css);
    expect(Object.keys(p).sort()).toEqual(["default", "night", "paper", "slate", "system-dark"]);
    expect(p["default"]).toEqual({ "--bg": "#ffffff", "--ink": "#000000", "--muted": "#999999" });
    expect(p["slate"]).toMatchObject({ "--bg": "#111111", "--muted": "#888888" });
    expect(p["night"]!["--muted"]).toBe("#999999");
    expect(p["system-dark"]).toMatchObject({ "--bg": "#111111", "--muted": "#999999" });
  });

  it("reads the built file's unquoted selectors the same as the source's quoted ones", () => {
    // The bundler drops the quotes from palette.css (`[data-theme=dark]`), and the apps' tests read the built file.
    expect(themePalettes(css.replace(/\[data-theme="([\w-]+)"\]/g, "[data-theme=$1]"))).toEqual(themePalettes(css));
  });
  it("finds shortfalls, and says what it couldn't read", () => {
    const { shortfalls, unresolved } = contrastShortfalls(themePalettes(css), ["--muted", "--nope"], ["--bg"], TEXT_CONTRAST);
    expect(shortfalls.map((s) => s.palette).sort()).toEqual(["default", "paper"]); // #999 passes on the dark grounds
    expect(unresolved).toContain("default --nope");
  });
});

describe("the high-contrast block", () => {
  const tokens = stripComments(readFileSync(join(process.cwd(), "src/tokens.css"), "utf8"));
  const block = /@media \(prefers-contrast: more\)\s*\{\s*:root:root:root\s*\{([^}]*)\}\s*\}/.exec(tokens);

  it("is in tokens.css, outranking every palette block, with HIGH_CONTRAST_MIX's mixes", () => {
    expect(block).not.toBeNull();
    const pct = (f: number): string => `${Math.round(f * 100)}%`;
    expect(block![1]).toContain(`--muted: color-mix(in oklab, var(--ink) ${pct(HIGH_CONTRAST_MIX.muted)}, var(--bg));`);
    expect(block![1]).toContain(`--line: color-mix(in oklab, var(--ink) ${pct(HIGH_CONTRAST_MIX.line)}, var(--bg));`);
    expect(block![1]).toContain(`--line-soft: color-mix(in oklab, var(--ink) ${pct(HIGH_CONTRAST_MIX.lineSoft)}, var(--bg));`);
  });

  it("lifts even a faint palette to AA text and visible edges", () => {
    const faint = { default: withHighContrast({ "--bg": "#f1ebe0", "--surface": "#fbf7f0", "--ink": "#312b22", "--muted": "#d0c8bc", "--line": "#efe9de" }) };
    expect(contrastShortfalls(faint, ["--muted"], ["--bg", "--surface"], TEXT_CONTRAST).shortfalls).toEqual([]);
    expect(contrastShortfalls(faint, ["--line"], ["--bg", "--surface"], EDGE_CONTRAST).shortfalls).toEqual([]);
  });
});
