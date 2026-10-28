// @vitest-environment node
// Disk stamps (the hands-on review, 2026-10): what an app last read or wrote, so a write refuses to
// overwrite a file changed outside it since.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiskStamps, fileSignature } from "../src/history.js";

const dir = (): string => mkdtempSync(join(tmpdir(), "shell-stamps-"));
/** Change a file the way another app would: new bytes and a later modification time. */
const touchOutside = (p: string, text: string): void => {
  writeFileSync(p, text);
  const later = new Date(Date.now() + 5000);
  utimesSync(p, later, later);
};

describe("disk stamps", () => {
  it("says nothing has changed for a file as noted", () => {
    const d = dir(), a = join(d, "a.txt");
    writeFileSync(a, "one");
    const s = new DiskStamps();
    s.note([a]);
    expect(s.changedSince([a])).toBeUndefined();
    expect(s.has(a)).toBe(true);
  });

  it("names a file changed, or deleted, since it was noted", () => {
    const d = dir(), a = join(d, "a.txt"), b = join(d, "b.txt");
    writeFileSync(a, "one"); writeFileSync(b, "two");
    const s = new DiskStamps();
    s.note([a, b]);
    touchOutside(b, "changed outside");
    expect(s.changedSince([a, b])).toBe(b);
    rmSync(a);
    expect(s.changedSince([a])).toBe(a);
  });

  it("takes the app's own write as seen once it notes it again", () => {
    const d = dir(), a = join(d, "a.txt");
    writeFileSync(a, "one");
    const s = new DiskStamps();
    s.note([a]);
    touchOutside(a, "the app's own write");
    s.note([a]);
    expect(s.changedSince([a])).toBeUndefined();
  });

  it("doesn't ask about a file it never noted, unless the app would have read it", () => {
    const d = dir(), a = join(d, "a.txt");
    const s = new DiskStamps();
    writeFileSync(a, "appeared");
    expect(s.changedSince([a])).toBeUndefined();
    expect(s.changedSince([a], () => true)).toBe(a);
    rmSync(a);
    expect(s.changedSince([a], () => true)).toBeUndefined();
  });

  it("stops asking about a file it forgot", () => {
    const d = dir(), a = join(d, "a.txt");
    writeFileSync(a, "one");
    const s = new DiskStamps();
    s.note([a]);
    s.forget([a]);
    touchOutside(a, "changed");
    expect(s.changedSince([a])).toBeUndefined();
    expect(s.has(a)).toBe(false);
  });

  it("matches exactly the files noted, each unchanged", () => {
    const d = dir(), a = join(d, "a.txt"), b = join(d, "b.txt");
    writeFileSync(a, "one"); writeFileSync(b, "two");
    const s = new DiskStamps();
    s.note([a, b]);
    expect(s.matches([b, a])).toBe(true);
    expect(s.matches([a])).toBe(false);                   // one went from the walk
    expect(s.matches([a, b, join(d, "c.txt")])).toBe(false); // one appeared
    touchOutside(a, "changed");
    expect(s.matches([a, b])).toBe(false);
  });

  it("reads a missing file as gone", () => {
    expect(fileSignature(join(dir(), "nothing.txt"))).toBe("gone");
  });
});
