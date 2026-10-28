// ---------------------------------------------------------------------------
// The file-byte history: undo and redo for writes an app makes to files, the
// files-are-truth way. A step is a set of file-state transitions (a path's
// content before and after, null meaning absent); undo writes the befores
// back, redo the afters. No command log: the bytes on disk are the model, so
// restoring bytes is undo.
//
// Storyletter's, lifted into the shell (patterkit design/patterpad-undo.md,
// ruling 2) so Patterpad's project-level undo is the same code. The two apps'
// DOCUMENT undo still shares nothing (Patterpad's open scene is ProseMirror's);
// this is the file half only.
//
// Three things beyond Storyletter's first version:
//
// - DRIFT IS REFUSED (ruling 5). Before an undo or redo, each file must still
//   say what the step left it saying (its after, for an undo; its before, for a
//   redo). A file changed since, by a pull, a merge or another app, would have
//   that work overwritten, so the step is refused, naming the file, and dropped
//   with every step below it: none of them can now be applied safely.
// - A PER-FILE RESTORE HOOK, for a file an app restores its own way (Patterpad
//   restores a `.patterx` block by block but stamps its edit trail afresh, which
//   moves on every save and so must not count as drift).
// - THE WRITER IS THE APP'S. Patterpad writes through its own ordered queue;
//   `applyStates` (all or nothing through the VC layer) is the default.
//
// Main-process code: it reads and writes files.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { deleteFileAsync, writeTextFilesAsync } from "@wildwinter/simple-vc-lib";
import type { VCWriteOutcome } from "@wildwinter/simple-vc-lib";

/** A file's content, or null when the file is absent (created / deleted). */
export interface FileState {
  path: string;
  content: string | null;
  /** Bookkeeping that lives beside the project but outside version control: restored with plain writes,
   *  never checked out or added, once the versioned files have landed. */
  local?: boolean;
}

/** Read the current on-disk state of a set of paths. */
export function captureBefore(paths: string[]): FileState[] {
  return paths.map((path) => ({ path, content: existsSync(path) ? readFileSync(path, "utf8") : null }));
}

/** What applying a set of states came to. `wrote` says whether the writes landed before something else (a
 *  delete) failed, which decides whether there is now a change on disk for the history to know about. */
export type Applied = { ok: true } | { ok: false; error: string; wrote: boolean };

/** How a set of states is written: `applyStates`, or the app's own write path. */
export type StateWriter = (states: FileState[]) => Promise<Applied>;

/**
 * Apply file states through the VC layer: write content, or delete when null.
 *
 * ALL OR NOTHING, and off the main thread (simple-vc-lib 0.5.0): every file is checked out first, and if any
 * one is refused nothing is written. The deletes run only once the whole batch has landed, so a rename whose
 * new path was refused never loses the old file.
 */
export async function applyStates(all: FileState[]): Promise<Applied> {
  const states = all.filter((s) => s.local !== true);
  const writes = states.filter((s) => s.content !== null).map((s) => ({ filePath: s.path, content: s.content! }));
  if (writes.length > 0) {
    try {
      const batch = await writeTextFilesAsync(writes, "utf8", { allOrNothing: true });
      if (!batch.success) return { ok: false, error: writeFailure(batch.results), wrote: false };
    } catch (e) {
      return { ok: false, error: `couldn't save: ${e instanceof Error ? e.message : String(e)}`, wrote: false };
    }
  }
  const undeleted: string[] = [];
  for (const s of states) {
    if (s.content !== null || !existsSync(s.path)) continue;
    try {
      const gone = await deleteFileAsync(s.path);
      if (!gone.success) undeleted.push(`${basename(s.path)} (${gone.message || gone.status})`);
    } catch (e) {
      undeleted.push(`${basename(s.path)} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  if (undeleted.length > 0) return { ok: false, error: `couldn't delete ${undeleted.join("; ")}`, wrote: writes.length > 0 };
  // The bookkeeping last, and only once the project's own files have landed, so it never says the project is
  // at a revision its files are not.
  for (const s of all) {
    if (s.local !== true) continue;
    if (s.content === null) rmSync(s.path, { force: true });
    else writeFileSync(s.path, s.content, "utf8");
  }
  return { ok: true };
}

/**
 * What a refused batch says: the file, and why. A refusal names who holds it ("'docks.storyletdeck' is locked
 * by bob@bob-ws"); every other file in an all-or-nothing batch reports only that it was not prepared because of
 * that one, which is not worth repeating.
 */
export function writeFailure(results: VCWriteOutcome[]): string {
  const failed = results.filter((r) => !r.success);
  const refused = failed.filter((r) => r.status === "locked" || r.status === "outOfDate");
  const say = (r: VCWriteOutcome): string => {
    const name = basename(r.filePath);
    const why = r.message || r.status;
    return why.includes(name) ? why : `${name} (${why})`;
  };
  if (refused.length > 0) return `nothing was saved: ${refused.map(say).join("; ")}`;
  return `couldn't save ${failed.map(say).join("; ") || "the project"}`;
}

// --- disk stamps ---------------------------------------------------------------------------------------
// An app builds each write from the files as it last read them, a whole shard at a time, so writing over a
// file that has changed since (a pull in a terminal, a synced folder, another app) would silently throw that
// change away (the hands-on review, 2026-10). The stamps remember what the app last read or wrote, file by
// file, and a write asks them first. The undo's drift check above compares content; this compares a stat,
// so it costs nothing to ask before every write.

/** A file's modification time and size as one string, or "gone" when it isn't there. */
export function fileSignature(path: string): string {
  try { const st = statSync(path); return `${st.mtimeMs}\u0000${st.size}`; } catch { return "gone"; }
}

/** What an app last read or wrote, by file, to tell a file changed outside it since. */
export class DiskStamps {
  private readonly seen = new Map<string, string>();

  /** Remember these files as they are now: call it right after reading or writing them. */
  note(paths: Iterable<string>): void {
    for (const path of paths) { const file = resolve(path); this.seen.set(file, fileSignature(file)); }
  }

  /** Forget these files: the next write of them isn't checked until they're read again. */
  forget(paths: Iterable<string>): void {
    for (const path of paths) this.seen.delete(resolve(path));
  }

  /** Forget every file (another project, or a fresh read of the whole of this one). */
  clear(): void { this.seen.clear(); }

  /** Is this file remembered? */
  has(path: string): boolean { return this.seen.has(resolve(path)); }

  /**
   * The first of `paths` that has changed since it was noted, or undefined. A file never noted is asked
   * about only when `covers` says the app would have read it, and then it was expected not to exist: a file
   * that has appeared since counts as changed.
   */
  changedSince(paths: Iterable<string>, covers?: (file: string) => boolean): string | undefined {
    for (const path of paths) {
      const file = resolve(path);
      const was = this.seen.get(file) ?? (covers?.(file) ? "gone" : undefined);
      if (was !== undefined && fileSignature(file) !== was) return file;
    }
    return undefined;
  }

  /** Are the noted files exactly `paths`, each unchanged? False when one has changed, appeared, or gone. */
  matches(paths: Iterable<string>): boolean {
    let count = 0;
    for (const path of paths) {
      const file = resolve(path);
      const was = this.seen.get(file);
      if (was === undefined || fileSignature(file) !== was) return false;
      count++;
    }
    return count === this.seen.size;
  }
}

/** How many steps Undo keeps: ProseMirror's default depth, the same in both apps. A step holds whole files
 *  before and after, so an uncapped stack grew for as long as the window stayed open. */
export const UNDO_LIMIT = 100;

/**
 * A file an app restores its own way. `same` says whether the file on disk still says what the step expects
 * (the drift check), and `restore` gives the content to write for the target, from what is on disk now. A
 * `.patterx` compares and restores every block but its edit trail, which the undo stamps afresh.
 */
export interface FileRestorer {
  same(expected: string | null, current: string | null): boolean;
  restore(target: string | null, current: string | null): string | null;
}

export interface HistoryOptions {
  /** How an undo or redo is written. Default `applyStates`. */
  write?: StateWriter;
  /** A restorer for a file the app restores its own way, by path; undefined for every other file. */
  restorer?: (path: string) => FileRestorer | undefined;
  /** How each file's current bytes are read for the drift check. Default from disk (`captureBefore`). */
  read?: (paths: string[]) => FileState[];
}

/** What an undo or redo came to. `drift` names the files that changed since the step, when that refused it. */
export type StepOutcome =
  | { ok: true; label: string }
  | { ok: false; label: string; error: string; drift?: string[] };

interface Entry {
  label: string;
  key: string;
  before: FileState[];
  after: FileState[];
}

/** Merge state lists by path, `override` winning. */
function mergeStates(base: FileState[], override: FileState[]): FileState[] {
  const byPath = new Map<string, FileState>();
  for (const s of base) byPath.set(s.path, s);
  for (const s of override) byPath.set(s.path, s);
  return [...byPath.values()];
}

/** File names, as a refusal lists them. */
const listNames = (paths: string[]): string => paths.map((p) => basename(p)).join(", ");

export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private readonly opts: HistoryOptions;

  constructor(opts: HistoryOptions = {}) {
    this.opts = opts;
  }

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  /** The labels of the next undo and redo, for a menu ("Undo Rename Card"). */
  get undoLabel(): string | undefined { return this.undoStack[this.undoStack.length - 1]?.label; }
  get redoLabel(): string | undefined { return this.redoStack[this.redoStack.length - 1]?.label; }

  /** Record a committed change; coalesce with the top entry when the key matches (the same logical edit
   *  continuing, as typing into one field). A new distinct edit clears redo. */
  record(label: string, key: string, before: FileState[], after: FileState[]): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.key === key) {
      top.before = mergeStates(before, top.before);   // keep the earliest before per path
      top.after = mergeStates(top.after, after);       // keep the latest after per path
    } else {
      this.undoStack.push({ label, key, before, after });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Fold a write the app made on its own into the step the author took last, rather than recording a step of
   * its own: for a write nobody asked for (a value stored the first time a view is drawn), which a step of its
   * own would have the author's next Undo undo instead of what they meant. With nothing to undo yet, there is
   * nothing to fold into, and the write simply stands.
   */
  fold(before: FileState[], after: FileState[]): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (!top) return;
    const known = new Set(top.before.map((s) => s.path));
    top.before = [...top.before, ...before.filter((s) => !known.has(s.path))];
    top.after = mergeStates(top.after, after);
  }

  /** Move the top undo entry to redo and return its before-states, for a caller that writes them itself (and
   *  checks drift itself). Most callers want `applyUndo`. */
  undo(): FileState[] | undefined {
    const entry = this.undoStack.pop();
    if (!entry) return undefined;
    this.redoStack.push(entry);
    return entry.before;
  }

  /** Move the top redo entry to undo and return its after-states (see `undo`). */
  redo(): FileState[] | undefined {
    const entry = this.redoStack.pop();
    if (!entry) return undefined;
    this.undoStack.push(entry);
    return entry.after;
  }

  /** Forget every undone step: for a host that changes the files on its own (a step merged into the last one,
   *  a reload), after which redoing what was undone would put back the wrong bytes. */
  clearRedo(): void {
    this.redoStack = [];
  }

  /** An undo whose states could not be written: the step goes back where it was, so the author can try again
   *  once the file can be written. */
  undoFailed(): void {
    const entry = this.redoStack.pop();
    if (entry) this.undoStack.push(entry);
  }

  /** The same for a redo that could not be written. */
  redoFailed(): void {
    const entry = this.undoStack.pop();
    if (entry) this.redoStack.push(entry);
  }

  /**
   * Undo the top step: check every file still says what the step left it saying, then write its befores. A
   * file that has changed since refuses the undo, and the step is dropped with every step below it (they were
   * taken on top of what has now been overwritten). A write that fails puts the step back. Undefined when there
   * is nothing to undo.
   */
  async applyUndo(): Promise<StepOutcome | undefined> {
    return this.apply("undo");
  }

  /** Redo the top undone step, by the same rules: drift drops it and every step above it on the redo stack. */
  async applyRedo(): Promise<StepOutcome | undefined> {
    return this.apply("redo");
  }

  private async apply(way: "undo" | "redo"): Promise<StepOutcome | undefined> {
    const from = way === "undo" ? this.undoStack : this.redoStack;
    const entry = from[from.length - 1];
    if (!entry) return undefined;
    const expected = way === "undo" ? entry.after : entry.before;
    const target = way === "undo" ? entry.before : entry.after;
    const restorer = this.opts.restorer;
    const current = new Map((this.opts.read ?? captureBefore)(target.map((s) => s.path)).map((s) => [s.path, s.content]));

    // The drift check, over every file the step touches.
    const drifted = expected.filter((s) => {
      if (s.local === true) return false;   // bookkeeping outside version control is the app's own
      const now = current.get(s.path) ?? null;
      const r = restorer?.(s.path);
      return r ? !r.same(s.content, now) : now !== s.content;
    }).map((s) => s.path);
    if (drifted.length > 0) {
      // Every step from here down was taken on top of what has changed: none can be applied safely.
      from.length = 0;
      const name = drifted.length === 1 ? `${basename(drifted[0]!)} has` : `${listNames(drifted)} have`;
      return {
        ok: false, label: entry.label, drift: drifted,
        error: `couldn't ${way} "${entry.label}": ${name} changed since, so ${way === "undo" ? "undoing" : "redoing"} it would overwrite that. `
          + `Nothing from that step ${way === "undo" ? "back" : "on"} can be ${way === "undo" ? "undone" : "redone"} now.`,
      };
    }

    const states = target.map((s) => {
      const r = restorer?.(s.path);
      return r ? { ...s, content: r.restore(s.content, current.get(s.path) ?? null) } : s;
    });
    from.pop();
    (way === "undo" ? this.redoStack : this.undoStack).push(entry);
    const applied = await (this.opts.write ?? applyStates)(states);
    if (!applied.ok) {
      if (way === "undo") this.undoFailed(); else this.redoFailed();
      return { ok: false, label: entry.label, error: applied.error };
    }
    return { ok: true, label: entry.label };
  }
}
