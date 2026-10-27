// The command palette: the live menu by name, quick open, and the keyboard.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accelToCombo, closeCommandPalette, matchScore, openCommandPalette } from "../src/command-palette.js";
import { findMenuItem, flattenMenu, type MenuCommand, type MenuLike } from "../src/menu.js";

beforeAll(() => { Element.prototype.scrollIntoView = function () {}; }); // jsdom has no layout
afterEach(() => { closeCommandPalette(); document.body.replaceChildren(); });

const MENU: MenuLike = {
  items: [
    { label: "Patterpad", submenu: { items: [{ label: "About Patterpad" }, { type: "separator" }, { label: "Services", role: "services", submenu: { items: [] } }, { label: "Hide Patterpad", role: "hide" }, { label: "Quit Patterpad", role: "quit", accelerator: "CmdOrCtrl+Q" }] } },
    { label: "File", submenu: { items: [
      { label: "New Scene", accelerator: "CmdOrCtrl+N" },
      { label: "Export", submenu: { items: [{ label: "Bundle", enabled: false }] } },
      { label: "Secret", visible: false },
    ] } },
    { label: "View", submenu: { items: [{ label: "Command Palette…", accelerator: "CmdOrCtrl+K" }, { label: "Show Navigator", accelerator: "CmdOrCtrl+1" }] } },
  ],
};

describe("the palette's view of the menu", () => {
  it("lists the app's runnable items with their path, leaving out the system's own, hidden ones, and itself", () => {
    const cmds = flattenMenu(MENU);
    expect(cmds.map((c) => [c.path.join(">"), c.label, c.enabled])).toEqual([
      ["Patterpad", "About Patterpad", true],
      ["Patterpad", "Quit Patterpad", true],
      ["File", "New Scene", true],
      ["File>Export", "Bundle", false],
      ["View", "Show Navigator", true],
    ]);
    expect(cmds[2]!.accelerator).toBe("CmdOrCtrl+N");
  });

  it("finds an item again by its id, and nothing once the menu has moved", () => {
    const [, , newScene, bundle] = flattenMenu(MENU);
    expect(findMenuItem(MENU, newScene!.id)?.label).toBe("New Scene");
    expect(findMenuItem(MENU, bundle!.id)?.label).toBe("Bundle");
    expect(findMenuItem({ items: [] }, newScene!.id)).toBeUndefined();
  });
});

describe("matching", () => {
  it("ranks the start over a word start over the middle over scattered letters", () => {
    const start = matchScore("new", "New Scene");
    const word = matchScore("sce", "New Scene");
    const mid = matchScore("cen", "New Scene");
    const scattered = matchScore("nsc", "New Scene");
    expect(start).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(scattered);
    expect(scattered).toBeGreaterThan(-1);
    expect(matchScore("xyz", "New Scene")).toBe(-1);
    // Letters scattered through the middle of words aren't a match.
    expect(matchScore("go", "Review Suggestions\u2026")).toBe(-1);
    expect(matchScore("rs", "Review Suggestions\u2026")).toBeGreaterThan(-1);
  });

  it("speaks Electron's accelerators in the family's spelling", () => {
    expect(accelToCombo("CmdOrCtrl+K")).toBe("Mod+K");
    expect(accelToCombo("Shift+CmdOrCtrl+Z")).toBe("Shift+Mod+Z");
    expect(accelToCombo("Cmd+Alt+F")).toBe("Mod+Alt+F");
  });
});

describe("openCommandPalette", () => {
  const commands = (): Promise<MenuCommand[]> => Promise.resolve(flattenMenu(MENU));
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const field = (): HTMLInputElement => document.querySelector(".shell-palette-input")!;
  const labels = (): string[] => [...document.querySelectorAll(".shell-palette-row .shell-palette-label")].map((n) => n.textContent!);
  const type = (v: string): void => { field().value = v; field().dispatchEvent(new Event("input")); };
  const key = (k: string): void => { field().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); };

  it("lists the menu and quick-open rows, filters as you type, and runs the pick by id after closing", async () => {
    const before = document.createElement("button"); document.body.append(before); before.focus();
    const run = vi.fn(() => { expect(document.querySelector(".shell-palette")).toBeNull(); });
    const goGate = vi.fn();
    openCommandPalette({ commands, run, items: () => [{ label: "Gate", detail: "Scene", run: goGate }] });
    await flush();
    expect(document.activeElement).toBe(field());
    expect(labels()).toContain("Gate");
    type("new");
    expect(labels()[0]).toBe("New Scene");
    key("Enter");
    expect(run).toHaveBeenCalledWith(flattenMenu(MENU)[2]!.id);
    expect(document.activeElement).toBe(before);
    openCommandPalette({ commands, run, items: () => [{ label: "Gate", detail: "Scene", run: goGate }] });
    await flush();
    type("gate");
    key("Enter");
    expect(goGate).toHaveBeenCalledTimes(1);
  });

  it("greys a disabled command, never runs it, and steps past it", async () => {
    const run = vi.fn();
    openCommandPalette({ commands, run });
    await flush();
    type("bundle");
    expect(document.querySelector(".shell-palette-row")?.classList.contains("disabled")).toBe(true);
    key("Enter");
    expect(run).not.toHaveBeenCalled();
  });

  it("closes on Esc, and Cmd+K again toggles it shut", async () => {
    openCommandPalette({ commands, run: () => {} });
    key("Escape");
    expect(document.querySelector(".shell-palette")).toBeNull();
    openCommandPalette({ commands, run: () => {} });
    openCommandPalette({ commands, run: () => {} });
    expect(document.querySelector(".shell-palette")).toBeNull();
  });

  it("moves with the arrow keys", async () => {
    openCommandPalette({ commands, run: () => {} });
    await flush();
    type("o");
    const first = document.querySelector(".shell-palette-row.active");
    key("ArrowDown");
    expect(document.querySelector(".shell-palette-row.active")).not.toBe(first);
    key("ArrowUp");
    expect(document.querySelector(".shell-palette-row.active")).toBe(first);
  });
});
