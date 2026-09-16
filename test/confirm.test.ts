// The themed confirm: promise resolution, safe focus, Esc, backdrop.
// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { confirmDialog } from "../src/confirm.js";

beforeAll(() => {
  // jsdom's <dialog> lacks showModal/close in some versions; a minimal shim
  // is enough for the behaviour under test.
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
  }
});

const open = (): { p: Promise<boolean>; dlg: HTMLDialogElement } => {
  const p = confirmDialog({ title: "Delete it?", body: "Gone (undo restores it).", confirmLabel: "Delete" });
  const dlg = document.querySelector("dialog.confirm-dialog") as HTMLDialogElement;
  return { p, dlg };
};

describe("confirmDialog", () => {
  it("resolves true on the danger button and removes the dialog", async () => {
    const { p, dlg } = open();
    expect(dlg).not.toBeNull();
    // The title is the dialog frame's (dialog.ts); the body copy is confirm's own.
    expect(dlg.querySelector(".shell-dialog-title")?.textContent).toBe("Delete it?");
    expect(dlg.querySelector(".confirm-body")?.textContent).toBe("Gone (undo restores it).");
    expect(dlg.classList.contains("shell-dialog")).toBe(true);
    (dlg.querySelector(".confirm-btn.danger") as HTMLButtonElement).click();
    await expect(p).resolves.toBe(true);
    expect(document.querySelector("dialog.confirm-dialog")).toBeNull();
  });

  it("resolves false on Cancel", async () => {
    const { p, dlg } = open();
    (dlg.querySelector(".confirm-btn.cancel") as HTMLButtonElement).click();
    await expect(p).resolves.toBe(false);
  });

  it("focuses Cancel, not the destructive button", () => {
    const { p, dlg } = open();
    expect(document.activeElement).toBe(dlg.querySelector(".confirm-btn.cancel"));
    (dlg.querySelector(".confirm-btn.cancel") as HTMLButtonElement).click();
    void p;
  });

  it("treats Esc (the dialog cancel event) as false", async () => {
    const { p, dlg } = open();
    dlg.dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(p).resolves.toBe(false);
  });

  it("treats a backdrop mousedown (target = the dialog) as false", async () => {
    const { p, dlg } = open();
    dlg.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await expect(p).resolves.toBe(false);
  });

  it("renders bodyNode after the body sentence, and alone when there is no sentence", async () => {
    // Evidence, not a sentence: the scenes that refer to the thing being deleted.
    const refs = document.createElement("ul");
    refs.className = "refs";
    refs.append(document.createElement("li"));
    const p1 = confirmDialog({ title: "Delete it?", body: "Gone (undo restores it).", bodyNode: refs, confirmLabel: "Delete scene" });
    const dlg = document.querySelector("dialog.confirm-dialog")!;
    const kids = [...dlg.querySelector(".shell-dialog-body")!.children];
    expect(kids.map((k) => k.className)).toEqual(["confirm-body", "refs"]);
    expect(kids[1]).toBe(refs);
    (dlg.querySelector(".confirm-btn.cancel") as HTMLButtonElement).click();
    await p1;

    const warn = document.createElement("p");
    const p2 = confirmDialog({ title: "Delete it?", bodyNode: warn, confirmLabel: "Delete scene" });
    const dlg2 = document.querySelector("dialog.confirm-dialog")!;
    expect([...dlg2.querySelector(".shell-dialog-body")!.children]).toEqual([warn]);
    expect(dlg2.querySelector(".confirm-body")).toBeNull();
    (dlg2.querySelector(".confirm-btn.cancel") as HTMLButtonElement).click();
    await p2;
  });

  it("labels the destructive button from confirmLabel, on the family's .btn", () => {
    const { p, dlg } = open();
    const danger = dlg.querySelector(".confirm-btn.danger")!;
    expect(danger.textContent).toBe("Delete");
    expect(danger.classList.contains("btn")).toBe(true);
    (dlg.querySelector(".confirm-btn.cancel") as HTMLButtonElement).click();
    void p;
  });
});
