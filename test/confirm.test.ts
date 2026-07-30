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
    expect(dlg.querySelector(".confirm-title")?.textContent).toBe("Delete it?");
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

  it("labels the destructive button from confirmLabel", () => {
    const { p, dlg } = open();
    expect(dlg.querySelector(".confirm-btn.danger")?.textContent).toBe("Delete");
    (dlg.querySelector(".confirm-btn.cancel") as HTMLButtonElement).click();
    void p;
  });
});
