// The dialog frame (dialog.ts): the one skeleton every modal sits on. Opens
// modally, Escape closes through the frame, focus goes back to the opener.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dialogFrame } from "../src/dialog.js";
import { el } from "../src/dom.js";

beforeAll(() => {
  // jsdom's <dialog> lacks showModal/close; a minimal shim is enough here.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false; this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => { document.body.replaceChildren(); });

describe("dialogFrame", () => {
  it("builds title, sub, body and actions on a native <dialog> and opens modally", () => {
    const frame = dialogFrame({ title: "Rename scene", sub: "The file keeps its name.", className: "my-dialog" });
    expect(frame.dialog.tagName).toBe("DIALOG");
    expect(frame.dialog.classList.contains("shell-dialog")).toBe(true);
    expect(frame.dialog.classList.contains("my-dialog")).toBe(true);
    expect(frame.dialog.querySelector(".shell-dialog-title")?.textContent).toBe("Rename scene");
    expect(frame.dialog.querySelector(".shell-dialog-sub")?.textContent).toBe("The file keeps its name.");
    expect(frame.dialog.getAttribute("aria-label")).toBe("Rename scene");
    expect(frame.body.classList.contains("shell-dialog-body")).toBe(true);
    expect(frame.actions.classList.contains("shell-dialog-actions")).toBe(true);
    expect(frame.isOpen()).toBe(false);
    expect(frame.dialog.open).toBe(false);
    frame.open();
    expect(frame.isOpen()).toBe(true);
    expect(frame.dialog.open).toBe(true);
    expect(document.body.contains(frame.dialog)).toBe(true);
  });

  it("omits the sub line when none is given", () => {
    const frame = dialogFrame({ title: "Plain" });
    expect(frame.dialog.querySelector(".shell-dialog-sub")).toBeNull();
  });

  it("Escape (the dialog's cancel event) closes it through the frame, and onClose runs once", () => {
    const onClose = vi.fn();
    const frame = dialogFrame({ title: "Ask", onClose });
    frame.open();
    frame.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(frame.isOpen()).toBe(false);
    expect(document.querySelector(".shell-dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    frame.close();   // idempotent
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("gives focus back to whatever opened it", () => {
    const opener = el("button", "", "Open");
    document.body.append(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);
    const frame = dialogFrame({ title: "Ask" });
    const inner = el("button", "btn", "OK");
    frame.actions.append(inner);
    frame.open();
    inner.focus();
    expect(document.activeElement).toBe(inner);
    frame.close();
    expect(document.activeElement).toBe(opener);
  });

  it("a close from outside (dialog.close()) still tears down and reports", () => {
    const onClose = vi.fn();
    const frame = dialogFrame({ title: "Ask", onClose });
    frame.open();
    frame.dialog.close();
    expect(document.querySelector(".shell-dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(frame.isOpen()).toBe(false);
  });

  it("open() records the opener only once: a second open() while open is ignored", () => {
    const frame = dialogFrame({ title: "Ask" });
    frame.open();
    const spy = vi.spyOn(frame.dialog, "showModal");
    frame.open();
    expect(spy).not.toHaveBeenCalled();
  });
});
