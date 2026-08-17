// Per-shard version-control state. The shell shipped this module with NO test at
// all, which is how it reached a second app still missing three of the five
// states its author wrote, so these pin the whole grammar and the throttle that
// is the reason the module exists.
import { afterEach, describe, expect, it } from "vitest";
import type { VCFileStatus, VCStatusOptions } from "@wildwinter/simple-vc-lib";
import { shardStatus, resetShardStatus, setStatusReader, REMOTE_STATUS_THROTTLE_MS } from "../src/vc-status.js";

/** A canned reader, recording the options it was asked with. */
function reader(rows: Partial<VCFileStatus>[]) {
  const calls: VCStatusOptions[] = [];
  const fn = (paths: string[], options?: VCStatusOptions): Promise<VCFileStatus[]> => {
    calls.push(options ?? {});
    return Promise.resolve(paths.map((p, i) => ({
      filePath: p, system: "perforce", writable: true, ...rows[i],
    } as VCFileStatus)));
  };
  return { fn, calls };
}

afterEach(() => { setStatusReader(null); resetShardStatus(); });

describe("shardStatus", () => {
  it("reports every local state, not just the writable bit", async () => {
    // The three that a hand-port dropped on the way to the second app.
    const r = reader([{ openedByMe: true, dirty: true }]);
    setStatusReader(r.fn);
    const { states } = await shardStatus([{ key: "s1", path: "/p/one.json", primary: true }]);
    expect(states.get("s1")).toMatchObject({ writable: true, checkedOutByMe: true, dirty: true });
  });

  it("folds several paths onto one key, most actionable winning", async () => {
    const r = reader([{ writable: false }, { dirty: true }, { lockedBy: ["bo@bo-ws"] }]);
    setStatusReader(r.fn);
    const { states } = await shardStatus([
      { key: "s1", path: "/p/a.json", primary: true },
      { key: "s1", path: "/p/b.json" },
      { key: "s1", path: "/p/c.json" },
    ]);
    expect(states.get("s1")).toMatchObject({ writable: false, dirty: true, lockedBy: ["bo@bo-ws"] });
  });

  it("only the PRIMARY path decides untracked", async () => {
    // A scene whose flow file is committed but whose sidecar has never been
    // written is an edited scene, not a new one. Without this the sidecar would
    // make every such scene report "new".
    const r = reader([{ tracked: true }, { tracked: false }]);
    setStatusReader(r.fn);
    const { states } = await shardStatus([
      { key: "s1", path: "/p/flow.json", primary: true },
      { key: "s1", path: "/p/side.json" },
    ]);
    expect(states.get("s1")?.untracked).toBeUndefined();
  });

  it("an untracked primary path does report untracked", async () => {
    const r = reader([{ tracked: false }]);
    setStatusReader(r.fn);
    const { states } = await shardStatus([{ key: "s1", path: "/p/flow.json", primary: true }]);
    expect(states.get("s1")?.untracked).toBe(true);
  });

  it("a key with no primary path never reports untracked", async () => {
    const r = reader([{ tracked: false }]);
    setStatusReader(r.fn);
    const { states } = await shardStatus([{ key: "s1", path: "/p/flow.json" }]);
    expect(states.get("s1")?.untracked).toBeUndefined();
  });

  it("asks the server on the first call and not on the next, but keeps the answer", async () => {
    // The throttle is the whole reason this is a module: the remote bits cost a
    // round-trip, so they are re-queried at most once a window and reused between.
    const r = reader([{ lockedBy: ["bo@bo-ws"], outOfDate: true }]);
    setStatusReader(r.fn);
    const refs = [{ key: "s1", path: "/p/one.json" }];

    const first = await shardStatus(refs);
    expect(r.calls[0]?.remote).toBe(true);
    expect(first.states.get("s1")).toMatchObject({ lockedBy: ["bo@bo-ws"], outOfDate: true });

    // Second call inside the window: local read, cached remote bits overlaid.
    const second = await shardStatus(refs);
    expect(r.calls[1]?.remote).toBe(false);
    expect(second.states.get("s1")).toMatchObject({ lockedBy: ["bo@bo-ws"], outOfDate: true });
  });

  it("coalesces concurrent calls into one query", async () => {
    // A save, a window focus and the poll timer landing together must be ONE
    // spawn, or a lock badge can make typing stutter.
    const r = reader([{}]);
    setStatusReader(r.fn);
    const refs = [{ key: "s1", path: "/p/one.json" }];
    await Promise.all([shardStatus(refs), shardStatus(refs), shardStatus(refs)]);
    expect(r.calls.length).toBe(1);
  });

  it("resetShardStatus drops the window, so a new project re-asks", async () => {
    const r = reader([{}]);
    setStatusReader(r.fn);
    const refs = [{ key: "s1", path: "/p/one.json" }];
    await shardStatus(refs);
    resetShardStatus();
    await shardStatus(refs);
    expect(r.calls.map((c) => c.remote)).toEqual([true, true]);
  });

  it("a failed query reports every shard clean and writable rather than throwing", async () => {
    setStatusReader(() => Promise.reject(new Error("no vcs tooling")));
    const { states, system } = await shardStatus([{ key: "s1", path: "/p/one.json" }]);
    expect(states.get("s1")).toEqual({ writable: true });
    expect(system).toBe("filesystem");
  });

  it("the throttle window is the documented one", () => {
    expect(REMOTE_STATUS_THROTTLE_MS).toBe(15_000);
  });
});
