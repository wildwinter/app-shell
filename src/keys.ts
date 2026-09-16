// ---------------------------------------------------------------------------
// Keyboard hints, platform-true, from ONE helper.
//
// "One casing rule, and platform-true key hints" (design-language.md section
// 4, 2026-09-16): a hint writes "⌘" on macOS and "Ctrl" elsewhere, and "⌘"
// never appears in a hard-coded string. Before this module the family had four
// notations for one idea (ui-review-2026-09, finding 26): a <kbd> here, "(⌘1)"
// in a tooltip there, a platform fork in one label, and "↑↓ move · ↵ jump ·
// esc to close" typed into a hint bar, which on Windows showed a Mac glyph.
//
// The input is the portable spelling every caller already knows from the menu
// spine: "Mod+1", "Mod+Shift+M", "Enter", "Esc", "Up". The output is what the
// platform writes: "⌘1" / "⇧⌘M" / "↩" / "esc" on a Mac, in Apple's modifier
// order and with no joiner; "Ctrl+1" / "Ctrl+Shift+M" / "Enter" / "Esc"
// everywhere else. A hint is DOM (`keyHint`, `hintBar`): a keycap element,
// never a glyph string, and a tooltip gets its bracketed key from
// `tipWithKey` so it is right on both platforms.
// ---------------------------------------------------------------------------

export type KeyPlatform = "mac" | "win" | "linux";

let override: KeyPlatform | undefined;

/** Pin the platform every helper here renders for (undefined = detect again).
 *  A seam for the tests and for a preview harness; an app leaves it unset. */
export function setKeyPlatform(platform?: KeyPlatform): void { override = platform; }

/** The platform the hints render for: the override, else the browser's, else
 *  the process's, else "linux" (which draws the same as "win"). */
export function keyPlatform(): KeyPlatform {
  if (override) return override;
  if (typeof navigator !== "undefined") {
    const s = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
    if (/mac|iphone|ipad/i.test(s)) return "mac";
    if (/win/i.test(s)) return "win";
    if (s.trim()) return "linux";
  }
  const p = typeof process !== "undefined" ? process.platform : undefined;
  return p === "darwin" ? "mac" : p === "win32" ? "win" : "linux";
}

/** Canonical modifier words, in the order each platform writes them. Apple
 *  puts them ⌃ ⌥ ⇧ ⌘ before the key; Windows and Linux write Ctrl+Alt+Shift. */
type Modifier = "ctrl" | "alt" | "shift" | "mod";
const MAC_ORDER: Modifier[] = ["ctrl", "alt", "shift", "mod"];
const OTHER_ORDER: Modifier[] = ["mod", "ctrl", "alt", "shift"];
const MAC_MOD: Record<Modifier, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", mod: "⌘" };
const OTHER_MOD: Record<Modifier, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", mod: "Ctrl" };

const MODIFIER_ALIASES: Record<string, Modifier> = {
  mod: "mod", cmd: "mod", command: "mod", meta: "mod", super: "mod",
  ctrl: "ctrl", control: "ctrl",
  alt: "alt", option: "alt", opt: "alt",
  shift: "shift",
};

/** Named keys: the Mac legend and the spelled-out word the others use. */
const NAMED: Record<string, { mac: string; other: string }> = {
  enter: { mac: "↩", other: "Enter" }, return: { mac: "↩", other: "Enter" },
  esc: { mac: "esc", other: "Esc" }, escape: { mac: "esc", other: "Esc" },
  up: { mac: "↑", other: "Up" }, down: { mac: "↓", other: "Down" },
  left: { mac: "←", other: "Left" }, right: { mac: "→", other: "Right" },
  backspace: { mac: "⌫", other: "Backspace" }, delete: { mac: "⌦", other: "Del" }, del: { mac: "⌦", other: "Del" },
  tab: { mac: "⇥", other: "Tab" }, space: { mac: "Space", other: "Space" },
  home: { mac: "↖", other: "Home" }, end: { mac: "↘", other: "End" },
  pageup: { mac: "⇞", other: "PgUp" }, pagedown: { mac: "⇟", other: "PgDn" },
};

interface Parsed { mods: Modifier[]; key: string | undefined }

/** Split "Mod+Shift+M" into its modifiers and its key. A literal "+" key is
 *  written "Mod++" (the last empty part). Case is ignored on the words. */
function parse(combo: string): Parsed {
  const parts = combo.split("+");
  const mods: Modifier[] = [];
  let key: string | undefined;
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i] ?? "";
    if (raw === "" && i > 0) { key = "+"; continue; }
    const mod = MODIFIER_ALIASES[raw.toLowerCase()];
    if (mod) { if (!mods.includes(mod)) mods.push(mod); continue; }
    key = raw;
  }
  return { mods, key };
}

function keyLegend(key: string, mac: boolean): string {
  const named = NAMED[key.toLowerCase()];
  if (named) return mac ? named.mac : named.other;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** The platform's spelling of a combo as one string: "⇧⌘M" on a Mac,
 *  "Ctrl+Shift+M" elsewhere. For a tooltip or a menu label; a visible hint in
 *  a window is `keyHint` (a keycap), not this. */
export function keyLabel(combo: string, platform: KeyPlatform = keyPlatform()): string {
  const mac = platform === "mac";
  const { mods, key } = parse(combo);
  const order = mac ? MAC_ORDER : OTHER_ORDER;
  const words = order.filter((m) => mods.includes(m)).map((m) => (mac ? MAC_MOD : OTHER_MOD)[m]);
  // On Windows "Mod" and "Ctrl" are both Ctrl; say it once.
  const seen = new Set<string>();
  const modWords = words.filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
  const legend = key === undefined ? [] : [keyLegend(key, mac)];
  return mac ? [...modWords, ...legend].join("") : [...modWords, ...legend].join("+");
}

/** The legends of a combo as the platform would draw them on keycaps: one
 *  entry on a Mac (Apple's glyph string is one legend), one per key elsewhere. */
export function keyLegends(combo: string, platform: KeyPlatform = keyPlatform()): string[] {
  if (platform === "mac") return [keyLabel(combo, platform)];
  const { mods, key } = parse(combo);
  const seen = new Set<string>();
  const words = OTHER_ORDER.filter((m) => mods.includes(m)).map((m) => OTHER_MOD[m])
    .filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
  return key === undefined ? words : [...words, keyLegend(key, false)];
}

export interface KeyHintOptions {
  /** Render for this platform rather than the detected one. */
  platform?: KeyPlatform;
}

function chip(legend: string): HTMLElement {
  const k = document.createElement("kbd");
  k.className = "shell-kbd";
  k.textContent = legend;
  return k;
}

/**
 * A keycap for `combo`: `<kbd class="shell-kbd">` (keys.css). On a Mac one
 * chip carrying the glyph string ("⇧⌘M"); elsewhere one chip per key
 * ("Ctrl" "Shift" "M") side by side in a `<span class="shell-keys">`, with no
 * typed joiner: keycaps beside each other read as "together". `combo` may
 * also list ALTERNATIVES separated by spaces ("Up Down" for a move hint),
 * each drawn as its own keycap.
 */
export function keyHint(combo: string, opts: KeyHintOptions = {}): HTMLElement {
  const platform = opts.platform ?? keyPlatform();
  const legends = combo.trim().split(/\s+/).flatMap((c) => keyLegends(c, platform));
  if (legends.length === 1) return chip(legends[0]!);
  const group = document.createElement("span");
  group.className = "shell-keys";
  for (const legend of legends) group.append(chip(legend));
  return group;
}

export interface HintBarItem {
  /** A combo, or space-separated alternatives ("Up Down"). */
  keys: string;
  /** What the key does, as a sentence-case fragment ("Move", "Jump"). */
  label: string;
}

/**
 * The hint bar under a picker or a tool window ("↑↓ move · ↵ jump · esc
 * close" as it used to be typed): one `<div class="shell-hintbar">` of
 * `<span class="shell-hint">` items, each a keycap (`keyHint`) and a label,
 * spaced by CSS and separated by nothing typed at all.
 */
export function hintBar(items: HintBarItem[], opts: KeyHintOptions = {}): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "shell-hintbar";
  for (const item of items) {
    const hint = document.createElement("span");
    hint.className = "shell-hint";
    const label = document.createElement("span");
    label.className = "shell-hint-label";
    label.textContent = item.label;
    hint.append(keyHint(item.keys, opts), label);
    bar.append(hint);
  }
  return bar;
}

/** Tooltip text with its key in brackets, platform-true: `tipWithKey("Show
 *  scenes", "Mod+1")` is "Show scenes (⌘1)" on a Mac and "Show scenes
 *  (Ctrl+1)" elsewhere. For `data-tip` and `PaneSideConfig.shortcutHint`. */
export function tipWithKey(text: string, combo: string, platform: KeyPlatform = keyPlatform()): string {
  return `${text} (${keyLabel(combo, platform)})`;
}
