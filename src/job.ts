// ---------------------------------------------------------------------------
// The long-job kit (main process): run a piece of work that takes long enough
// to need a progress bar and a Cancel button, without freezing the app.
//
// The shape every editor in the family needs: coverage sweeps, big exports,
// corpus runs. One kind of job at a time, progress reported to the windows
// that asked for it, cancellation honoured at the next yield point, and a
// partial result when the work can offer one.
//
// COOPERATIVE, NOT PARALLEL. The work still runs in the main process; it just
// stops hogging it. `ctx.step()` is both the progress report and the yield:
// the work hands the event loop back every few milliseconds, so IPC keeps
// flowing, the renderer keeps painting, and Cancel is heard. The alternative
// (a utilityProcess or a worker) buys true parallelism at the cost of
// serialising the job's inputs and outputs across a process boundary, and a
// second entry point per app. Reach for that only when the work is heavy
// enough that a responsive main process is not enough.
//
// Electron is an OPTIONAL peer here: nothing in this file imports it. The host
// supplies `send`, so the kit is testable headlessly and usable from any
// message transport.
// ---------------------------------------------------------------------------

/** The channel a host should send progress on, and the shape it carries. */
export const JOB_PROGRESS = "job:progress";

export interface JobProgress {
  /** Which job this is about ("coverage"), so one listener can serve many. */
  kind: string;
  /** Units finished and expected. `total` 0 means "no idea yet". */
  done: number;
  total: number;
  /** Milliseconds since the job started, for elapsed + estimated remaining. */
  elapsedMs: number;
}

/** What the work is given: a cancellation flag and the one call that both
 *  reports progress and yields. */
export interface JobContext {
  /** True once someone has cancelled. Check it to bail out early, or to
   *  return a partial result rather than nothing. */
  readonly cancelled: boolean;
  /** Report progress and, when enough time has passed, hand the event loop
   *  back. Await it: that await IS the yield. */
  step(done: number, total: number): Promise<void>;
}

export type JobResult<T> =
  | { ok: true; value: T }
  | { cancelled: true; value?: T }
  | { error: string };

export interface JobHost {
  /** Run `work` as the job of this kind. Rejects a second start of the same
   *  kind while one is in flight (the caller should have disabled the button;
   *  this is the backstop). */
  start<T>(kind: string, work: (ctx: JobContext) => Promise<T>): Promise<JobResult<T>>;
  /** Ask the running job of this kind to stop. It stops at its next step(). */
  cancel(kind: string): void;
  running(kind: string): boolean;
}

export interface JobHostOptions {
  /** Deliver a progress message to whoever is watching (typically
   *  `window.webContents.send(JOB_PROGRESS, payload)` for each live window). */
  send: (channel: string, payload: JobProgress) => void;
  /** How long the work may hold the event loop between yields (default 16ms,
   *  about one frame). Smaller is smoother and slower. */
  sliceMs?: number;
  /** How often a progress message may be sent (default 100ms). Progress is
   *  for a human to read; flooding the channel just costs IPC. */
  reportMs?: number;
  /** Injectable clock + yield, for tests. */
  now?: () => number;
  yieldToLoop?: () => Promise<void>;
}

const defaultYield = (): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, 0); });

export function createJobHost(opts: JobHostOptions): JobHost {
  const now = opts.now ?? (() => Date.now());
  const handOver = opts.yieldToLoop ?? defaultYield;
  const sliceMs = opts.sliceMs ?? 16;
  const reportMs = opts.reportMs ?? 100;
  const live = new Map<string, { cancelled: boolean }>();

  return {
    running: (kind) => live.has(kind),

    cancel(kind) {
      const job = live.get(kind);
      if (job) job.cancelled = true;
    },

    async start<T>(kind: string, work: (ctx: JobContext) => Promise<T>): Promise<JobResult<T>> {
      if (live.has(kind)) return { error: `a ${kind} job is already running` };
      const job = { cancelled: false };
      live.set(kind, job);

      const started = now();
      let lastYield = started;
      // A flag, not a timestamp sentinel: on a clock that can legitimately
      // read 0, "never reported yet" and "reported at 0" must not be the
      // same state. The first step always reports, so the bar moves at once.
      let reported = false;
      let lastReport = 0;

      const ctx: JobContext = {
        get cancelled() { return job.cancelled; },
        async step(done: number, total: number): Promise<void> {
          const at = now();
          if (!reported || at - lastReport >= reportMs || done >= total) {
            reported = true;
            lastReport = at;
            opts.send(JOB_PROGRESS, { kind, done, total, elapsedMs: at - started });
          }
          if (at - lastYield >= sliceMs) {
            lastYield = at;
            await handOver();
          }
        },
      };

      try {
        const value = await work(ctx);
        return job.cancelled ? { cancelled: true, value } : { ok: true, value };
      } catch (e) {
        // A cancelled job that threw on the way out is still a cancellation:
        // the author asked it to stop, and an error report would be noise.
        if (job.cancelled) return { cancelled: true };
        return { error: e instanceof Error ? e.message : String(e) };
      } finally {
        live.delete(kind);
      }
    },
  };
}
