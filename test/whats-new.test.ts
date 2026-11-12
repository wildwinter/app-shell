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
const items = (): string[] => [...document.querySelectorAll(".whatsnew-item")].map((i) => i.textContent!);
const bar = (): HTMLElement => { const h = document.createElement("div"); document.body.append(h); return h; };
/** After an update, as the app runs it: the chip, then a click on it. */
function afterUpdate(state: Parameters<typeof whatsNewAfterUpdate>[0], extra: Partial<typeof base> & { onClose?: () => void } = {}): HTMLButtonElement | null {
  const chip = whatsNewAfterUpdate(state, { ...base, ...extra, host: bar() });
  chip?.click();
  return chip;
}

describe("after an update", () => {
  it("opens nothing: the top bar carries a quiet chip, and the dialog opens from it", () => {
    const host = bar();
    const chip = whatsNewAfterUpdate({ version: "0.41.0", previous: "0.39.0", show: true }, { ...base, host })!;
    expect(dlg()).toBeNull();
    expect(host.firstElementChild).toBe(chip);
    expect(chip.textContent).toBe("What’s new");
    expect(chip.dataset["tip"]).toBe("Patterpad 0.41.0 is installed. See what’s new.");
    expect(chip.classList.contains("attention")).toBe(false);
    chip.click();
    expect(dlg()?.open).toBe(true);
    expect(chip.isConnected).toBe(false);
  });

  it("lists every version since the last run, newest first, as titles, then what's left and the link", () => {
    afterUpdate({ version: "0.41.0", previous: "0.39.0", show: true });
    expect(dlg()?.querySelector(".shell-dialog-title")?.textContent).toBe("What’s new in Patterpad");
    expect(heads()).toEqual(["Patterpad 0.41.0", "Patterpad 0.40.0"]);
    expect(items()).toEqual(["The palette", "Quieter corners"]);
    const foot = document.querySelector(".whatsnew-foot")!;
    expect(foot.textContent).toBe("And 1 fix. Full release notes");
    foot.querySelector("a")!.click();
    expect(base.openExternal).toHaveBeenCalledWith("https://example.test/v0.41.0");
  });

  it("shows at most five titles, Breaking ones first and always, and counts the rest", () => {
    const md = `## [2.0.0] - 2026-11-12
### Added
${[1, 2, 3, 4, 5, 6, 7].map((n) => `- **Added ${n}.** Words.`).join("\n")}
### Breaking
- **Gone.** Words.
### Fixed
- **F1.** Words.
- **F2.** Words.
`;
    const chip = afterUpdate({ version: "2.0.0", previous: "1.0.0", show: true }, { changelog: md })!;
    expect(chip.classList.contains("attention")).toBe(true);
    expect(chip.dataset["tip"]).toBe("Patterpad 2.0.0 is installed. It has a change to check. See what’s new.");
    expect(items()).toEqual(["BreakingGone", "Added 1", "Added 2", "Added 3", "Added 4"]);
    expect(document.querySelector(".whatsnew-foot")!.textContent).toBe("And 3 more changes, and 2 fixes. Full release notes");
  });

  it("puts nothing up on a fresh install or when it's turned off, and only this version for an install from before", () => {
    expect(whatsNewAfterUpdate({ version: "0.41.0", show: true }, { ...base, host: bar() })).toBeNull();
    expect(whatsNewAfterUpdate({ version: "0.41.0", previous: "0.39.0", show: false }, { ...base, host: bar() })).toBeNull();
    expect(document.querySelector(".whatsnew-chip")).toBeNull();
    afterUpdate({ version: "0.41.0", existing: true, show: true });
    expect(heads()).toEqual(["Patterpad 0.41.0"]);
  });

  it("carries the tickbox, ticked, and tells the app when it changes", () => {
    const onShow = vi.fn();
    afterUpdate({ version: "0.41.0", previous: "0.40.0", show: true }, { onShow });
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
    afterUpdate({ version: "0.41.0", previous: "0.40.0", show: true }, { onClose });
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

describe("an announcement", () => {
  const md = `## [0.42.0] - 2026-11-09
### Added
- **Newest.** New.
## [0.41.0] - 2026-11-02
### Announcement
- **Meet Patterstage.** Staged in \`Unity\`. [Find out more](https://patterstage.test), [or not](javascript:void).
### Added
- **The palette.** Cmd+K.
## [0.40.0] - 2026-10-28
### Changed
- **Quieter.** Corners.
## [0.39.0] - 2026-10-22
### Changed
- **Older.** Old.
`;
  const callouts = (): string[] => [...document.querySelectorAll(".whatsnew-announcement")].map((a) => a.textContent!);

  it("sits above every version shown, with its web link opening through the bridge and no other", () => {
    const openExternal = vi.fn();
    afterUpdate({ version: "0.42.0", previous: "0.40.0", show: true }, { changelog: md, openExternal });
    expect(callouts()).toEqual(["Meet Patterstage. Staged in Unity. Find out more, or not."]);
    const body = document.querySelector(".whatsnew-dialog .shell-dialog-body")!;
    expect(body.firstElementChild!.classList.contains("whatsnew-announcement")).toBe(true);
    const links = document.querySelectorAll<HTMLAnchorElement>(".whatsnew-announcement a");
    expect(links.length).toBe(1);
    expect(document.querySelector(".whatsnew-announcement code")?.textContent).toBe("Unity");
    links[0]!.click();
    expect(openExternal).toHaveBeenCalledWith("https://patterstage.test/");
  });

  it("goes with its version: not after an update past it, and gone from Help three versions on", () => {
    afterUpdate({ version: "0.42.0", previous: "0.41.0", show: true }, { changelog: md });
    expect(callouts()).toEqual([]);
    document.body.replaceChildren();
    openWhatsNew({ ...base, changelog: md, version: "0.42.0", show: true });
    expect(callouts().length).toBe(1);
    document.body.replaceChildren();
    const later = `## [0.45.0] - 2026-11-30\n### Added\n- **A.** A.\n## [0.44.0] - 2026-11-23\n### Added\n- **B.** B.\n## [0.43.0] - 2026-11-16\n### Added\n- **C.** C.\n${md}`;
    openWhatsNew({ ...base, changelog: later, version: "0.45.0", show: true });
    expect(callouts()).toEqual([]);
  });
});
