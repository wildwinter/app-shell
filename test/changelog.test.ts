// The changelog as What's New reads it (the October 2026 UI review, step 5a).
import { describe, expect, it } from "vitest";
import { compareVersions, entriesWithoutLead, latestVersions, leadOf, parseChangelog, versionsSince } from "../src/changelog.js";

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

describe("the leads", () => {
  it("takes a bold sentence alone, and a bold phrase with the rest of its sentence", () => {
    expect(leadOf("**Extension views.** An extension can now")).toEqual({ lead: "Extension views.", rest: "" });
    expect(leadOf("**File ▸ Extensions…** opens a tool window. It stays.")).toEqual({ lead: "File ▸ Extensions…", rest: "opens a tool window." });
    expect(leadOf("**Undo instead of \"Are you sure?\"** Deletes report.")).toEqual({ lead: "Undo instead of \"Are you sure?\"", rest: "" });
    expect(leadOf("**The Extensions window** lists them, and is where you manage them:")).toEqual({ lead: "The Extensions window", rest: "lists them, and is where you manage them." });
    expect(leadOf("A bare fix")).toBeUndefined();
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
