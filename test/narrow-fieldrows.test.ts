// Field rows fit a narrow inspector (the October 2026 hands-on review): at inspector widths of about 220px and
// below, a quality's rung strip and a map's key field ran past the row and the inspector scrolled sideways. jsdom
// lays nothing out, so these hold the rules that keep every control inside its row; the overflow itself was
// measured in Patterpad's preview (45 to 67px over a 130px control column before, none after).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "controls.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string): string => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};

describe("field rows in a narrow inspector", () => {
  it("keeps every control in a row inside it", () => {
    expect(rule(".shell-fieldrow-body > *")).toMatch(/max-width:\s*100%/);
  });

  it("lets a rung strip wrap within the row, and a long stage name wrap within its rung", () => {
    expect(rule(".shell-rungs")).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(".shell-rungs")).toMatch(/max-width:\s*100%/);
    expect(rule(".shell-rung")).toMatch(/white-space:\s*normal/);
  });

  it("lets a map's key field give up its 10em when the row is narrower", () => {
    expect(rule(".shell-valuerow-key")).toMatch(/min-width:\s*min\(10em,\s*100%\)/);
    expect(rule(".shell-valuerow-key")).toMatch(/max-width:\s*100%/);
  });
});
