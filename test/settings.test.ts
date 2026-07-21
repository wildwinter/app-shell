// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mountSettingsDialog, dupGuard, expandableRow, tagChips, moveItem } from "../src/index.js";

// jsdom lacks <dialog>.showModal / .close; stub them so open()/save work.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, returnValue?: string) {
  this.open = false; this.returnValue = returnValue ?? ""; this.dispatchEvent(new Event("close"));
};

describe("dupGuard", () => {
  it("flags case-insensitive duplicate names", () => {
    const g = dupGuard();
    const a = document.createElement("input"); a.value = "gold";
    const b = document.createElement("input"); b.value = "Gold";
    const c = document.createElement("input"); c.value = "rep";
    g.reset(); g.track(a); g.track(b); g.track(c);
    expect(g.check()).toBe(true);
    expect(a.classList.contains("invalid")).toBe(true);
    expect(c.classList.contains("invalid")).toBe(false);
    expect(g.firstDuplicate()).toBe(a);
    b.value = "silver";
    expect(g.check()).toBe(false);
  });
});

describe("expandableRow + moveItem + tagChips", () => {
  it("hides details behind a disclosure", () => {
    const row = expandableRow({ line: [document.createElement("span")], details: [document.createElement("span")] });
    const toggle = row.querySelector<HTMLButtonElement>(".set-expand")!;
    const details = row.querySelector<HTMLElement>(".set-details")!;
    expect(details.hidden).toBe(true);
    toggle.click();
    expect(details.hidden).toBe(false);
  });
  it("moveItem swaps in place", () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 0, 1)).toBe(true); expect(a).toEqual([2, 1, 3]);
    expect(moveItem(a, 2, 1)).toBe(false);
  });
  it("tagChips adds and removes values in place", () => {
    const holder: { values?: string[] } = { values: ["a"] };
    const w = tagChips(holder);
    const input = w.querySelector<HTMLInputElement>(".shell-tag-input")!;
    input.value = "b"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(holder.values).toEqual(["a", "b"]);
    w.querySelector<HTMLButtonElement>(".shell-tag-x")!.click();   // removes "a"
    expect(holder.values).toEqual(["b"]);
  });
});

describe("mountSettingsDialog", () => {
  it("mounts sections, gates Save on invalid, saves when clean", () => {
    const onSave = vi.fn();
    let invalid: HTMLElement | null = null;
    const dlg = mountSettingsDialog({
      title: "Project settings",
      sections: [
        { id: "general", label: "General", group: "Project", mount: (h) => { h.append(document.createTextNode("g")); return {}; } },
        { id: "story", label: "Story", mount: (h) => { const i = document.createElement("input"); h.append(i); return { firstInvalid: () => invalid }; } },
      ],
      onSave,
    });
    dlg.open();
    const dialog = document.querySelector("dialog.settings-dialog")!;
    expect(dialog.querySelectorAll(".settings-tab")).toHaveLength(2);
    expect(dialog.querySelector(".settings-group")!.textContent).toBe("Project");
    // Blocked save (a section reports invalid) does not call onSave.
    invalid = document.createElement("input");
    dialog.querySelector<HTMLButtonElement>(".settings-save")!.click();
    expect(onSave).not.toHaveBeenCalled();
    expect(dialog.querySelector<HTMLElement>(".settings-error")!.hidden).toBe(false);
    // Clean save fires onSave.
    invalid = null;
    dialog.querySelector<HTMLButtonElement>(".settings-save")!.click();
    expect(onSave).toHaveBeenCalled();
  });
});
