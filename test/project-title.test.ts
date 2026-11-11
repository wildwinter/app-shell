// The project's name in the top bar: a button (so a window-drag title bar leaves it alone), with the
// overview rollover and click only while there is a project to lead to.
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { projectTitle, projectTitleTip } from "../src/project-title.js";

describe("projectTitle", () => {
  it("is a button in the title style, so the drag region's button exemption covers it", () => {
    const t = projectTitle({ name: "The Tavern", path: "/p/tavern", onOpen: () => {} });
    expect(t.el.tagName).toBe("BUTTON");
    expect(t.el.type).toBe("button");
    expect(t.el.classList.contains("shell-topbar-title")).toBe(true);
    expect(t.el.textContent).toBe("The Tavern");
    const css = readFileSync(join(process.cwd(), "src", "pane-shell.css"), "utf8");
    expect(css).toMatch(/\.topbar\.titlebar :is\(button[^)]*\)\s*\{\s*-webkit-app-region: no-drag/);
  });

  it("leads to the overview: the path in the rollover, the click calls onOpen", () => {
    const onOpen = vi.fn();
    const t = projectTitle({ name: "The Tavern", path: "/p/tavern", onOpen });
    expect(t.el.dataset.tip).toBe("The project overview\n/p/tavern");
    expect(t.el.dataset.tip).toBe(projectTitleTip("/p/tavern"));
    expect(t.el.hasAttribute("aria-disabled")).toBe(false);
    t.el.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("with no path is only a name: no rollover, no click", () => {
    const onOpen = vi.fn();
    const t = projectTitle({ name: "Patterpad", onOpen });
    expect(t.el.dataset.tip).toBeUndefined();
    expect(t.el.getAttribute("aria-disabled")).toBe("true");
    expect(t.el.classList.contains("is-inert")).toBe(true);
    t.el.click();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("with no onOpen has no rollover either, since it leads nowhere", () => {
    const t = projectTitle({ name: "The Tavern", path: "/p/tavern" });
    expect(t.el.dataset.tip).toBeUndefined();
  });

  it("draws a note in the quieter ink beside the name, and update clears what it leaves out", () => {
    const onOpen = vi.fn();
    const t = projectTitle({ name: "Deck", path: "/p/deck", note: "3 edits to send", onOpen });
    const note = t.el.querySelector(".shell-project-title-note");
    expect(note?.textContent).toBe("3 edits to send");
    expect(note?.classList.contains("shell-topbar-sub")).toBe(true);

    t.update({ name: "Other", path: "/p/other" });
    expect(t.el.textContent).toBe("Other");
    expect(t.el.querySelector(".shell-project-title-note")).toBeNull();
    expect(t.el.dataset.tip).toBe(projectTitleTip("/p/other"));
    t.el.click();
    expect(onOpen).toHaveBeenCalledTimes(1); // the mounted handler stays

    t.update({ name: "Patterpad" });
    expect(t.el.dataset.tip).toBeUndefined();
    t.el.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
