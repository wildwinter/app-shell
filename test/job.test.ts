// The long-job kit's contract: progress is throttled, the loop is handed back
// on a slice boundary, cancellation is honoured at the next step, and a
// cancelled job may still hand back what it managed.

import { describe, expect, it } from "vitest";
import { createJobHost, JOB_PROGRESS } from "../src/job.js";
import type { JobProgress } from "../src/job.js";

/** A host on a clock we drive by hand, so nothing here waits on real time. */
function harness(opts: { sliceMs?: number; reportMs?: number } = {}) {
  let clock = 0;
  const sent: JobProgress[] = [];
  const yields: number[] = [];
  const host = createJobHost({
    ...opts,
    now: () => clock,
    yieldToLoop: () => { yields.push(clock); return Promise.resolve(); },
    send: (channel, payload) => {
      expect(channel).toBe(JOB_PROGRESS);
      sent.push(payload);
    },
  });
  return { host, sent, yields, tick: (ms: number) => { clock += ms; }, at: () => clock };
}

describe("the long-job host", () => {
  it("reports the first step at once, then no faster than the report interval", async () => {
    const h = harness({ reportMs: 100, sliceMs: 1000 });
    await h.host.start("coverage", async (ctx) => {
      await ctx.step(1, 10);      // t=0: the first is always sent
      h.tick(50);
      await ctx.step(2, 10);      // too soon
      h.tick(60);
      await ctx.step(3, 10);      // t=110, 110ms since the last report
      return "done";
    });
    expect(h.sent.map((p) => p.done)).toEqual([1, 3]);
    expect(h.sent[0]).toMatchObject({ kind: "coverage", total: 10, elapsedMs: 0 });
    expect(h.sent[1]!.elapsedMs).toBe(110);
  });

  it("always reports the last step, however soon it lands", async () => {
    // Otherwise a fast finish leaves the bar stuck short of the end.
    const h = harness({ reportMs: 100_000 });
    await h.host.start("coverage", async (ctx) => {
      await ctx.step(1, 2);
      await ctx.step(2, 2);
      return null;
    });
    expect(h.sent.map((p) => p.done)).toEqual([1, 2]);
  });

  it("hands the loop back only when a slice has been used up", async () => {
    const h = harness({ sliceMs: 16, reportMs: 0 });
    await h.host.start("coverage", async (ctx) => {
      await ctx.step(1, 4);        // t=0, no yield: no time has passed
      h.tick(5);
      await ctx.step(2, 4);        // t=5, still inside the slice
      h.tick(20);
      await ctx.step(3, 4);        // t=25, a slice has passed: yield
      h.tick(20);
      await ctx.step(4, 4);        // t=45: yield again
      return null;
    });
    expect(h.yields).toEqual([25, 45]);
  });

  it("stops at the next step when cancelled, and keeps the partial result", async () => {
    const h = harness();
    let ran = 0;
    const result = await h.host.start("coverage", async (ctx) => {
      for (let i = 0; i < 100; i++) {
        if (ctx.cancelled) break;
        ran++;
        await ctx.step(i, 100);
        if (i === 4) h.host.cancel("coverage");
      }
      return { ran };
    });
    // Cancel fires at the end of the fifth pass (i === 4); the sixth checks
    // the flag and breaks. Cancellation is a boundary, not an interrupt.
    expect(ran).toBe(5);
    expect(result).toEqual({ cancelled: true, value: { ran: 5 } });
  });

  it("reports a cancelled job as cancelled even if it threw on the way out", async () => {
    const h = harness();
    const result = await h.host.start("coverage", async (ctx) => {
      h.host.cancel("coverage");
      await ctx.step(1, 10);
      throw new Error("torn down mid-flight");
    });
    expect(result).toEqual({ cancelled: true });
  });

  it("surfaces a real failure as an error, not a cancellation", async () => {
    const h = harness();
    const result = await h.host.start("coverage", async () => { throw new Error("bad expression"); });
    expect(result).toEqual({ error: "bad expression" });
  });

  it("refuses a second job of the same kind, and frees the kind when it ends", async () => {
    const h = harness();
    let release: (() => void) | undefined;
    const first = h.host.start("coverage", () => new Promise<string>((r) => { release = () => r("first"); }));
    expect(h.host.running("coverage")).toBe(true);
    expect(await h.host.start("coverage", async () => "second")).toEqual({ error: "a coverage job is already running" });
    // A different kind is unaffected: the lock is per kind, not global.
    expect(await h.host.start("export", async () => "ok")).toEqual({ ok: true, value: "ok" });
    release!();
    expect(await first).toEqual({ ok: true, value: "first" });
    expect(h.host.running("coverage")).toBe(false);
    expect(await h.host.start("coverage", async () => "again")).toEqual({ ok: true, value: "again" });
  });

  it("frees the kind after a failure, so a broken run does not wedge the button", async () => {
    const h = harness();
    await h.host.start("coverage", async () => { throw new Error("boom"); });
    expect(h.host.running("coverage")).toBe(false);
    expect(await h.host.start("coverage", async () => 1)).toEqual({ ok: true, value: 1 });
  });

  it("cancelling a kind that is not running is harmless", () => {
    const h = harness();
    expect(() => h.host.cancel("coverage")).not.toThrow();
  });
});
