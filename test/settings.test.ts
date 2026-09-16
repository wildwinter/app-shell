// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mountSettingsDialog, dupGuard, expandableRow, tagChips, moveItem, revealRow, revealRowWhenReady } from "../src/index.js";

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
    // The reason is the themed rollover, never an OS title.
    expect(a.dataset["tip"]).toBe("Another row already has this name.");
    expect(a.title).toBe("");
    b.value = "silver";
    expect(g.check()).toBe(false);
    expect("tip" in a.dataset).toBe(false);
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

describe("mountSettingsDialog: disabled tabs and the message channel", () => {
  it("a tab whose disabled() returns a reason renders inert with the reason as its data-tip", () => {
    let voiced = false;
    const dlg = mountSettingsDialog({
      title: "Project settings",
      sections: [
        { id: "general", label: "General", mount: () => ({}) },
        { id: "audio", label: "Audio", mount: () => ({}), disabled: () => (voiced ? null : "Enable Voiced (General tab) to track recording status and audio.") },
      ],
      onSave: () => {},
    });
    dlg.open("audio");   // asked for a disabled tab: hands over to the first usable one
    const dialog = document.querySelector("dialog.settings-dialog:last-of-type")!;
    const audio = dialog.querySelector<HTMLButtonElement>('.settings-tab[data-tab="audio"]')!;
    const general = dialog.querySelector<HTMLButtonElement>('.settings-tab[data-tab="general"]')!;
    expect(audio.classList.contains("is-disabled")).toBe(true);
    expect(audio.dataset["tip"]).toBe("Enable Voiced (General tab) to track recording status and audio.");
    expect(audio.getAttribute("aria-disabled")).toBe("true");
    expect(audio.hasAttribute("title")).toBe(false);
    expect(general.classList.contains("active")).toBe(true);
    audio.click();
    expect(general.classList.contains("active")).toBe(true);
    // Flipped from inside the dialog: refreshTabs re-reads it.
    voiced = true;
    dlg.refreshTabs();
    expect(audio.classList.contains("is-disabled")).toBe(false);
    expect("tip" in audio.dataset).toBe(false);
    audio.click();
    expect(audio.classList.contains("active")).toBe(true);
    // ...and back: the showing tab that just became disabled hands over.
    voiced = false;
    dlg.refreshTabs();
    expect(general.classList.contains("active")).toBe(true);
    dlg.destroy();
  });

  it("firstInvalid may carry a message, which the error line shows; a bare element speaks through its data-tip", () => {
    const onSave = vi.fn();
    let bad: HTMLElement | { el: HTMLElement; message?: string } | null = null;
    const dlg = mountSettingsDialog({
      title: "Project settings",
      sections: [{ id: "props", label: "Properties", mount: () => ({ firstInvalid: () => bad }) }],
      onSave,
    });
    dlg.open();
    const dialog = document.querySelector("dialog.settings-dialog:last-of-type")!;
    const error = dialog.querySelector<HTMLElement>(".settings-error")!;
    const save = dialog.querySelector<HTMLButtonElement>(".settings-save")!;
    const field = document.createElement("input");
    bad = { el: field, message: "Can't be used in an expression: a hyphen reads as subtraction." };
    save.click();
    expect(onSave).not.toHaveBeenCalled();
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Can't be used in an expression: a hyphen reads as subtraction.");
    field.dataset["tip"] = "Another row already has this name.";
    bad = field;
    save.click();
    expect(error.textContent).toBe("Another row already has this name.");
    delete field.dataset["tip"];
    save.click();
    expect(error.textContent).toBe("Fix the highlighted fields first.");
    bad = null;
    save.click();
    expect(onSave).toHaveBeenCalledTimes(1);
    dlg.destroy();
  });
});

describe("revealRowWhenReady", () => {
  it("resolves true once the row appears on a later frame, and false when it never does", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const late = revealRowWhenReady(host, "gold", 12);
    // Not there yet: the first try fails and the retry is queued.
    expect(revealRow(host, "gold")).toBe(false);
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    host.append(expandableRow({ line: [document.createElement("span")], name: "gold" }));
    await expect(late).resolves.toBe(true);
    expect(host.querySelector(".set-row")!.classList.contains("landed")).toBe(true);
    await expect(revealRowWhenReady(host, "nosuch", 2)).resolves.toBe(false);
  });
});
