// The Extensions window's panel (extensions-panel.ts): a row per extension, each button asking for its action,
// Remove held back while another extension needs it, and only Uninstall with no project open.
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { extensionsPanel } from "../src/extensions-panel.js";
import type { ExtensionRow } from "../src/extensions-panel.js";

const shot: ExtensionRow = { id: "pattershot", name: "Pattershot", inProject: true, pinned: "0.4.0", views: ["Performance sheet"], installed: ["0.3.0", "0.4.0"], needsInstall: false, requiredBy: [] };
const stage: ExtensionRow = { id: "patterstage", name: "Patterstage", inProject: true, pinned: "0.5.0", views: [], installed: [], needsInstall: false, requiredBy: ["Pattershot"] };
const missing: ExtensionRow = { id: "probe", name: "Probe", inProject: true, views: ["Probe view"], installed: [], needsInstall: true, requiredBy: [] };

const setUp = () => {
  const act = { add: vi.fn(), install: vi.fn(), remove: vi.fn(), uninstall: vi.fn(), update: vi.fn() };
  const panel = extensionsPanel(act);
  document.body.replaceChildren(panel.el);
  const buttons = () => [...panel.el.querySelectorAll("button")];
  const click = (label: string, row?: string) => {
    const scope = row ? panel.el.querySelector(`[data-extension="${row}"]`)! : panel.el;
    [...scope.querySelectorAll("button")].find((b) => b.textContent === label)!.click();
  };
  return { act, panel, buttons, click };
};

describe("extensionsPanel", () => {
  it("draws each row with where it's taken, its views and its versions, and asks for each action", () => {
    const { act, panel, click } = setUp();
    panel.render({ rows: [shot, stage, missing], hasProject: true, app: "Patterpad" });
    const text = panel.el.textContent!;
    expect(text).toContain("In this project, 0.4.0");
    expect(text).toContain("View: Performance sheet");
    expect(text).toContain("0.4.0 (this project's)");
    expect(text).toContain("No views in Patterpad.");
    expect(text).toContain("Pattershot needs it, so it can't be removed first.");
    expect(text).toContain("Not installed on this machine");
    click("Add extension…");
    click("Uninstall 0.3.0", "pattershot");
    click("Remove from project…", "pattershot");
    click("Install on this machine…", "probe");
    click("Update…", "patterstage");
    expect(act.update).toHaveBeenCalledWith("patterstage");
    expect(act.add).toHaveBeenCalledOnce();
    expect(act.uninstall).toHaveBeenCalledWith("pattershot", "0.3.0");
    expect(act.remove).toHaveBeenCalledWith("pattershot");
    expect(act.install).toHaveBeenCalledWith("probe");
    const stageRemove = [...panel.el.querySelector('[data-extension="patterstage"]')!.querySelectorAll("button")].find((b) => b.textContent === "Remove from project…")!;
    expect(stageRemove.disabled).toBe(true);
  });

  it("offers only Uninstall with no project open, and marks the extension asked for", () => {
    const { panel, buttons } = setUp();
    panel.render({ rows: [{ ...shot, inProject: false }, missing], hasProject: false, app: "Patterpad", focus: "probe" });
    const labels = buttons().map((b) => `${b.textContent}${b.disabled ? " (off)" : ""}`);
    expect(labels).toEqual(["Add extension… (off)", "Update…", "Uninstall 0.3.0", "Uninstall 0.4.0"]); // Probe has nothing to update from here
    expect(panel.el.querySelector(".ext-focus")?.getAttribute("data-extension")).toBe("probe");
  });

  it("says when there's nothing to list", () => {
    const { panel } = setUp();
    panel.render({ rows: [], hasProject: true, app: "Storyletter" });
    expect(panel.el.textContent).toContain("This project takes no extensions, and none are installed on this machine.");
  });
});
