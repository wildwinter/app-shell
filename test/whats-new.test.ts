// What's New: the dialog after an update, and Help > What's New.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openWhatsNew, whatsNewAfterUpdate } from "../src/whats-new.js";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(() => document.body.replaceChildren());

const MD = `## [0.41.0] - 2026-11-02
### Added
- **The palette.** Cmd+K.
### Fixed
- **A fix.** Fixed.
## [0.40.0] - 2026-10-28
### Changed
- **Quieter corners**, and white fields.
## [0.39.0] - 2026-10-22
### Changed
- **Older.** Old.
`;
const base = { appName: "Patterpad", changelog: MD, onShow: vi.fn(), releaseNotes: (v: string) => `https://example.test/v${v}`, openExternal: vi.fn() };
const dlg = (): HTMLDialogElement | null => document.querySelector("dialog.whatsnew-dialog");
const heads = (): string[] => [...document.querySelectorAll(".whatsnew-head")].map((h) => h.textContent!);

describe("after an update", () => {
  it("shows every version since the last run, newest first, with fixes as a count and a link", () => {
    expect(whatsNewAfterUpdate({ version: "0.41.0", previous: "0.39.0", show: true }, base)).toBe(true);
    expect(dlg()?.querySelector(".shell-dialog-title")?.textContent).toBe("What’s new in Patterpad");
    expect(heads()).toEqual(["Patterpad 0.41.0", "Patterpad 0.40.0"]);
    expect([...document.querySelectorAll(".whatsnew-item")].map((i) => i.textContent)).toEqual(["The palette.", "Quieter corners, and white fields."]);
    const foot = document.querySelector(".whatsnew-foot")!;
    expect(foot.textContent).toBe("And 1 fix. Full release notes");
    foot.querySelector("a")!.click();
    expect(base.openExternal).toHaveBeenCalledWith("https://example.test/v0.41.0");
  });

  it("shows nothing on a fresh install, nothing when it's turned off, and only this version for an install from before", () => {
    expect(whatsNewAfterUpdate({ version: "0.41.0", show: true }, base)).toBe(false);
    expect(whatsNewAfterUpdate({ version: "0.41.0", previous: "0.39.0", show: false }, base)).toBe(false);
    expect(dlg()).toBeNull();
    expect(whatsNewAfterUpdate({ version: "0.41.0", existing: true, show: true }, base)).toBe(true);
    expect(heads()).toEqual(["Patterpad 0.41.0"]);
  });

  it("carries the tickbox, ticked, and tells the app when it changes", () => {
    const onShow = vi.fn();
    whatsNewAfterUpdate({ version: "0.41.0", previous: "0.40.0", show: true }, { ...base, onShow });
    const box = document.querySelector<HTMLInputElement>(".whatsnew-show input")!;
    expect(box.checked).toBe(true);
    expect(document.querySelector(".whatsnew-show")?.textContent).toBe("Show what’s new after updates");
    box.checked = false; box.dispatchEvent(new Event("change"));
    expect(onShow).toHaveBeenCalledWith(false);
  });
});

describe("closing it", () => {
  it("tells the app, so main can stop giving the launch answer", () => {
    const onClose = vi.fn();
    whatsNewAfterUpdate({ version: "0.41.0", previous: "0.40.0", show: true }, { ...base, onClose });
    expect(onClose).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>(".whatsnew-dialog .btn.primary")!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Help > What's New", () => {
  it("shows the latest three up to this version, even with the tickbox off", () => {
    openWhatsNew({ ...base, version: "0.41.0", show: false });
    expect(heads()).toEqual(["Patterpad 0.41.0", "Patterpad 0.40.0", "Patterpad 0.39.0"]);
    expect(document.querySelector<HTMLInputElement>(".whatsnew-show input")!.checked).toBe(false);
  });
});
