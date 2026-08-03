// ---------------------------------------------------------------------------
// The long-job kit (renderer): the progress strip the main-side JobHost feeds.
// A determinate bar, a count, elapsed and estimated remaining, and Cancel.
//
// A STRIP, NOT A MODAL. The window that started the job is the one that shows
// it, and the rest of the app stays usable: these are tool windows, and taking
// the whole editor hostage while a sweep runs was the old system's mistake.
// The strip is hidden until a job starts and hides itself when one ends.
//
// The time readout only appears once there is enough evidence for it. An ETA
// that swings wildly for the first second reads as a broken app, so the
// estimate waits until a second of work and a tenth of the job are behind it.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

export interface JobProgressView {
  /** The strip; mount it where the job belongs. */
  readonly element: HTMLElement;
  /** Show the strip, reset to zero, and (optionally) name what is running. */
  begin(label?: string): void;
  /** Feed it a progress message from the main-side host. */
  update(done: number, total: number, elapsedMs: number): void;
  /** Hide the strip (the job finished, failed, or was cancelled). */
  end(): void;
  readonly visible: boolean;
}

export interface JobProgressOptions {
  /** Called when Cancel is clicked. The button disables itself and says so;
   *  the job stops at its next yield, and the host then calls end(). */
  onCancel: () => void;
  /** The word for the units, for the count readout (default "runs"). */
  units?: string;
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

  const fill = el("i", { className: "job-fill" });
  const bar = el("div", { className: "job-bar" }, fill);
  const what = el("span", { className: "job-label" });
  const count = el("span", { className: "job-count" });
  const time = el("span", { className: "job-time" });
  const cancel = el("button", { className: "job-cancel", text: "Cancel" });

  const strip = el("div", { className: "job-strip" }, what, bar, count, time, cancel);
  strip.hidden = true;
  host.append(strip);

  const view: JobProgressView = {
    element: strip,
    get visible() { return !strip.hidden; },

    begin(label?: string) {
      what.textContent = label ?? "Running…";
      count.textContent = "";
      time.textContent = "";
      fill.style.width = "0%";
      cancel.disabled = false;
      cancel.textContent = "Cancel";
      strip.hidden = false;
    },

    update(done: number, total: number, elapsedMs: number) {
      if (strip.hidden) strip.hidden = false;
      const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
      fill.style.width = `${pct}%`;
      count.textContent = total > 0 ? `${done} / ${total} ${units}` : `${done} ${units}`;
      if (estimable(done, total, elapsedMs)) {
        const remaining = (elapsedMs / done) * (total - done);
        time.textContent = `${clock(elapsedMs)} elapsed · about ${clock(remaining)} left`;
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
    opts.onCancel();
  });

  return view;
}
