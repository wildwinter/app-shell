// ---------------------------------------------------------------------------
// The long-job kit (renderer): the progress strip the main-side JobHost feeds.
// A determinate bar, a count, elapsed and estimated remaining, and Cancel.
//
// A STRIP, NOT A MODAL. The window that started the job is the one that shows
// it, and the rest of the app stays usable: these are tool windows, and taking
// the whole editor hostage while a sweep runs was the old system's mistake.
// The strip is hidden until a job starts and hides itself when one ends.
//
// TWO MODES, ONE STRIP. A job that knows its size (a coverage sweep: N runs)
// gets the determinate bar, the count and the time readout. A job that does
// not (a publish, a pull, a pack: one write of unknown length) gets an
// INDETERMINATE band that sweeps the bar, no count, and the elapsed time
// alone. The host's progress message already says which: `total` 0 is "no
// idea yet" (job.ts), so the strip follows the data and flips to the
// determinate bar the moment a total arrives. A host that knows its jobs
// never count pins the mode with `indeterminate: true`; a host whose jobs
// cannot be stopped mid-write drops Cancel with `cancellable: false` (or by
// passing no `onCancel` at all).
//
// The time readout only appears once there is enough evidence for it. An ETA
// that swings wildly for the first second reads as a broken app, so the
// estimate waits until a second of work and a tenth of the job are behind it.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

/** Per-run overrides for a strip that serves several kinds of job (the main
 *  window's: a countable export beside an uncountable pull). Each begin()
 *  starts from the mount options and applies these on top. */
export interface JobBeginOptions {
  /** Pin the band regardless of what the job reports. */
  indeterminate?: boolean;
  /** Show Cancel for this run. */
  cancellable?: boolean;
}

export interface JobProgressView {
  /** The strip; mount it where the job belongs. */
  readonly element: HTMLElement;
  /** Show the strip, reset to zero, and (optionally) name what is running. */
  begin(label?: string, run?: JobBeginOptions): void;
  /** Feed it a progress message from the main-side host. A `total` of 0
   *  (the host's "no idea yet") draws the indeterminate band; the first
   *  positive total flips the strip to the determinate bar. */
  update(done: number, total: number, elapsedMs: number): void;
  /** Hide the strip (the job finished, failed, or was cancelled). */
  end(): void;
  readonly visible: boolean;
  /** True while the strip is drawing the band rather than the bar. */
  readonly indeterminate: boolean;
}

export interface JobProgressOptions {
  /** Called when Cancel is clicked. The button disables itself and says so;
   *  the job stops at its next yield, and the host then calls end(). Omit it
   *  for a strip whose jobs cannot be stopped: Cancel is then not drawn. */
  onCancel?: () => void;
  /** The word for the units, for the count readout (default "runs"). */
  units?: string;
  /** Always draw the band and never the count, whatever the job reports.
   *  Default: follow the data (band until a total arrives). */
  indeterminate?: boolean;
  /** Draw Cancel. Default: only when `onCancel` was given. */
  cancellable?: boolean;
}

const clock = (ms: number): string => {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
};

/** Enough of the job done, and enough time passed, for a remaining-time
 *  estimate to be worth showing rather than misleading. */
const estimable = (done: number, total: number, elapsedMs: number): boolean =>
  done > 0 && total > 0 && elapsedMs > 1000 && done / total > 0.1;

export function mountJobProgress(host: HTMLElement, opts: JobProgressOptions): JobProgressView {
  const units = opts.units ?? "runs";
  const pinned = opts.indeterminate === true;
  const cancellableByDefault = opts.cancellable ?? (opts.onCancel !== undefined);

  const fill = el("i", { className: "job-fill" });
  const bar = el("div", { className: "job-bar" }, fill);
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  const what = el("span", { className: "job-label" });
  const count = el("span", { className: "job-count" });
  const time = el("span", { className: "job-time" });
  const cancel = el("button", { className: "job-cancel", text: "Cancel" });
  cancel.type = "button";

  const strip = el("div", { className: "job-strip" }, what, bar, count, time, cancel);
  strip.hidden = true;
  host.append(strip);

  // The run's settings: reset by begin(), read by update().
  let runPinned = pinned;
  let indeterminate = false;

  /** Draw the band (no count, no value) or the bar (both). Every write is
   *  idempotent, so update() may call it each time and only a flip shows. */
  const setMode = (band: boolean): void => {
    indeterminate = band;
    strip.classList.toggle("indeterminate", band);
    count.hidden = band;
    if (band) {
      // The band's width and motion are the stylesheet's: clear the inline
      // width the bar set, or it wins over the class.
      fill.style.width = "";
      bar.removeAttribute("aria-valuenow");
    }
  };

  const view: JobProgressView = {
    element: strip,
    get visible() { return !strip.hidden; },
    get indeterminate() { return indeterminate; },

    begin(label?: string, run?: JobBeginOptions) {
      runPinned = run?.indeterminate ?? pinned;
      const cancellable = run?.cancellable ?? cancellableByDefault;
      what.textContent = label ?? "Running…";
      count.textContent = "";
      time.textContent = "";
      cancel.hidden = !cancellable;
      cancel.disabled = false;
      cancel.textContent = "Cancel";
      // Every run opens on the band: nothing is known until the first report.
      setMode(true);
      strip.hidden = false;
    },

    update(done: number, total: number, elapsedMs: number) {
      if (strip.hidden) strip.hidden = false;
      const band = runPinned || !(total > 0);
      setMode(band);
      if (!band) {
        const pct = Math.min(100, (done / total) * 100);
        fill.style.width = `${pct}%`;
        bar.setAttribute("aria-valuenow", String(Math.round(pct)));
        count.textContent = `${done} / ${total} ${units}`.trimEnd();
      }
      if (!band && estimable(done, total, elapsedMs)) {
        const remaining = (elapsedMs / done) * (total - done);
        time.textContent = `${clock(elapsedMs)} elapsed, about ${clock(remaining)} left`;
      } else {
        time.textContent = clock(elapsedMs);
      }
    },

    end() {
      strip.hidden = true;
    },
  };

  cancel.addEventListener("click", () => {
    // Cancellation lands at the job's next yield, which may be a moment away:
    // say so, rather than leaving a dead-looking button.
    cancel.disabled = true;
    cancel.textContent = "Stopping…";
    opts.onCancel?.();
  });

  // Before the first begin(): the band, and Cancel per the mount options, so
  // a host that only ever calls update() (the strip appearing on the first
  // progress message) still gets a coherent strip.
  cancel.hidden = !cancellableByDefault;
  setMode(true);

  return view;
}
