// The shared pieces of the frame that both apps draw the same way (the October 2026 UI review,
// 3-composition.md proposals 7 to 9): the navigator row, the top bar's title, and the status row at the
// window's foot, all in pane-shell.css, on the shell's tokens.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/pane-shell.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of the rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
};

describe("the shared frame grammar", () => {
  it("draws a navigator row 28px tall at weight 400, and the selected one by aria-current on the neutral fill", () => {
    expect(rule(".shell-nav-row")).toContain("min-height: 28px");
    expect(rule(".shell-nav-row")).toContain("font: var(--weight-regular) var(--text-md) var(--font-ui)");
    const selected = rule('.shell-nav-row[aria-current]:not([aria-current="false"])');
    expect(selected).toContain("background: var(--selection)");
    expect(selected).toContain("box-shadow: inset 2px 0 0 var(--accent)");
    expect(rule(".shell-nav-row:hover")).toContain("var(--hover)");
  });

  it("titles the top bar with the project in ink and the document in the quieter ink, at one size", () => {
    expect(rule(".shell-topbar-title")).toContain("var(--weight-strong) var(--text-md)");
    expect(rule(".shell-topbar-sub")).toContain("var(--weight-regular) var(--text-md)");
    expect(rule(".shell-topbar-sub")).toContain("color: var(--muted)");
  });

  it("gives the status row no rule and no fill, and the room Live Link publishes", () => {
    const row = rule(".shell-statusrow");
    expect(row).toContain("min-height: 28px");
    expect(row).toContain("border: 0");
    expect(row).toContain("background: none");
    expect(row).toContain("var(--linkstatus-reserve, 0px)");
  });
});
