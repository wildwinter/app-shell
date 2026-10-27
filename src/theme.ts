// ---------------------------------------------------------------------------
// The family's colour themes, as data: the ids palette.css answers to, the
// words a menu shows for them, and the way a stored choice from before the
// one family palette (2026-10-27) finds its new home.
//
// Pure: no DOM and no Electron, so a main process (the store, the menu) and a
// renderer (the root attribute) read the same list. Before this each app kept
// its own: Patterpad's ColourTheme and Storyletter's ThemeChoice.
// ---------------------------------------------------------------------------

/** A palette in palette.css, by its `data-theme` value. */
export type ThemeId = "light" | "dark" | "parchment";

/** What the author chose: a palette, or "system" to follow the OS (Light or Dark). */
export type ThemeChoice = "system" | ThemeId;

/** Every choice with its label, in menu order. The labels are the platform's own words. */
export const THEME_CHOICES: ReadonlyArray<readonly [ThemeChoice, string]> = [
  ["system", "Follow System"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["parchment", "Parchment"],
];

/** A choice nobody has made yet. */
export const DEFAULT_THEME: ThemeChoice = "system";

/**
 * The retired ids and where each goes. The light palettes become Light and the dark ones Dark, Paper included:
 * the point of the change is the whiter look, so anyone on the old default lands on the new one, and Parchment is
 * one click away. Patterpad's earlier "sepia" (once Mist) goes the same way.
 */
const RETIRED: Readonly<Record<string, ThemeId>> = {
  paper: "light", mist: "light", sepia: "light", chambray: "light", linen: "light",
  night: "dark", slate: "dark", indigo: "dark", baize: "dark",
};

/** True for a choice this version understands. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && THEME_CHOICES.some(([id]) => id === value);
}

/** A stored choice, from any version of either app, as a choice this version understands. */
export function migrateTheme(stored: unknown): ThemeChoice {
  if (isThemeChoice(stored)) return stored;
  if (typeof stored === "string" && Object.hasOwn(RETIRED, stored)) return RETIRED[stored]!;
  return DEFAULT_THEME;
}

/** The root's `data-theme` value for a choice: none for "system", so palette.css follows the OS. */
export function themeAttribute(choice: ThemeChoice): ThemeId | null {
  return choice === "system" ? null : choice;
}
