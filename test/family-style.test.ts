// The family style, held as a source scan over the shell (design-language.md section 4: "Icons are
// drawn, and so are separators", "Captions are words, not overlines", "Chrome has its own scale",
// "One casing rule, and platform-true key hints"; copy-house-style.md rules 3, 16, 27 and 33).
// icons.test.ts holds the vocabulary by behaviour and chrome-scale.test.ts the stylesheets' units;
// this file holds the strings and the remaining CSS habits the same way Storyletter's and
// Patterpad's scans do, by reading the source, because a new `"✕"` is one token in one file.
//
// Every rule carries two lists. ALLOWED is the true exceptions, each with the reason it is one.
// PENDING is what the tree still does today that the rule says it should not: the entries are pinned
// exactly, so a new hit fails the run, and a retired one fails it too until its entry is removed
// (the list can only shrink). A rule with an empty PENDING is simply held.
//
// Comments are blanked before scanning, so a comment may still say "·" to explain why the code
// beneath it no longer does.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/** Blank a span but keep its newlines, so line numbers survive. */
const blank = (m: string): string => m.replace(/[^\n]/g, " ");
const withoutComments = (src: string, css: boolean): string => {
  const out = src.replace(/\/\*[\s\S]*?\*\//g, blank);
  return css ? out : out.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_m, lead: string) => lead);
};

interface Source { file: string; css: boolean; lines: string[]; text: string }
const sources: Source[] = readdirSync(SRC).filter((f) => /\.(ts|css)$/.test(f) && !f.endsWith(".d.ts")).map((file) => {
  const css = file.endsWith(".css");
  const text = withoutComments(readFileSync(join(SRC, file), "utf8"), css);
  return { file, css, lines: text.split("\n"), text };
});

interface Hit { file: string; line: number; key: string }
/** An allow-list or pending entry: the file, what the hit's key must contain (a substring or a
 *  RegExp), how many hits it accounts for (default 1), and why. */
interface Entry { file: string; match: string | RegExp; count?: number; why: string }

const fmt = (h: Hit): string => `${h.file}:${h.line}: ${h.key.trim().slice(0, 100)}`;
const matches = (m: string | RegExp, key: string): boolean => (typeof m === "string" ? key.includes(m) : m.test(key));

/** Hold a rule: every hit is either explained by ALLOWED, pinned by PENDING, or a failure; and every
 *  entry in either list must still explain something, or it is stale and the run fails until it goes. */
function hold(rule: string, hits: Hit[], allowed: Entry[], pending: Entry[]): void {
  let remaining = hits;
  const stale: string[] = [];
  for (const entry of [...allowed, ...pending]) {
    const taken = remaining.filter((h) => h.file === entry.file && matches(entry.match, h.key));
    const want = entry.count ?? 1;
    if (taken.length !== want) stale.push(`${entry.file} ${String(entry.match)}: expected ${want} hit(s), found ${taken.length}`);
    remaining = remaining.filter((h) => !taken.includes(h));
  }
  expect(remaining.map(fmt), `${rule}: not on either list`).toEqual([]);
  expect(stale, `${rule}: entries that no longer match what they were written for (remove or recount them)`).toEqual([]);
}

const lineHits = (re: RegExp, css = false): Hit[] =>
  sources.filter((s) => s.css === css).flatMap((s) =>
    s.lines.flatMap((line, i) => (re.test(line) ? [{ file: s.file, line: i + 1, key: line }] : [])));

/** Every `selector { body }` in the stylesheets whose body satisfies `test`; the key is the selector. */
const blockHits = (test: (selector: string, body: string) => boolean): Hit[] =>
  sources.filter((s) => s.css).flatMap((s) => {
    const out: Hit[] = [];
    for (const m of s.text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1]!.split(";").pop()!.trim().replace(/\s+/g, " ");
      if (!test(selector, m[2]!)) continue;
      out.push({ file: s.file, line: s.text.slice(0, m.index! + m[1]!.length).split("\n").length, key: selector });
    }
    return out;
  });

describe("family style: the scan", () => {
  it("finds the sources at all (the scan is the test's own load-bearing part)", () => {
    expect(sources.filter((s) => s.css).length).toBeGreaterThan(20);
    expect(sources.filter((s) => !s.css).length).toBeGreaterThan(30);
  });
});

describe("family style: icons are drawn", () => {
  // The deprecated glyph table's characters, plus the multiplication sign, the warning sign and the
  // anticlockwise arrow the apps typed beside them, the option diamond and the gear. The command
  // ellipsis ("Open…") is not in the class: the platform expects it. A "▸" between a word and a
  // capitalised word is a menu path in copy (copy-house-style.md rule 16) and is stripped first.
  const GLYPH = /[✕⋯▸▾‹›↑↓✓⊘○✎●‼▶⟲▦☰◈⠿❝×⚠↺◇◆⚙]/;
  const withoutMenuPaths = (line: string): string => line.replace(/(?<=[\w…&] )▸(?= [A-Z])/g, "");

  it("types no icon glyph into a string the shell shows", () => {
    const hits = lineHits(GLYPH).filter((h) => GLYPH.test(withoutMenuPaths(h.key)));
    hold("typed icon glyph", hits, [
      { file: "icons.ts", match: /^\s*\w+: "[^"]"/, count: 24, why: "the deprecated glyph table `icon`: the one place the old characters are written, so iconNameOfGlyph can map an app that still types them onto the drawn word (icons.test.ts pins the table byte for byte)" },
      { file: "keys.ts", match: /up: \{ mac: "↑", other: "Up" \}/, why: "the keycap legends: a legend INSIDE a drawn kbd is the platform's own spelling of the key, which is what keyLabel exists to write" },
    ], []);
  });

  it("draws nothing from a symbol font in CSS content either", () => {
    const CONTENT = /(^|[;{\s])content:\s*["'][^"']*([^\x20-\x7e]|\\[0-9a-f]{2,6})/i;
    hold("glyph in CSS content", lineHits(CONTENT, true), [], []);
  });
});

describe("family style: separators and key hints are drawn", () => {
  const TYPED: [RegExp, string][] = [
    [/ · /, "a middle-dot separator (use metaLine)"],
    [/ › /, "a typed chevron trail (use breadcrumb)"],
    [/↑↓|↵|\(↑\)|\(↓\)/, "a typed key glyph (use keyHint / tipWithKey)"],
    [/→/, "a typed arrow (use iconNode(\"arrowRight\"))"],
    [/\((Esc|Enter|Home|F\d{1,2}|Shift\+F\d{1,2})\)/, "a key typed into a tooltip (use tipWithKey)"],
  ];

  it("types no separator or key notation into a string", () => {
    const hits = TYPED.flatMap(([re, why]) => lineHits(re).map((h) => ({ ...h, key: `${h.key}  [${why}]` })));
    hold("typed separator", hits, [
      { file: "keys.ts", match: /right: \{ mac: "→", other: "Right" \}/, why: "the keycap legends again: the arrow is the Mac's own spelling of the key inside a drawn kbd, which keyLabel exists to write" },
      { file: "tool-window-web.ts", match: /tip: "Close \(Esc\)"/, why: "the tool window's close tooltip: Esc has no platform spelling, so tipWithKey would write exactly this, and copy-house-style.md rule 27 spells the fragment this way" },
    ], []);
  });

  it("hard-codes no modifier outside the one helper that writes it", () => {
    hold("typed modifier", lineHits(/Cmd\+|⌘/), [
      { file: "keys.ts", match: /const MAC_MOD/, why: "the helper itself: the one table that spells ⌘ on macOS, which every key hint in the family goes through" },
      { file: "menu.ts", match: /acceleratorMac: "(Ctrl\+)?Cmd\+/, count: 3, why: "Electron accelerator syntax for the native menu spine; the OS draws the menu's own symbols from it, and the string is never shown as text" },
    ], []);
  });
});

describe("family style: tooltips go through the shell", () => {
  // A native `title` is the OS's own tooltip: a different face, a different delay, no keycap, and on
  // Windows a yellow box. The shell's tooltip (data-tip, `tip` on el()) is the family's one tooltip.
  const TITLE = /\.title\s*=[^=]|setAttribute\(\s*["']title["']|\btitle="/;

  it("sets no native title tooltip", () => {
    hold("native title", lineHits(TITLE), [
      { file: "dom.ts", match: /node\.title = props\.title/, why: "el()'s passthrough for an app that asks for a native title by name; the helper types none itself, and `tip` beside it is the shell's own" },
    ], [
      { file: "property-name-field.ts", match: /input\.title = /, count: 4, why: "the illegal-name reason and the hint ride the field's native title (Patterpad's settings gate reads `bad.title` back for its message); the family form is a data attribute plus the shell tooltip" },
    ]);
  });
});

describe("family style: no dashes in strings", () => {
  it("types no em-dash or en-dash", () => {
    hold("dash", [...lineHits(/[—–]/), ...lineHits(/[—–]/, true)], [], []);
  });
});

describe("family style: the stylesheets", () => {
  it("tracks no uppercase caption outside .overline (table heads and cues)", () => {
    const hits = blockHits((_sel, body) => /text-transform:\s*uppercase/.test(body) && /letter-spacing/.test(body));
    hold("tracked uppercase caption", hits, [
      { file: "tokens.css", match: /^\.overline$/, why: "the one utility the family keeps for table column heads and screenplay cues, demoted from a default in Track C" },
    ], []);
  });

  it("scales nothing on hover (motion is for structural change)", () => {
    const hits = blockHits((sel, body) => sel.includes(":hover") && /transform\s*:/.test(body));
    hold("hover transform", hits, [], []);
  });

  it("removes no outline without drawing a replacement in the same rule", () => {
    const hits = blockHits((_sel, body) => /outline:\s*(none|0)\b/.test(body) && !/border|box-shadow|background/.test(body));
    hold("outline: none", hits, [], []);
  });

  it("hands no rem length to the DOM from TypeScript (chrome-scale.test.ts holds the stylesheets)", () => {
    hold("rem in a TS string", lineHits(/["'`][^"'`\n]*(?<![\w.-])\d*\.?\d+rem\b/), [], []);
  });
});
