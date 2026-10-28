// The dialog frame (dialog.ts): the one skeleton every modal sits on. Opens
// modally, Escape closes through the frame, focus goes back to the opener.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dialogFrame, setDialogFocusFallback } from "../src/dialog.js";
import { confirmDialog } from "../src/confirm.js";
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

describe("dialogFrame: focus when the opener has gone", () => {
  // The hands-on review of October 2026: Patterpad's inspector re-renders after
  // a commit, so the button that opened a dialog is no longer in the page when
  // it closes, and focus fell to <body>.
  afterEach(() => { setDialogFocusFallback(null); });

  /** An inspector-like panel: a focusable section holding a row with a button. */
  function inspector() {
    const panel = el("section", "inspector");
    panel.tabIndex = -1;
    const row = el("div", "row");
    const opener = el("button", "", "Edit…");
    row.append(opener);
    panel.append(row);
    document.body.append(panel);
    opener.focus();
    return { panel, row, opener };
  }

  it("falls back to the nearest ancestor of the opener still in the page that can take focus", () => {
    const { panel, row } = inspector();
    const frame = dialogFrame({ title: "Edit" });
    frame.open();
    row.remove();                                   // the commit re-renders the inspector
    panel.append(el("div", "row", "fresh"));
    frame.close();
    expect(document.activeElement).toBe(panel);
  });

  it("takes returnFocus first: an element, or a function called at close", () => {
    const { panel, row, opener } = inspector();
    const fresh = el("button", "", "Edit…");
    const frame = dialogFrame({ title: "Edit", returnFocus: () => fresh });
    frame.open();
    row.remove();
    panel.append(fresh);                            // only exists once the dialog has closed over it
    frame.close();
    expect(document.activeElement).toBe(fresh);

    // An element, given up front, wins even over a connected opener.
    const other = el("button", "", "Other");
    document.body.append(other, opener);
    opener.focus();
    const second = dialogFrame({ title: "Again", returnFocus: other });
    second.open();
    second.close();
    expect(document.activeElement).toBe(other);
  });

  it("passes over a returnFocus that can't take focus", () => {
    const { opener } = inspector();
    const frame = dialogFrame({ title: "Edit", returnFocus: () => el("button", "", "never mounted") });
    frame.open();
    frame.close();
    expect(document.activeElement).toBe(opener);
  });

  it("uses the host's fallback when nothing near the opener is left", () => {
    const editor = el("div", "editor");
    editor.tabIndex = -1;
    document.body.append(editor);
    setDialogFocusFallback(() => editor);
    const holder = el("div", "holder");
    const opener = el("button", "", "Open");
    holder.append(opener);
    document.body.append(holder);
    opener.focus();
    const frame = dialogFrame({ title: "Edit" });
    frame.open();
    holder.remove();
    frame.close();
    expect(document.activeElement).toBe(editor);
  });

  it("the shell's own dialogs take returnFocus through to the frame (confirm)", async () => {
    const { panel, row } = inspector();
    const fresh = el("button", "", "Delete");
    const answer = confirmDialog({ title: "Delete?", confirmLabel: "Delete", returnFocus: () => fresh });
    row.remove();
    panel.append(fresh);
    document.querySelector<HTMLButtonElement>(".confirm-btn.cancel")!.click();
    await answer;
    expect(document.activeElement).toBe(fresh);
  });
});

