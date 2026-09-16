// The rest of the menu spine (menu.ts): the label tables and the Open Recent
// submenu builder.
import { describe, expect, it, vi } from "vitest";
import { EDIT_MENU, FILE_MENU, PLAY_MENU, REVIEW_MENU, PUBLISH_MENU, VIEW_MENU, recentsSubmenu, tildePath } from "../src/menu.js";

describe("the tables", () => {
  it("spells the family accelerators once", () => {
    expect(REVIEW_MENU.reviewFeedback).toEqual({ label: "Review Feedback", accelerator: "CmdOrCtrl+Shift+R" });
    expect(REVIEW_MENU.coverageTest).toEqual({ label: "Coverage Test…", accelerator: "Shift+CmdOrCtrl+C" });
    expect(VIEW_MENU.upALevel).toEqual({ label: "Up a Level", accelerator: "CmdOrCtrl+[" });
    expect(FILE_MENU.saveAs).toEqual({ label: "Save As…", accelerator: "Shift+CmdOrCtrl+S" });
    expect(FILE_MENU.projectSettings.accelerator).toBe("CmdOrCtrl+,");
    expect(PUBLISH_MENU.bundle.accelerator).toBe("Shift+CmdOrCtrl+B");
    expect(EDIT_MENU.replace).toEqual({ label: "Replace…", acceleratorMac: "Cmd+Alt+F", acceleratorOther: "Ctrl+H" });
    // App-keyed on purpose: the play surface is not in the spine.
    expect(PLAY_MENU).toEqual({ liveLink: { label: "Live Link" } });
  });

  it("is Title Case throughout, with the command ellipsis on what opens something", () => {
    const all = [FILE_MENU, PLAY_MENU, REVIEW_MENU, PUBLISH_MENU, VIEW_MENU].flatMap((t) => Object.values(t).map((i) => i.label));
    for (const label of all) {
      expect(label).not.toContain("...");
      // Every word capitalised but the small ones.
      for (const word of label.replace("…", "").split(" ")) {
        if (["a", "as", "by", "for", "in", "of", "to"].includes(word)) continue;
        expect(word[0]).toBe(word[0]?.toUpperCase());
      }
    }
    expect(FILE_MENU.noRecents.label).toBe("No Recent Projects");
    expect(FILE_MENU.clearRecents.label).toBe("Clear Recents");
  });
});

describe("tildePath", () => {
  it("abbreviates the home directory and nothing else", () => {
    expect(tildePath("/Users/me/work/a.patter", "/Users/me")).toBe("~/work/a.patter");
    expect(tildePath("/Users/me", "/Users/me")).toBe("~");
    expect(tildePath("/Users/meredith/x", "/Users/me")).toBe("/Users/meredith/x");
    expect(tildePath("C:\\Users\\me\\x", "C:\\Users\\me")).toBe("~\\x");
  });
});

describe("recentsSubmenu", () => {
  const recents = [{ path: "/Users/me/tavern.patter", name: "Tavern" }, { path: "/srv/draft" }];

  it("is the one disabled item when empty", () => {
    expect(recentsSubmenu([], { onOpen: () => {}, home: "/Users/me" })).toEqual([{ label: "No Recent Projects", enabled: false }]);
  });

  it("on the mac: the name as the label, the path as sublabel and full path as toolTip", () => {
    const onOpen = vi.fn();
    const items = recentsSubmenu(recents, { onOpen, home: "/Users/me", platform: "darwin" });
    expect(items.length).toBe(2);
    expect(items[0]).toMatchObject({ label: "Tavern", sublabel: "~/tavern.patter", toolTip: "/Users/me/tavern.patter" });
    expect(items[1]).toMatchObject({ label: "draft", sublabel: "/srv/draft" });   // the stem stands in for a missing name
    items[0]!.click!();
    expect(onOpen).toHaveBeenCalledWith("/Users/me/tavern.patter");
  });

  it("elsewhere folds the path into the label", () => {
    const items = recentsSubmenu(recents, { onOpen: () => {}, home: "/Users/me", platform: "win32" });
    expect(items[0]?.label).toBe("Tavern  (~/tavern.patter)");
  });

  it("offers Clear Recents after a separator when asked, and only with something to clear", () => {
    const onClear = vi.fn();
    const items = recentsSubmenu(recents, { onOpen: () => {}, onClear, home: "/", platform: "darwin" });
    expect(items.slice(2)).toEqual([{ type: "separator" }, { label: "Clear Recents", click: onClear }]);
    expect(recentsSubmenu([], { onOpen: () => {}, onClear, home: "/" })).toEqual([{ label: "No Recent Projects", enabled: false }]);
  });
});
