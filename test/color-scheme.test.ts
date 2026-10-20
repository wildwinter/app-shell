// Native controls follow the palette, not the OS. `color-scheme` decides how Chromium draws an
// unticked checkbox, a scrollbar or a select's pop-up, and which side of every light-dark() wins,
// so the shell reads it from the palette's `--color-scheme` and follows the OS only as a fallback.
// A palette under the other OS mode drew dark filled squares (or bright white boxes) in Settings.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("color-scheme", () => {
  it("reads the palette's --color-scheme on :root, falling back to the OS", () => {
    const tokens = stripComments(readFileSync(join(SRC, "tokens.css"), "utf8"));
    expect(tokens).toMatch(/:root\s*\{[^}]*color-scheme:\s*var\(--color-scheme,\s*light dark\);/);
  });

  it("is set nowhere else in the shell, so a palette's declaration is never overridden", () => {
    const offenders = readdirSync(SRC)
      .filter((f) => f.endsWith(".css") && f !== "tokens.css")
      .filter((f) => /(^|[^-])color-scheme\s*:/.test(stripComments(readFileSync(join(SRC, f), "utf8"))));
    expect(offenders).toEqual([]);
  });
});
