// ---------------------------------------------------------------------------
// The save/dirty controller: the little machine that turns "the author typed
// something" into "the bytes are on disk", and says so on screen.
//
// Both apps wrote one. Neither is complete, and the two are incomplete in
// OPPOSITE directions, which is the clearest argument for a shared one that
// this review has produced:
//
//   - Patterpad runs an INTERVAL (one timer for the app's life, saving any
//     dirty scene every N seconds). Continuous typing is saved throughout, but
//     a single edit can sit unwritten for the whole period.
//   - Storyletter DEBOUNCES (write 700ms after edits settle). A single edit is
//     written promptly, but an author typing steadily is never written at all
//     until they pause - which on a long paragraph is a long time.
//
// So this does both: debounce for promptness, with a MAXIMUM AGE so a run of
// edits cannot outrun the writer. Neither app had the pair; each had half.
//
// The other thing neither had is re-entrancy. Storyletter's flush cleared its
// pending queue and then awaited the write, so a flush arriving mid-write saw
// nothing pending and reported "saved" while bytes were still in the air. Here
// a write in flight is a thing you can await, and the status is only "saved"
// when nothing arrived while it was running.
//
// WHAT THIS DOES NOT OWN is what a save IS. The controller never touches the
// document: it calls the app's `write` and reads its boolean. What is pending,
// how it coalesces, what to repaint afterwards - all of that stays in the app,
// because all of it is about the app's model.
//
// DOM-free, so a test can drive it with fake timers and no window.
// ---------------------------------------------------------------------------

/**
 * Three states, not a boolean.
 *
 * "saving" earns its place: on a slow disk or a slow VC hook a save takes long
 * enough to see, and a status that flips straight from unsaved to saved leaves
 * the author wondering whether the click did anything.
 */
export type SaveStatus = "saved" | "unsaved" | "saving";

export interface SaveControllerOptions {
  /**
   * Write whatever is pending. Return false if it failed: the controller stays
   * "unsaved" and will try again on the next touch or flush, rather than
   * quietly reporting success over a write that did not happen.
   *
   * Called only when something is pending, and never twice at once.
   */
  write: () => Promise<boolean> | boolean;
  /** Told every time the status changes, and only when it changes. */
  onStatus?: (status: SaveStatus) => void;
  /** How long after the last edit to write. Storyletter's 700ms by default. */
  delayMs?: number;
  /**
   * The longest an edit may go unwritten while more keep arriving.
   *
   * This is the interval half of the two apps put back in: without it, steady
   * typing defers the write for as long as the typing lasts.
   */
  maxWaitMs?: number;
}

export interface SaveController {
  /** What the indicator should say. */
  readonly status: SaveStatus;
  /** Is anything unwritten? For a close guard, or an updater asking whether it
   *  may restart. True while a write is in flight, too: it is not on disk yet. */
  readonly pending: boolean;
  /** Something changed. Starts (or extends) the countdown. */
  touch(): void;
  /**
   * Write now, and wait for it.
   *
   * Call on every transition that must see current bytes: switching what is
   * being edited, opening a tool window that reads the disk, closing the
   * window, Cmd+S. Safe to call when nothing is pending (it does nothing) and
   * safe to call during a write (it waits for it, then writes again if more
   * arrived while it ran).
   */
  flush(): Promise<void>;
  /** Give up on what is pending without writing it. For a project close after
   *  the author has said to discard, and for teardown. */
  cancel(): void;
  /**
   * Autosave on or off (Patterpad's per-project setting).
   *
   * Off does not mean "never write": touch() still marks the work unsaved, and
   * flush() still writes on transitions and on Cmd+S. It only stops the clock.
   */
  setAuto(on: boolean): void;
}

export function createSaveController(opts: SaveControllerOptions): SaveController {
  const delayMs = opts.delayMs ?? 700;
  const maxWaitMs = opts.maxWaitMs ?? 5000;

  let status: SaveStatus = "saved";
  let auto = true;
  let dirty = false;
  /** When the oldest unwritten edit arrived, for the maximum age. */
  let dirtySince = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The write in flight, so a second flush awaits it instead of racing it. */
  let inFlight: Promise<void> | undefined;

  const setStatus = (next: SaveStatus): void => {
    if (next === status) return;
    status = next;
    opts.onStatus?.(status);
  };

  const clearTimer = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const arm = (): void => {
    clearTimer();
    if (!auto) return;
    // Never later than maxWaitMs after the first unwritten edit, however much
    // longer the author keeps typing.
    const deadline = dirtySince + maxWaitMs;
    const wait = Math.max(0, Math.min(delayMs, deadline - Date.now()));
    timer = setTimeout(() => { timer = undefined; void run(); }, wait);
  };

  const run = async (): Promise<void> => {
    if (inFlight) return inFlight;          // one writer at a time
    if (!dirty) { setStatus("saved"); return; }
    clearTimer();
    dirty = false;
    setStatus("saving");
    inFlight = (async () => {
      let ok = false;
      try {
        ok = await opts.write();
      } catch {
        // A thrown write is a failed write. The app has already said whatever
        // it wants to say about it; here it only means "still unsaved".
        ok = false;
      }
      if (!ok) {
        // Put the dirt back so the next touch or flush retries, and keep the
        // oldest timestamp: a failing save must not reset the maximum age.
        if (!dirty) { dirty = true; dirtySince = dirtySince || Date.now(); }
      }
      setStatus(dirty ? "unsaved" : "saved");
      if (dirty) arm();                     // more arrived while we wrote, or it failed
    })();
    try {
      await inFlight;
    } finally {
      inFlight = undefined;
    }
  };

  return {
    get status() { return status; },
    get pending() { return dirty || inFlight !== undefined; },
    touch() {
      if (!dirty) dirtySince = Date.now();
      dirty = true;
      // An edit arriving mid-write leaves the status alone: a write really is
      // running, and it will settle to "unsaved" on its own when it lands.
      if (!inFlight) setStatus("unsaved");
      arm();
    },
    async flush() {
      // Await a write already running, then write again if this call's work (or
      // anything that arrived mid-write) is still outstanding.
      if (inFlight) await inFlight;
      if (dirty) await run();
      else setStatus("saved");
    },
    cancel() {
      clearTimer();
      dirty = false;
      setStatus(inFlight ? "saving" : "saved");
    },
    setAuto(on) {
      auto = on;
      if (on) { if (dirty) arm(); } else clearTimer();
    },
  };
}
