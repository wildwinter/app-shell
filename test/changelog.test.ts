// The changelog as What's New reads it (the October 2026 UI review, step 5a).
import { describe, expect, it } from "vitest";
import { changelogProblems, compareVersions, entriesWithoutLead, latestVersions, leadOf, parseChangelog, versionsSince } from "../src/changelog.js";

const MD = `# Changelog

## [Unreleased]

### Added

- **A command palette.** Press Cmd+K.

## [0.40.0] - 2026-10-28

### Added

- **Extension views.** An extension can now bring views of its own,
  which open in a floating window.
- **File ▸ Extensions…** opens a tool window listing every extension. It stays open.
  - **Add Extension…** takes one in.
- **Undo instead of "Are you sure?"** Deletes report with Undo.

### Changed

- **Quieter corners**, and white fields.

### Fixed

- **Checkboxes follow the palette**, not the system.
- A bare fix with no bold.

## [0.39.0] - 2026-10-22

### Highlights

- **Only this.** The chosen one.

### Added

- **Not this.** Hidden by the highlights.

## [0.10.0] - 2026-09-01

### Changed

- **Ten.** A double-digit minor.
`;

describe("the previews", () => {
  it("takes the bold lede and the rest of the first paragraph, whole sentences", () => {
    expect(leadOf("**Extension views.** An extension can now")).toEqual({ lead: "Extension views.", rest: "An extension can now" });
    expect(leadOf("**File ▸ Extensions…** opens a tool window. It stays.")).toEqual({ lead: "File ▸ Extensions…", rest: "opens a tool window. It stays." });
    expect(leadOf("**Undo instead of \"Are you sure?\"** Deletes report.")).toEqual({ lead: "Undo instead of \"Are you sure?\"", rest: "Deletes report." });
    expect(leadOf("**The Extensions window** lists them, and is where you manage them:")).toEqual({ lead: "The Extensions window", rest: "lists them, and is where you manage them." });
    expect(leadOf("A bare fix")).toBeUndefined();
  });
  it("stops at a sentence end before the cap, and always completes a bold phrase", () => {
    const six = "One two three four five six.";
    expect(leadOf(`**A lede.** ${six} ${six} ${six}`, 16)).toEqual({ lead: "A lede.", rest: `${six} ${six}` });
    expect(leadOf("**A phrase** that runs on for one two three four five six seven eight words. Then more.", 6)).toEqual({ lead: "A phrase", rest: "that runs on for one two three four five six seven eight words." });
    expect(leadOf("**Versions.** 1.0.1 and 1.0.2 are fixes, in `a.b` too. Done.")).toEqual({ lead: "Versions.", rest: "1.0.1 and 1.0.2 are fixes, in `a.b` too. Done." });
    // A long sentence in the middle ends the preview; a short one after it is never shown with the middle left out.
    expect(leadOf(`**A lede.** Short. ${six} ${six} Tiny.`, 8)).toEqual({ lead: "A lede.", rest: "Short." });
  });
});

describe("parseChangelog", () => {
  const all = parseChangelog(MD);
  it("reads each version, its date, its headlines and its fixes", () => {
    expect(all.map((v) => [v.version, v.date])).toEqual([["Unreleased", undefined], ["0.40.0", "2026-10-28"], ["0.39.0", "2026-10-22"], ["0.10.0", "2026-09-01"]]);
    const v40 = all[1]!;
    expect(v40.headlines.map((h) => h.lead)).toEqual(["Extension views.", "File ▸ Extensions…", "Undo instead of \"Are you sure?\"", "Quieter corners"]);
    expect(v40.headlines[3]!.rest).toBe(", and white fields.");
    expect(v40.fixes).toBe(2);
    expect(v40.fixed.map((h) => h.lead)).toEqual(["Checkboxes follow the palette", "A bare fix with no bold."]);
    expect(v40.carrier).toBe(false);
  });
  it("puts Breaking first and marks it, and folds a version that only carries another release", () => {
    const md = `## [0.45.0] - 2026-11-05
### Breaking
- **Timing is a speed.** Not syllables.
### Changed
- **Patterplay 0.45.0 inside**, with the timing above.
## [0.44.0] - 2026-11-04
### Changed
- **Patterplay 0.44.0 inside**, for lip-sync.
## [0.46.2] - 2026-11-06
### Changed
- **Nothing changed in the runtime**, which went out with Ogg Vorbis.
### Fixed
- **A fix.** Fixed.
`;
    const [v45, v44, v462] = parseChangelog(md);
    expect(v45!.headlines).toEqual([{ lead: "Timing is a speed.", rest: "Not syllables.", breaking: true }, { lead: "Patterplay 0.45.0 inside", rest: ", with the timing above." }]);
    expect(v45!.carrier).toBe(false);
    expect(v44!.carrier).toBe(true);
    expect(v462!.carrier).toBe(false);
  });
  it("refuses what reads as written for the makers, not the reader", () => {
    const md = `## [1.0.0] - 2026-11-08
### Changed
- **1.0.0.**
- **A lede that goes on and on and on for far too many words to be a lede at all.** Then more.
- **@patterkit/ops 1.0.0** is out.
- **Fine.** A sentence after it.
- No lede.
`;
    expect(changelogProblems(md, "1.0.0").map((p) => [p.entry.text.slice(0, 12), p.problem.split(/[;:]/)[0]])).toEqual([
      ["**1.0.0.**", "a label with nothing after it"],
      ["**A lede tha", "the lede runs to 20 words"],
      ["**@patterkit", "a package name in the lede"],
      ["No lede.", "no bold lede for What's New to show"],
    ]);
    expect(changelogProblems(MD, "0.39.0")).toEqual([]);
  });
  it("leaves nested points to the full notes, and lets Highlights choose", () => {
    expect(all[1]!.headlines.some((h) => h.lead.startsWith("Add Extension"))).toBe(false);
    expect(all[2]!.headlines.map((h) => h.lead)).toEqual(["Only this."]);
  });
  it("finds an entry a release can't headline", () => {
    expect(entriesWithoutLead(MD, "0.40.0").map((e) => e.text)).toEqual(["A bare fix with no bold."]);
    expect(entriesWithoutLead(MD, "Unreleased")).toEqual([]);
  });
});

describe("which versions", () => {
  const all = parseChangelog(MD);
  it("compares versions as numbers, a pre-release before its release", () => {
    expect(compareVersions("0.10.0", "0.9.2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("v0.40.0", "0.40.0")).toBe(0);
  });
  it("since the last run: released ones after it, up to this one, newest first; nothing on a fresh install", () => {
    expect(versionsSince(all, "0.10.0", "0.40.0").map((v) => v.version)).toEqual(["0.40.0", "0.39.0"]);
    expect(versionsSince(all, "0.39.0", "0.39.0")).toEqual([]);
    expect(versionsSince(all, undefined, "0.40.0")).toEqual([]);
  });
  it("Help shows the latest few up to this one, never Unreleased", () => {
    expect(latestVersions(all, "0.40.0", 2).map((v) => v.version)).toEqual(["0.40.0", "0.39.0"]);
    expect(latestVersions(all, "0.39.0").map((v) => v.version)).toEqual(["0.39.0", "0.10.0"]);
  });
});

describe("announcements", () => {
  const md = `## [0.41.0] - 2026-11-02
### Announcement
- **Meet Patterstage.** Patter stories, staged in **Unity** and Godot.
  [Find out more](https://patterstage.test) or run \`npm i\`.
- **A plain title**
### Added
- **The palette.** Cmd+K.
## [0.40.0] - 2026-10-28
### Added
- **Older.** Old.
`;
  const [v41, v40] = parseChangelog(md);

  it("reads each entry's bold title and the rest, links and code kept, apart from the headlines", () => {
    expect(v41!.announcements).toEqual([
      { title: "Meet Patterstage.", body: "Patter stories, staged in Unity and Godot. [Find out more](https://patterstage.test) or run `npm i`." },
      { title: "A plain title", body: "" },
    ]);
    expect(v41!.headlines).toEqual([{ lead: "The palette.", rest: "Cmd+K." }]);
    expect(v40!.announcements).toEqual([]);
  });

  it("holds an announcement to the release check's rule: a bold title", () => {
    expect(entriesWithoutLead(`## [1.0.0] - 2026-11-02\n### Announcement\n- No title here.\n`, "1.0.0").map((e) => e.text)).toEqual(["No title here."]);
  });
});
