// The family palette (palette.css): every palette theme.ts names is there, Follow System's dark mirrors Dark, and
// every text token passes AA on every tier, a selected row included. Under Increase Contrast the greys and edges
// rise as tokens.css promises (contrast.test.ts holds the block itself).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDGE_CONTRAST, TEXT_CONTRAST, contrastShortfalls, themePalettes, withHighContrast, type Palette,
} from "../src/contrast.js";
import { THEME_CHOICES } from "../src/theme.js";

const css = readFileSync(join(process.cwd(), "src/palette.css"), "utf8");
const palettes = themePalettes(css);
const GROUNDS = ["--bg", "--surface", "--card"];
const TEXT = ["--ink", "--ink-read", "--ink-soft", "--muted", "--danger", "--warn", "--ok", "--accent"];
const CHARS = Array.from({ length: 12 }, (_, i) => `--char-${i}`);
const fmt = (s: { palette: string; token: string; ground: string; ratio: number }): string =>
  `${s.palette} ${s.token} on ${s.ground}: ${s.ratio}`;

/** A palette with a selected row's fill laid over each ground, as `--sel-<ground>`. */
const withSelection = (p: Palette): Palette => ({
  ...p,
  ...Object.fromEntries(GROUNDS.map((g) => [`--sel${g.slice(1)}`, `color-mix(in oklab, var(--ink) 7%, var(${g}))`])),
});

describe("the family palette", () => {
  it("declares Light (the bare root), Dark, Parchment and the OS-dark fallback, and nothing else", () => {
    const ids = THEME_CHOICES.map(([id]) => id).filter((id) => id !== "system");
    expect(Object.keys(palettes).sort()).toEqual(["default", ...ids, "system-dark"].sort());
  });

  it("gives every palette block a colour scheme", () => {
    expect(palettes["light"]!["--color-scheme"]).toBe("light");
    expect(palettes["parchment"]!["--color-scheme"]).toBe("light");
    expect(palettes["dark"]!["--color-scheme"]).toBe("dark");
    expect(palettes["system-dark"]!["--color-scheme"]).toBe("dark");
  });

  it("keeps Follow System's dark equal to Dark", () => {
    expect(palettes["system-dark"]).toEqual(palettes["dark"]);
  });

  it("resolves every text token and every character slot in every palette", () => {
    expect(contrastShortfalls(palettes, [...TEXT, ...CHARS], GROUNDS, TEXT_CONTRAST).unresolved).toEqual([]);
  });

  it("passes AA for every text token on every tier", () => {
    expect(contrastShortfalls(palettes, TEXT, GROUNDS, TEXT_CONTRAST).shortfalls.map(fmt)).toEqual([]);
  });

  it("passes AA for every character slot on the panes and the page, where names are set", () => {
    expect(contrastShortfalls(palettes, CHARS, ["--surface", "--card"], TEXT_CONTRAST).shortfalls.map(fmt)).toEqual([]);
  });

  it("keeps a selected row's text at AA on every tier", () => {
    const sel = Object.fromEntries(Object.entries(palettes).map(([n, p]) => [n, withSelection(p)]));
    const grounds = GROUNDS.map((g) => `--sel${g.slice(1)}`);
    expect(contrastShortfalls(sel, ["--ink", "--muted"], grounds, TEXT_CONTRAST).shortfalls.map(fmt)).toEqual([]);
  });

  it("puts the label on a primary button at AA", () => {
    expect(contrastShortfalls(palettes, ["--on-accent"], ["--accent"], TEXT_CONTRAST).shortfalls.map(fmt)).toEqual([]);
  });

  it("under Increase Contrast, grey text reaches 5:1 and edges 3:1", () => {
    const high = Object.fromEntries(Object.entries(palettes).map(([n, p]) => [n, withHighContrast(p)]));
    expect(contrastShortfalls(high, ["--muted"], GROUNDS, 5).shortfalls.map(fmt)).toEqual([]);
    expect(contrastShortfalls(high, ["--line"], GROUNDS, EDGE_CONTRAST).shortfalls.map(fmt)).toEqual([]);
  });

  it("sets colours only through the palette blocks, never a stray literal outside them", () => {
    // Every rule in the file is a palette block or the antialiasing note for the dark ones.
    const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim());
    for (const s of selectors) expect(s).toMatch(/^(:root(\[data-theme="[a-z]+"\])?|@media \(prefers-color-scheme: dark\)|:root:not\(\[data-theme\]\))$/);
  });
});
