// The family's theme ids (theme.ts): the menu's order and words, and every retired id from either app landing on
// its new palette.
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_CHOICES, isThemeChoice, migrateTheme, themeAttribute } from "../src/theme.js";

describe("theme choices", () => {
  it("lists Follow System first, then Light, Dark and Parchment", () => {
    expect(THEME_CHOICES.map(([, label]) => label)).toEqual(["Follow System", "Light", "Dark", "Parchment"]);
    expect(DEFAULT_THEME).toBe("system");
  });

  it("knows its own ids and nothing else", () => {
    for (const [id] of THEME_CHOICES) expect(isThemeChoice(id)).toBe(true);
    for (const v of ["paper", "night", "", null, undefined, 3, "Light"]) expect(isThemeChoice(v)).toBe(false);
  });
});

describe("migrateTheme", () => {
  it("keeps a current choice", () => {
    for (const [id] of THEME_CHOICES) expect(migrateTheme(id)).toBe(id);
  });

  it("moves Patterpad's retired palettes: Paper and Mist to Light, Night and Slate to Dark", () => {
    expect(["paper", "mist", "sepia"].map(migrateTheme)).toEqual(["light", "light", "light"]);
    expect(["night", "slate"].map(migrateTheme)).toEqual(["dark", "dark"]);
  });

  it("moves Storyletter's: Chambray and Linen to Light, Indigo and Baize to Dark", () => {
    expect(["chambray", "linen"].map(migrateTheme)).toEqual(["light", "light"]);
    expect(["indigo", "baize"].map(migrateTheme)).toEqual(["dark", "dark"]);
  });

  it("falls back to Follow System for anything it can't read", () => {
    for (const v of [undefined, null, "", "toString", "neon", 7, {}]) expect(migrateTheme(v)).toBe("system");
  });
});

describe("themeAttribute", () => {
  it("is the id for a palette and none for Follow System", () => {
    expect(themeAttribute("system")).toBeNull();
    expect(themeAttribute("parchment")).toBe("parchment");
  });
});
