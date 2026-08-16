// The menu spine (menu.ts). Pinned here because these strings ARE the shared
// surface: a suite is recognised by finding the same item, spelled the same
// way, in the same menu. A silent edit to one of these labels is a family-level
// change, so it should fail a test rather than ship.
import { describe, expect, it } from "vitest";
import { APP_MENU, EDIT_MENU, HELP_MENU, PANE_MENU, namedMenuItems } from "../src/menu.js";

describe("the shared labels", () => {
  it("spells the Edit verbs and their accelerators one way", () => {
    expect(EDIT_MENU.undo).toEqual({ label: "Undo", accelerator: "CmdOrCtrl+Z" });
    expect(EDIT_MENU.redo).toEqual({ label: "Redo", accelerator: "Shift+CmdOrCtrl+Z" });
    expect(EDIT_MENU.duplicate).toEqual({ label: "Duplicate", accelerator: "CmdOrCtrl+D" });
    expect(EDIT_MENU.find).toEqual({ label: "Find…", accelerator: "CmdOrCtrl+F" });
  });

  it("uses an ellipsis character, not three dots, on the items that open something", () => {
    for (const label of [EDIT_MENU.find.label, HELP_MENU.checkForUpdates.label, APP_MENU.userInfo.label]) {
      expect(label).toContain("…");
      expect(label).not.toContain("...");
    }
  });

  it("keeps Reset View unaccelerated and the pane toggles on 1 and 2", () => {
    expect(PANE_MENU.showNav.accelerator).toBe("CmdOrCtrl+1");
    expect(PANE_MENU.showInspector.accelerator).toBe("CmdOrCtrl+2");
    expect(PANE_MENU.resetView.accelerator).toBeUndefined();
  });
});

describe("namedMenuItems", () => {
  it("names About and Documentation after the app, and the home after the suite", () => {
    const m = namedMenuItems({
      appName: "Patterpad",
      docsUrl: "https://patterkit.dev/patterpad/overview/",
      suiteDocsUrl: "https://patterkit.dev/",
    });
    expect(m.about.label).toBe("About Patterpad");
    expect(m.docs.label).toBe("Patterpad Documentation");
    expect(m.suiteDocs.label).toBe("Patter Documentation Home");
    expect(m.docs.url).toBe("https://patterkit.dev/patterpad/overview/");
    expect([m.about.ready, m.docs.ready, m.suiteDocs.ready]).toEqual([true, true, true]);
  });

  it("still gives an app with no docs site the ITEMS, marked not ready", () => {
    // The placeholder rule: the menu has its family shape from day one, and
    // wiring a URL later is one line rather than a menu redesign.
    const m = namedMenuItems({ appName: "Storyletter" });
    expect(m.docs.label).toBe("Storyletter Documentation");
    expect(m.docs.url).toBeUndefined();
    expect(m.docs.ready).toBe(false);
    expect(m.suiteDocs.ready).toBe(false);
    // About needs nothing from the app but its name, so it is always ready.
    expect(m.about.ready).toBe(true);
  });

  it("lets a different suite rename the home item", () => {
    expect(namedMenuItems({ appName: "X", suiteName: "Acme" }).suiteDocs.label)
      .toBe("Acme Documentation Home");
  });
});
