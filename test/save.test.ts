import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveController, type SaveStatus } from "../src/save.js";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** A writer whose completion the test controls, so mid-write behaviour is
 *  testable rather than a race. */
function deferredWriter() {
  const calls: Array<(ok: boolean) => void> = [];
  let count = 0;
  const write = (): Promise<boolean> => {
    count++;
    return new Promise<boolean>((res) => calls.push((ok) => res(ok)));
  };
  return {
    write,
    get count() { return count; },
    settle(ok = true) { const next = calls.shift(); next?.(ok); },
  };
}

describe("save controller", () => {
  it("debounces: one write after the edits settle", async () => {
    const w = deferredWriter();
    const c = createSaveController({ write: w.write, delayMs: 700 });
    c.touch(); c.touch(); c.touch();
    expect(c.status).toBe("unsaved");
    expect(w.count).toBe(0);
    await vi.advanceTimersByTimeAsync(700);
    expect(w.count).toBe(1);
    w.settle();
    await vi.runOnlyPendingTimersAsync();
    expect(c.status).toBe("saved");
    expect(c.pending).toBe(false);
  });

  it("writes anyway when edits keep arriving: the maximum age", async () => {
    // The bug in Storyletter's debounce, and the reason Patterpad's interval
    // existed. Typing every 300ms would defer a 700ms debounce for ever.
    let writes = 0;
    const c = createSaveController({ write: () => { writes++; return true; }, delayMs: 700, maxWaitMs: 2000 });
    for (let i = 0; i < 20; i++) {
      c.touch();
      await vi.advanceTimersByTimeAsync(300);
    }
    // 6 seconds of steady typing: the debounce alone would have written none.
    expect(writes).toBeGreaterThanOrEqual(2);
  });

  it("a flush during a write waits for it rather than starting a second", async () => {
    const w = deferredWriter();
    const c = createSaveController({ write: w.write, delayMs: 10 });
    c.touch();
    await vi.advanceTimersByTimeAsync(10);
    expect(w.count).toBe(1);
    expect(c.status).toBe("saving");

    const flushed = c.flush();
    expect(w.count).toBe(1);          // not a second writer
    w.settle();
    await flushed;
    expect(c.status).toBe("saved");
  });

  it("an edit arriving mid-write is written afterwards, and the status says so", async () => {
    // Storyletter's flush cleared its queue then awaited, so this case reported
    // "saved" over an edit that had not been written.
    const w = deferredWriter();
    const c = createSaveController({ write: w.write, delayMs: 10 });
    c.touch();
    await vi.advanceTimersByTimeAsync(10);
    c.touch();                        // arrives while the first write is in flight
    expect(c.status).toBe("saving");
    w.settle();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status).toBe("unsaved"); // not "saved": the second edit is not on disk
    await vi.advanceTimersByTimeAsync(10);
    expect(w.count).toBe(2);
    w.settle();
    await vi.runOnlyPendingTimersAsync();
    expect(c.status).toBe("saved");
  });

  it("a failed write stays unsaved and retries", async () => {
    const w = deferredWriter();
    const c = createSaveController({ write: w.write, delayMs: 10 });
    c.touch();
    await vi.advanceTimersByTimeAsync(10);
    w.settle(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.status).toBe("unsaved");
    expect(c.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(w.count).toBe(2);
  });

  it("a thrown write is a failed write, not a crash", async () => {
    const c = createSaveController({ write: () => { throw new Error("disk full"); }, delayMs: 10 });
    c.touch();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.status).toBe("unsaved");
  });

  it("flush with nothing pending writes nothing", async () => {
    const w = deferredWriter();
    const c = createSaveController({ write: w.write });
    await c.flush();
    expect(w.count).toBe(0);
    expect(c.status).toBe("saved");
  });

  it("autosave off stops the clock but not Cmd+S", async () => {
    const w = deferredWriter();
    const c = createSaveController({ write: w.write, delayMs: 10 });
    c.setAuto(false);
    c.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.count).toBe(0);
    expect(c.status).toBe("unsaved");
    const flushed = c.flush();
    w.settle();
    await flushed;
    expect(c.status).toBe("saved");
  });

  it("turning autosave back on writes what is outstanding", async () => {
    const w = deferredWriter();
    const c = createSaveController({ write: w.write, delayMs: 10 });
    c.setAuto(false);
    c.touch();
    await vi.advanceTimersByTimeAsync(1000);
    c.setAuto(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(w.count).toBe(1);
  });

  it("cancel drops the pending write", async () => {
    const w = deferredWriter();
    const c = createSaveController({ write: w.write, delayMs: 10 });
    c.touch();
    c.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.count).toBe(0);
    expect(c.pending).toBe(false);
  });

  it("reports each status change once", async () => {
    const w = deferredWriter();
    const seen: SaveStatus[] = [];
    const c = createSaveController({ write: w.write, delayMs: 10, onStatus: (s) => seen.push(s) });
    c.touch(); c.touch();
    await vi.advanceTimersByTimeAsync(10);
    w.settle();
    await vi.runOnlyPendingTimersAsync();
    expect(seen).toEqual(["unsaved", "saving", "saved"]);
  });
});
