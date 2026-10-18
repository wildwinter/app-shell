// @vitest-environment node
// The file-byte history (patterkit design/patterpad-undo.md, rulings 2 and 5):
// steps, coalescing, the cap, folding, the drift refusal that drops every step
// below, the per-file restore hook, and the app's own writer.

import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { History, UNDO_LIMIT, applyStates, captureBefore } from "../src/history.js";
import type { FileRestorer, FileState } from "../src/history.js";

const dir = (): string => mkdtempSync(join(tmpdir(), "shell-history-"));
const read = (p: string): string | null => (existsSync(p) ? readFileSync(p, "utf8") : null);

/** Write through the history as an app's commit does: capture, write, record. */
async function commit(h: History, label: string, key: string, writes: FileState[]): Promise<void> {
  const before = captureBefore(writes.map((w) => w.path));
  const applied = await applyStates(writes);
  expect(applied.ok).toBe(true);
  h.record(label, key, before, writes);
}

describe("the file-byte history", () => {
  it("undoes and redoes to the exact bytes, a created file removed and put back", async () => {
    const d = dir();
    const a = join(d, "a.txt"), b = join(d, "b.txt");
    writeFileSync(a, "one");
    const h = new History();
    await commit(h, "Edit", "k1", [{ path: a, content: "two" }, { path: b, content: "new" }]);
    expect(h.undoLabel).toBe("Edit");
    expect(await h.applyUndo()).toEqual({ ok: true, label: "Edit" });
    expect([read(a), read(b)]).toEqual(["one", null]);
    expect(await h.applyRedo()).toEqual({ ok: true, label: "Edit" });
    expect([read(a), read(b)]).toEqual(["two", "new"]);
    expect(await h.applyRedo()).toBeUndefined();
  });

  it("merges a repeated key into one step, keeping the earliest before and the latest after", async () => {
    const d = dir();
    const a = join(d, "a.txt");
    writeFileSync(a, "x");
    const h = new History();
    await commit(h, "Type", "field", [{ path: a, content: "xy" }]);
    await commit(h, "Type", "field", [{ path: a, content: "xyz" }]);
    await h.applyUndo();
    expect(read(a)).toBe("x");
    expect(h.canUndo).toBe(false);
  });

  it("keeps a hundred steps", () => {
    const h = new History();
    for (let i = 0; i < 150; i++) h.record(`step ${i}`, `s:${i}`, [], []);
    let steps = 0;
    while (h.undo() !== undefined) steps++;
    expect(steps).toBe(UNDO_LIMIT);
  });

  it("refuses an undo when a file changed since, names it, and drops that step and every step below", async () => {
    const d = dir();
    const a = join(d, "a.txt"), b = join(d, "b.txt");
    writeFileSync(a, "1"); writeFileSync(b, "1");
    const h = new History();
    await commit(h, "First", "k1", [{ path: b, content: "2" }]);
    await commit(h, "Second", "k2", [{ path: a, content: "2" }]);
    writeFileSync(a, "pulled");   // a pull, a merge, another app
    const out = await h.applyUndo();
    expect(out).toMatchObject({ ok: false, label: "Second", drift: [a] });
    expect(out && !out.ok && out.error).toContain("a.txt has changed since");
    expect(read(a)).toBe("pulled");   // nothing overwritten
    expect(h.canUndo).toBe(false);    // "First" went with it
    expect(read(b)).toBe("2");
  });

  it("refuses a redo the same way", async () => {
    const d = dir();
    const a = join(d, "a.txt");
    writeFileSync(a, "1");
    const h = new History();
    await commit(h, "Edit", "k", [{ path: a, content: "2" }]);
    await h.applyUndo();
    writeFileSync(a, "elsewhere");
    expect(await h.applyRedo()).toMatchObject({ ok: false, drift: [a] });
    expect(read(a)).toBe("elsewhere");
    expect(h.canRedo).toBe(false);
  });

  it("lets a restorer decide what drift is and what is written, file by file", async () => {
    const d = dir();
    const scene = join(d, "s.patterx");
    // The trail line moves on every save; the rest is what the step is about.
    const trail: FileRestorer = {
      same: (expected, current) => body(expected) === body(current),
      restore: (target, current) => `${body(target)}\ntrail:${trailOf(current)}+undo`,
    };
    const body = (t: string | null): string => (t ?? "").split("\ntrail:")[0]!;
    const trailOf = (t: string | null): string => (t ?? "").split("\ntrail:")[1] ?? "";
    writeFileSync(scene, "status:draft\ntrail:t1");
    const h = new History({ restorer: (p) => (p.endsWith(".patterx") ? trail : undefined) });
    await commit(h, "Status", "k", [{ path: scene, content: "status:done\ntrail:t2" }]);
    writeFileSync(scene, "status:done\ntrail:t3");   // a save moved the trail only: not drift
    expect(await h.applyUndo()).toEqual({ ok: true, label: "Status" });
    expect(read(scene)).toBe("status:draft\ntrail:t3+undo");
  });

  it("writes through the app's own writer, and puts the step back when it fails", async () => {
    const d = dir();
    const a = join(d, "a.txt");
    writeFileSync(a, "1");
    const seen: FileState[][] = [];
    let fail = true;
    const h = new History({
      write: async (states) => {
        seen.push(states);
        if (fail) return { ok: false, error: "a.txt is locked by bob", wrote: false };
        return applyStates(states);
      },
    });
    await commit(h, "Edit", "k", [{ path: a, content: "2" }]);
    expect(await h.applyUndo()).toEqual({ ok: false, label: "Edit", error: "a.txt is locked by bob" });
    expect(h.canUndo).toBe(true);
    fail = false;
    expect(await h.applyUndo()).toEqual({ ok: true, label: "Edit" });
    expect(read(a)).toBe("1");
    expect(seen).toHaveLength(2);
  });

  it("folds a write nobody asked for into the last step", async () => {
    const d = dir();
    const a = join(d, "a.txt"), side = join(d, "side.txt");
    writeFileSync(a, "1");
    const h = new History();
    await commit(h, "Edit", "k", [{ path: a, content: "2" }]);
    const before = captureBefore([side]);
    await applyStates([{ path: side, content: "colour" }]);
    h.fold(before, [{ path: side, content: "colour" }]);
    await h.applyUndo();
    expect([read(a), read(side)]).toEqual(["1", null]);
  });

  it("leaves bookkeeping outside version control out of the drift check", async () => {
    const d = dir();
    const a = join(d, "a.txt"), rec = join(d, "remote.json");
    writeFileSync(a, "1"); writeFileSync(rec, "r1");
    const h = new History();
    await commit(h, "Edit", "k", [{ path: a, content: "2" }, { path: rec, content: "r2", local: true }]);
    writeFileSync(rec, "r3");
    expect(await h.applyUndo()).toEqual({ ok: true, label: "Edit" });
    expect([read(a), read(rec)]).toEqual(["1", "r1"]);
  });

  it("clears redo when the host asks", async () => {
    const d = dir();
    const a = join(d, "a.txt");
    writeFileSync(a, "1");
    const h = new History();
    await commit(h, "Edit", "k", [{ path: a, content: "2" }]);
    await h.applyUndo();
    expect(h.canRedo).toBe(true);
    h.clearRedo();
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(false);
  });
});
