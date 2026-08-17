// ---------------------------------------------------------------------------
// Per-shard version-control state, over @wildwinter/simple-vc-lib.
//
// The family's, because it follows from the SHAPE rather than from any app's
// subject: these are all Electron apps editing JSON shards in a working copy,
// so they all want to say "locked by Bo" before a save is refused rather than
// after. Patterpad wrote it, Storyletter hand-ported it, and this is the third
// copy becoming the only one.
//
// A SHARD here is just a key and a path: what the key means is the app's
// business (a scene, a deck, a box's three files folded into one row).
//
// THROTTLING, which is the reason this is a module rather than a function call:
// the local bits (`writable` - the on-disk read-only bit a lock VCS keys off)
// are cheap and refresh on every call, so a save re-badges at once. The remote
// bits (`lockedBy` / `outOfDate`) cost a SERVER round-trip under SVN and
// Plastic, so they are re-queried at most once per window and otherwise reused
// from the cache. The query is async (never blocks the main-process event loop)
// and coalesced (a save, a focus and the poll timer arriving together make ONE
// query), so a lock badge can never make typing stutter.
//
// Best-effort throughout: if the query throws (no tooling, broken repo) every
// shard reports clean and writable, and the editor carries on.
// ---------------------------------------------------------------------------

import { fileStatusAsync } from "@wildwinter/simple-vc-lib";
import type { VCFileStatus, VCStatusOptions } from "@wildwinter/simple-vc-lib";

/** One shard to ask about: the key the renderer looks state up by, and its
 *  absolute path on disk. */
export interface ShardRef {
  key: string;
  path: string;
  /**
   * This path is the one that decides whether the KEY is untracked.
   *
   * A key usually spans several files, and "new" is the one state that does not
   * fold by "any of them counts": a scene whose flow file is committed but whose
   * sidecar has never been written is not a new scene, it is an edited one.
   * Patterpad keys off the flow shard for exactly that reason. Mark the canonical
   * path and the rest are ignored for `untracked`; mark none and the key never
   * reports untracked.
   */
  primary?: boolean;
}

/** One shard's version-control state. All-clean is `{ writable: true }`. */
export interface ShardState {
  /** Writable on disk right now. `false` = the read-only bit is set (a lock
   *  VCS has not checked it out yet, or someone else holds it). */
  writable: boolean;
  /** Who else holds it open / locked (e.g. "bo@bo-ws") - we can read it, not
   *  write it. */
  lockedBy?: string[];
  /** A newer revision exists on the server (get latest before editing). */
  outOfDate?: boolean;
  /** WE hold it: checked out / opened by the current user, still ours to edit.
   *  Distinct from `writable`, which says only that the bit is off. */
  checkedOutByMe?: boolean;
  /** Tracked, with local changes not yet committed. */
  dirty?: boolean;
  /** Not in version control yet. Decided by the `primary` path alone (see
   *  `ShardRef.primary`). */
  untracked?: boolean;
}

export interface ShardStatus {
  /** The backend simple-vc-lib actually detected ("git" / "perforce" / ...). */
  system: string;
  states: Map<string, ShardState>;
}

/** How long a remote (server round-trip) answer stays good for. */
export const REMOTE_STATUS_THROTTLE_MS = 15_000;

type StatusReader = (paths: string[], options?: VCStatusOptions) => Promise<VCFileStatus[]>;

let read: StatusReader = fileStatusAsync;
/** What the app calls itself in the one warning this module can emit. */
let logPrefix = "app-shell";
/** Name the app, for that warning. */
export function setVcLogPrefix(name: string): void { logPrefix = name; }
let lastRemoteAt = 0;
let cachedRemoteBits = new Map<string, { lockedBy?: string[]; outOfDate?: boolean }>();
let inFlight: Promise<ShardStatus> | undefined;

/** Test seam, mirroring simple-vc-lib's own `setCommandRunner`: swap the status
 *  reader for canned answers. Pass null to restore the real one. */
export function setStatusReader(reader: StatusReader | null): void {
  read = reader ?? fileStatusAsync;
}

/** Drop the throttle window and the cached remote bits - called when a project
 *  opens, so a new project never inherits the last one's answers. */
export function resetShardStatus(): void {
  lastRemoteAt = 0;
  cachedRemoteBits = new Map();
}

async function query(shards: ShardRef[]): Promise<ShardStatus> {
  const states = new Map<string, ShardState>();
  for (const s of shards) states.set(s.key, { writable: true });
  const keyOf = new Map(shards.map((s) => [s.path, s.key]));
  const isPrimary = new Set(shards.filter((s) => s.primary).map((s) => s.path));
  // Hit the server only when the window has elapsed; otherwise a cheap local read.
  const doRemote = Date.now() - lastRemoteAt >= REMOTE_STATUS_THROTTLE_MS;
  let system = "filesystem";
  try {
    for (const st of await read(shards.map((s) => s.path), { remote: doRemote })) {
      const key = keyOf.get(st.filePath);
      if (key === undefined) continue;
      system = st.system;
      const acc = states.get(key)!;
      if (!st.writable) acc.writable = false;
      // Local bits, cheap on every provider, so never throttled.
      if (st.openedByMe) acc.checkedOutByMe = true;
      if (st.dirty) acc.dirty = true;
      if (st.tracked === false && isPrimary.has(st.filePath)) acc.untracked = true;
      if (doRemote) {   // remote bits are authoritative only on a fresh server query
        if (st.lockedBy?.length) acc.lockedBy = [...new Set([...(acc.lockedBy ?? []), ...st.lockedBy])];
        if (st.outOfDate) acc.outOfDate = true;
      }
    }
    if (doRemote) {   // snapshot the fresh remote bits for the throttled calls that follow
      lastRemoteAt = Date.now();
      cachedRemoteBits = new Map([...states].map(([key, s]) => [key, {
        ...(s.lockedBy !== undefined ? { lockedBy: s.lockedBy } : {}),
        ...(s.outOfDate !== undefined ? { outOfDate: s.outOfDate } : {}),
      }]));
    } else {   // overlay the last known remote bits onto the fresh local snapshot
      for (const [key, acc] of states) {
        const cached = cachedRemoteBits.get(key);
        if (cached?.lockedBy?.length) acc.lockedBy = cached.lockedBy;
        if (cached?.outOfDate) acc.outOfDate = true;
      }
    }
  } catch (e) {
    // Tooling missing, repo error, timeout: everything reads clean + writable.
    console.warn(`${logPrefix}: the version-control status query failed - treating every shard as writable:`, e);
  }
  return { system, states };
}

/** The current state of every shard, throttled + coalesced as above. Never
 *  throws: a failed query yields a clean, writable snapshot. */
export function shardStatus(shards: ShardRef[]): Promise<ShardStatus> {
  if (!inFlight) {
    inFlight = (async () => {
      try { return await query(shards); } finally { inFlight = undefined; }
    })();
  }
  return inFlight;
}
