// The updater's view: the chosen index comes back, Esc is the cancel index,
// progress feeds the open dialog, links open through the bridge.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { showUpdaterDialog, feedUpdaterDownloadProgress } from "../src/updater-view.js";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false; this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => document.body.replaceChildren());

const dlg = (): HTMLDialogElement => document.querySelector("dialog.updater-dialog") as HTMLDialogElement;
const buttons = (): HTMLButtonElement[] => [...dlg().querySelectorAll<HTMLButtonElement>(".shell-dialog-actions button")];

describe("showUpdaterDialog", () => {
  it("draws message, detail and buttons on the dialog frame and resolves the clicked index", async () => {
    const p = showUpdaterDialog({ message: "Update ready to install", detail: "Restart now to install it.", buttons: ["Restart now", "Later"] });
    expect(dlg().classList.contains("shell-dialog")).toBe(true);
    expect(dlg().querySelector(".shell-dialog-title")?.textContent).toBe("Update ready to install");
    expect(dlg().querySelector(".updater-detail")?.textContent).toBe("Restart now to install it.");
    expect(buttons().map((b) => b.textContent)).toEqual(["Restart now", "Later"]);
    expect(buttons()[0]?.classList.contains("primary")).toBe(true);
    expect(buttons()[1]?.classList.contains("primary")).toBe(false);
    buttons()[1]!.click();
    await expect(p).resolves.toBe(1);
    expect(document.querySelector("dialog.updater-dialog")).toBeNull();
  });

  it("Esc resolves cancelId, which defaults to the last button", async () => {
    const p = showUpdaterDialog({ message: "You have unsaved changes.", buttons: ["Save and restart", "Discard and restart", "Cancel"] });
    dlg().dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(p).resolves.toBe(2);
    const q = showUpdaterDialog({ message: "m", buttons: ["A", "B", "C"], cancelId: 0 });
    dlg().dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(q).resolves.toBe(0);
  });

  it("feeds download progress into the open dialog, and nowhere once it is gone", async () => {
    const p = showUpdaterDialog({ message: "Update available", buttons: ["OK"], progress: true });
    const bar = dlg().querySelector<HTMLElement>(".updater-progress-bar")!;
    const label = dlg().querySelector<HTMLElement>(".updater-progress-label")!;
    expect(label.textContent).toBe("Starting download…");
    feedUpdaterDownloadProgress({ percent: 42.4, transferred: 1048576, total: 3145728, bytesPerSecond: 524288, version: "1.2.3" });
    expect(bar.style.width).toBe("42.4%");
    expect(label.textContent).toBe("42%, 1.0 of 3.0 MB (0.5 MB/s)");
    buttons()[0]!.click();
    await p;
    feedUpdaterDownloadProgress({ percent: 100, transferred: 1, total: 1, bytesPerSecond: 1, version: "1.2.3" });
    expect(bar.style.width).toBe("42.4%");   // untouched: the slot was cleared on close
  });

  it("draws links that open through openExternal, never by navigating", async () => {
    const openExternal = vi.fn();
    const p = showUpdaterDialog({
      message: "About", buttons: ["OK"],
      links: [{ label: "Website", url: "https://example.test/" }], openExternal,
    });
    const a = dlg().querySelector<HTMLAnchorElement>(".updater-links a")!;
    expect(a.textContent).toBe("Website");
    const ev = new MouseEvent("click", { cancelable: true, bubbles: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://example.test/");
    buttons()[0]!.click();
    await p;
  });
});
