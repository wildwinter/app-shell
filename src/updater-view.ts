// ---------------------------------------------------------------------------
// The updater's VIEW: the themed prompt main summons over `updater:prompt`
// (updater.ts) and reads the chosen button index back from, the same contract
// as dialog.showMessageBox's `response`. The renderer half of the updater is
// not optional: an unanswered prompt does not fall back to a native dialog,
// the shell waits 300 seconds and resolves its own fallback index. Both apps
// had written this view by hand (55 of 60 lines identical); this is the one
// they share, on the family's dialog frame, the way save.ts has save-view.ts.
//
// Storyletter's copy, plus Patterpad's `links` row as an option (an About box
// used to share this dialog there). Styles ship as updater.css.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { dialogFrame } from "./dialog.js";
import type { UpdaterDownloadProgress, UpdaterPromptOptions } from "./updater.js";

export interface UpdaterLink { label: string; url: string }

export interface UpdaterViewOptions extends UpdaterPromptOptions {
  /** Web links under the detail. Opened through `openExternal`, never by
   *  navigating the window. */
  links?: UpdaterLink[];
  /** How a link opens (the app's allow-listed shell.openExternal bridge).
   *  Required for `links` to do anything. */
  openExternal?: (url: string) => void;
}

// The progress row of the open `progress: true` dialog, if any. These are
// modal, so one at a time, so one slot is enough. Closing clears it.
let liveProgress: { bar: HTMLElement; label: HTMLElement } | null = null;

const mb = (n: number): string => (n / (1024 * 1024)).toFixed(1);

/** Route a download-progress tick into the open dialog's bar. No-op when none
 *  is showing. Registered once at boot on the app's progress channel. */
export function feedUpdaterDownloadProgress(p: UpdaterDownloadProgress): void {
  if (!liveProgress) return;
  const pct = Math.max(0, Math.min(100, p.percent));
  liveProgress.bar.style.width = `${pct}%`;
  liveProgress.label.textContent =
    `${pct.toFixed(0)}%, ${mb(p.transferred)} of ${mb(p.total)} MB (${mb(p.bytesPerSecond)} MB/s)`;
}

/** Show the prompt as a modal themed dialog; resolve the index of the clicked
 *  button (Esc resolves `cancelId`, which defaults to the last button). */
export function showUpdaterDialog(opts: UpdaterViewOptions): Promise<number> {
  return new Promise((resolve) => {
    const defaultId = opts.defaultId ?? 0;
    const cancelId = opts.cancelId ?? opts.buttons.length - 1;

    let done = false;
    const finish = (idx: number): void => {
      if (done) return;
      done = true;
      liveProgress = null;   // stop feeding a dialog that is gone
      resolve(idx);
      frame.close();
    };
    const frame = dialogFrame({
      title: opts.message, className: "updater-dialog",
      // Esc is the cancel button, not a further answer: main is waiting on an index.
      onClose: () => finish(cancelId),
    });
    if (opts.detail) frame.body.append(el("p", "updater-detail", opts.detail));

    if (opts.progress) {
      const track = el("div", "updater-progress-track");
      const bar = el("div", "updater-progress-bar");
      track.append(bar);
      const label = el("p", "updater-progress-label", "Starting download…");
      frame.body.append(track, label);
      liveProgress = { bar, label };
    }

    if (opts.links?.length) {
      const row = el("p", "updater-links");
      for (const link of opts.links) {
        const a = el("a", undefined, link.label);
        a.href = link.url;
        a.addEventListener("click", (e) => { e.preventDefault(); opts.openExternal?.(link.url); });
        row.append(a);
      }
      frame.body.append(row);
    }

    opts.buttons.forEach((label, i) => {
      // The default is the affirmative and wears the accent; every other
      // button, the way out included, is the plain one.
      const b = el("button", i === defaultId ? "btn primary" : "btn", label);
      b.type = "button";
      b.addEventListener("click", () => finish(i));
      frame.actions.append(b);
      if (i === defaultId) queueMicrotask(() => b.focus());
    });

    frame.open();
  });
}
