// ---------------------------------------------------------------------------
// Text contrast, for tests: WCAG 2 ratios over an app's palettes as its
// theme.css declares them, so a palette can't slip below what text needs
// (patterkit design/patterpad-text-contrast-2026-10.md). Each app's suite
// reads its own theme.css through `themePalettes` and holds its text tokens
// to `TEXT_CONTRAST`; the shell's holds its high-contrast block.
//
// Pure: no DOM and no Electron. It reads the convention every palette in the
// family follows (README v0.56): the default palette on `:root`, the others on
// `:root[data-theme="<name>"]`, and the OS-dark fallback on
// `:root:not([data-theme])` inside `@media (prefers-color-scheme: dark)`.
// ---------------------------------------------------------------------------

/** WCAG AA for body text. */
export const TEXT_CONTRAST = 4.5;
/** WCAG AA for an icon or a control's edge (1.4.11). */
export const EDGE_CONTRAST = 3;

/**
 * The high-contrast block in tokens.css (`prefers-contrast: more`), as fractions of `--ink` mixed into `--bg`.
 * The stylesheet can't import these, so the shell's test holds the two together.
 */
export const HIGH_CONTRAST_MIX = { muted: 0.7, line: 0.5, lineSoft: 0.5 } as const;

export type Rgb = readonly [number, number, number];

/** `#rgb` or `#rrggbb` (an alpha is dropped) as 0..1 channels, or null for anything else. */
export function parseHex(value: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG 2 relative luminance. */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear) as unknown as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2 contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function toOklab(rgb: Rgb): Rgb {
  const [r, g, b] = rgb.map(toLinear) as unknown as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, fromLinear(v)))) as unknown as Rgb;
}

/** `color-mix(in oklab, a <p>, b)`, with p a fraction of `a`. */
export function mixOklab(a: Rgb, b: Rgb, p: number): Rgb {
  const A = toOklab(a), B = toOklab(b);
  return fromOklab(A.map((v, i) => v * p + B[i]! * (1 - p)) as unknown as Rgb);
}

/** A palette: each custom property's declared value, by name. */
export type Palette = Readonly<Record<string, string>>;

/**
 * Resolve a token to a colour: a hex value, `var(--x)` (with a fallback), or
 * `color-mix(in oklab, A p%, B)` over those. Null for anything else (a keyword, a colour with transparency
 * mixed in), so a test can say which token it couldn't read.
 */
export function resolveColour(value: string, palette: Palette, depth = 0): Rgb | null {
  if (depth > 12) return null;
  const v = value.trim();
  const hex = parseHex(v);
  if (hex) return hex;
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
  if (ref) {
    const own = palette[ref[1]!];
    if (own !== undefined) return resolveColour(own, palette, depth + 1);
    return ref[2] !== undefined ? resolveColour(ref[2], palette, depth + 1) : null;
  }
  const mix = /^color-mix\(\s*in oklab\s*,(.+)\)$/.exec(v);
  if (mix) {
    const parts = splitTop(mix[1]!);
    if (parts.length !== 2) return null;
    const [a, pa] = colourStop(parts[0]!), [b, pb] = colourStop(parts[1]!);
    const ca = resolveColour(a, palette, depth + 1), cb = resolveColour(b, palette, depth + 1);
    if (!ca || !cb) return null;
    const p = pa ?? (pb !== undefined ? 1 - pb : 0.5);
    return mixOklab(ca, cb, p);
  }
  return null;
}

/** Split on commas outside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((p) => p.trim());
}

/** `A 70%` as A and 0.7; a stop with no percentage has none. */
function colourStop(s: string): [string, number | undefined] {
  const m = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(s.trim());
  return m ? [m[1]!, Number(m[2]) / 100] : [s.trim(), undefined];
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule { selectors: string[]; body: string; media: string | null }

/** The rules of a stylesheet, one level of @media deep, which is all a theme.css uses. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const walk = (text: string, media: string | null): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < text.length && depth > 0) { if (text[j] === "{") depth++; else if (text[j] === "}") depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      const at = head.slice(head.lastIndexOf(";") + 1).trim();
      if (at.startsWith("@media")) walk(body, at);
      else if (!at.startsWith("@")) out.push({ selectors: at.split(",").map((s) => s.trim()), body, media });
      i = j;
    }
  };
  walk(stripComments(css), null);
  return out;
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of splitDecls(body)) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(part);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/** Split declarations on semicolons outside parentheses. */
function splitDecls(body: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (body[i] === ";" && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out;
}

/**
 * Every palette a theme.css declares, its custom properties resolved in cascade order: `default` (bare
 * `:root`), each `data-theme` name over it, and `system-dark` (the OS-dark fallback) when there is one. Rules
 * inside any other @media are left out.
 */
export function themePalettes(css: string): Record<string, Palette> {
  const all = rules(css);
  const names = new Set<string>();
  for (const r of all) for (const s of r.selectors) {
    const m = /^:root\[data-theme="([\w-]+)"\]$/.exec(s);
    if (m) names.add(m[1]!);
  }
  const darkMedia = (m: string | null): boolean => m !== null && /prefers-color-scheme:\s*dark/.test(m);
  const build = (applies: (r: Rule) => boolean): Palette => {
    const out: Record<string, string> = {};
    for (const r of all) if (applies(r)) Object.assign(out, declarations(r.body));
    return out;
  };
  const bare = (r: Rule): boolean => r.media === null && r.selectors.includes(":root");
  const result: Record<string, Palette> = { default: build(bare) };
  for (const name of names) {
    result[name] = build((r) => bare(r) || (r.media === null && r.selectors.includes(`:root[data-theme="${name}"]`)));
  }
  if (all.some((r) => darkMedia(r.media) && r.selectors.includes(":root:not([data-theme])"))) {
    result["system-dark"] = build((r) => bare(r) || (darkMedia(r.media) && r.selectors.includes(":root:not([data-theme])")));
  }
  return result;
}

/** One failure: a token on a ground below what it needs. */
export interface ContrastShortfall { palette: string; token: string; ground: string; ratio: number; needs: number }

/**
 * Each `tokens` × `grounds` pair, in every palette, below `needs`. A token or ground a palette doesn't declare
 * (or that can't be resolved) is skipped; `unresolved` lists those so a test can refuse silence.
 */
export function contrastShortfalls(
  palettes: Record<string, Palette>, tokens: readonly string[], grounds: readonly string[], needs: number,
): { shortfalls: ContrastShortfall[]; unresolved: string[] } {
  const shortfalls: ContrastShortfall[] = [];
  const unresolved: string[] = [];
  for (const [palette, p] of Object.entries(palettes)) {
    for (const token of tokens) {
      const fg = p[token] !== undefined ? resolveColour(p[token]!, p) : null;
      if (!fg) { unresolved.push(`${palette} ${token}`); continue; }
      for (const ground of grounds) {
        if (p[ground] === undefined) continue;
        const bg = resolveColour(p[ground]!, p);
        if (!bg) { unresolved.push(`${palette} ${ground}`); continue; }
        const ratio = contrastRatio(fg, bg);
        if (ratio < needs) shortfalls.push({ palette, token, ground, ratio: Math.round(ratio * 100) / 100, needs });
      }
    }
  }
  return { shortfalls, unresolved };
}

/** A palette as the high-contrast block leaves it: `--muted`, `--line` and `--line-soft` mixed from ink. */
export function withHighContrast(p: Palette): Palette {
  const pct = (f: number): string => `${Math.round(f * 100)}%`;
  return {
    ...p,
    "--muted": `color-mix(in oklab, var(--ink) ${pct(HIGH_CONTRAST_MIX.muted)}, var(--bg))`,
    "--line": `color-mix(in oklab, var(--ink) ${pct(HIGH_CONTRAST_MIX.line)}, var(--bg))`,
    "--line-soft": `color-mix(in oklab, var(--ink) ${pct(HIGH_CONTRAST_MIX.lineSoft)}, var(--bg))`,
  };
}
