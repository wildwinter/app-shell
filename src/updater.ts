// ---------------------------------------------------------------------------
// In-app auto-update over electron-updater: the family's, lifted from Patterpad
// where it was hardened in the field.
//
// This is not a wrapper anybody should write twice. Every rule in it is a bug
// that reached a user:
//
//   - Downloads are driven HERE rather than by electron-updater's autoDownload,
//     because holding the CancellationToken is what lets a stall watchdog kill
//     and retry a download that hangs. A hung stream emits neither progress nor
//     `error`, so anything built on events alone sits "downloading" for ever
//     (Patterpad #33: a Windows user's download did exactly that, all day).
//   - Differential download is off. On Windows it stalled silently across an
//     Electron major bump, where almost no blocks match anyway.
//   - There is a PERSISTENT LOG in userData, because electron-updater is silent
//     by default and a stalled download otherwise leaves nothing to diagnose.
//   - Installing asks the renderer whether there is unsaved work, and offers
//     Save / Discard / Cancel. "Restart Now" must never silently drop an
//     author's afternoon.
//   - Every prompt is THEMED, in the renderer, never a stock OS dialog.
//
// Only runs in a packaged build; in development the manual check says so rather
// than failing obscurely.
//
// THE SEAMS: the app supplies its NAME (it appears in every message), a way to
// find the ACTIVE WINDOW, and a renderer that answers four channels - the
// contract below. Everything else is the same in every app.
// ---------------------------------------------------------------------------

import { app, BrowserWindow, ipcMain } from "electron";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import electronUpdater from "electron-updater";

/** Download progress, broadcast to every window so a live dialog can show it. */
export interface UpdaterDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
  /** Which version is coming, so a dialog can name it. */
  version: string;
}

/** A themed prompt, answered by the renderer with the chosen button index -
 *  the same contract as `dialog.showMessageBox`'s `response`. */
export interface UpdaterPromptOptions {
  message: string;
  detail?: string;
  buttons: string[];
  defaultId?: number;
  cancelId?: number;
  /** Show live download progress in the dialog. */
  progress?: boolean;
}

/** The channels the app's renderer must answer. Named here so both sides agree. */
export const UPDATER_CHANNELS = {
  /** main -> renderer: "are there unsaved edits?"; reply on `dirtyReply`. */
  checkDirty: "updater:check-dirty",
  dirtyReply: "updater:dirty-reply",
  /** main -> renderer: "save now"; reply `{ ok }` on `saveDone`. */
  saveBeforeInstall: "updater:save-before-install",
  saveDone: "updater:save-done",
  /** main -> renderer: show this prompt; reply with the button index. */
  prompt: "updater:prompt",
  promptReply: "updater:prompt-reply",
  /** main -> renderer: live download progress. */
  progress: "updater:download-progress",
} as const;

export interface UpdaterOptions {
  /** The product name, as it should read in every message ("Patterpad"). */
  appName: string;
  /** Which window the prompts belong to. */
  activeWindow: () => BrowserWindow | null;
  /** The log file inside userData. */
  logFile?: string;
}

let appName = "This app";
let activeWindowFn: () => BrowserWindow | null = () =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
const activeWindow = (): BrowserWindow | null => activeWindowFn();

const { autoUpdater, CancellationToken } = electronUpdater;

let updateDownloaded: UpdateDownloadedEvent | null = null;
// Remember the last background error so the manual "Check for Updates" dialog can
// surface it - otherwise a broken feed (network policy, expired cert, GitHub outage)
// stays invisible and the user has no idea why updates never arrive.
let lastBackgroundError: string | null = null;

// Persistent updater log (userData/updater.log). electron-updater is silent by default; without a log a
// Windows download that stalls without emitting `error` (found in 0.1.5) leaves nothing to diagnose.
let logPath = join(app.getPath("userData"), "updater.log");
const writeLog = (level: string, args: unknown[]): void => {
  try { appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(" ")}\n`); } catch { /* logging must never throw */ }
};
autoUpdater.logger = {
  info: (...a: unknown[]) => writeLog("info", a),
  warn: (...a: unknown[]) => writeLog("warn", a),
  error: (...a: unknown[]) => writeLog("error", a),
  debug: (...a: unknown[]) => writeLog("debug", a),
};

// Downloads are driven by the download manager below, NOT electron-updater's autoDownload: holding
// the CancellationToken ourselves is what lets the stall watchdog kill and retry a download that
// hangs without ever erroring (#33 - a Windows user's download sat "in the background" all day; a
// hung stream emits neither progress nor `error`, so nothing built on events alone can recover it).
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
// Force a plain full download instead of the block-by-block differential. On Windows the differential
// path stalled silently (0.1.5): across an Electron-major bump almost no blocks match, so it downloads
// nearly everything anyway, and it's fragile for unsigned installers. Full download is one reliable
// stream. No-op on macOS (Squirrel.Mac always fetches the whole zip).
autoUpdater.disableDifferentialDownload = true;

autoUpdater.on("error", (err) => {
  console.error("AutoUpdater error:", err?.message || err);
  lastBackgroundError = err?.message || String(err);
});

// ---------------------------------------------------------------------------
// Download manager: start, watch, retry. Platform-agnostic - it rides
// electron-updater's shared events, identical for NSIS (win), zip (mac), and
// AppImage (linux) feeds.
// ---------------------------------------------------------------------------

const STALL_MS = 3 * 60 * 1000;   // no progress event for this long = the download is hung
const WATCH_EVERY_MS = 30 * 1000; // how often the watchdog looks at the clock
const RETRY_DELAY_MS = 15 * 1000; // pause before re-attempting a killed/failed download
const MAX_ATTEMPTS = 3;           // per check cycle; the 6-hourly background check starts a fresh cycle

type DownloadState = {
  info: UpdateInfo;
  token: InstanceType<typeof CancellationToken>;
  attempts: number;        // attempts consumed this cycle, including the running one
  lastProgressAt: number;
  cancelledByWatchdog: boolean;
  watchdog: NodeJS.Timeout;
};
let download: DownloadState | null = null;

function broadcastProgress(p: UpdaterDownloadProgress): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(UPDATER_CHANNELS.progress, p);
  }
}

function clearDownload(): void {
  if (download) clearInterval(download.watchdog);
  download = null;
}

/** Begin (or re-attempt) downloading `info`. One state machine for every platform. */
function beginDownload(info: UpdateInfo, attempts: number): void {
  clearDownload();
  const token = new CancellationToken();
  const state: DownloadState = {
    info, token, attempts: attempts + 1, lastProgressAt: Date.now(), cancelledByWatchdog: false,
    watchdog: setInterval(() => {
      if (download !== state) return;
      const quiet = Date.now() - state.lastProgressAt;
      if (quiet < STALL_MS) return;
      // Hung: no progress and no error for STALL_MS. Kill it; the download promise's catch retries.
      writeLog("warn", [`watchdog: no download progress for ${Math.round(quiet / 1000)}s - cancelling (attempt ${state.attempts}/${MAX_ATTEMPTS})`]);
      state.cancelledByWatchdog = true;
      state.token.cancel();
    }, WATCH_EVERY_MS),
  };
  download = state;
  writeLog("info", [`download: starting ${info.version} (attempt ${state.attempts}/${MAX_ATTEMPTS})`]);

  autoUpdater.downloadUpdate(token).then(() => {
    // Success is reported via the update-downloaded event; it clears the state.
  }).catch((err: unknown) => {
    if (download !== state) return; // superseded by a newer attempt/cycle
    const why = state.cancelledByWatchdog ? "stalled (killed by the watchdog)"
      : (err instanceof Error ? err.message : String(err));
    clearDownload();
    if (state.attempts < MAX_ATTEMPTS) {
      writeLog("warn", [`download: attempt ${state.attempts} failed - ${why}; retrying in ${RETRY_DELAY_MS / 1000}s`]);
      setTimeout(() => { if (!download && !updateDownloaded) beginDownload(info, state.attempts); }, RETRY_DELAY_MS);
    } else {
      // Out of attempts for this cycle. Record it where the manual check surfaces it; the next
      // background check (6-hourly, or Help > Check for Updates) starts a fresh cycle.
      lastBackgroundError = `Downloading ${info.version} failed ${MAX_ATTEMPTS} times (last: ${why}). Will retry on the next check.`;
      writeLog("error", [`download: giving up on ${info.version} this cycle - ${why}`]);
    }
  });
}

autoUpdater.on("update-available", (info: UpdateInfo) => {
  if (download || updateDownloaded) return; // already downloading it, or already have it
  beginDownload(info, 0);
});

autoUpdater.on("download-progress", (p: ProgressInfo) => {
  if (download) download.lastProgressAt = Date.now();
  broadcastProgress({
    percent: p.percent, transferred: p.transferred, total: p.total,
    bytesPerSecond: p.bytesPerSecond, version: download?.info.version ?? "",
  });
});

/** Ask the renderer (one-shot, timeout-guarded) whether the open scene has unsaved edits.
 *  Resolves false on any error/timeout - the renderer's dirty flag is the only truth here. */
function askRendererIsDirty(win: BrowserWindow | null): Promise<boolean> {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) { resolve(false); return; }
    const onReply = (_e: unknown, isDirty: boolean) => { clearTimeout(timeout); resolve(!!isDirty); };
    ipcMain.once(UPDATER_CHANNELS.dirtyReply, onReply);
    const timeout = setTimeout(() => {
      ipcMain.removeListener(UPDATER_CHANNELS.dirtyReply, onReply);
      console.warn("Updater dirty-check timed out; assuming clean.");
      resolve(false);
    }, 2000);
    win.webContents.send(UPDATER_CHANNELS.checkDirty);
  });
}

/** Trigger a save in the renderer and wait for completion. Saves run the lock-aware VC write path,
 *  so the timeout is generous; if it elapses we abort rather than install over a half-saved project. */
function triggerRendererSave(win: BrowserWindow | null): Promise<{ ok: boolean }> {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) { resolve({ ok: false }); return; }
    const onReply = (_e: unknown, result: { ok: boolean }) => { clearTimeout(timeout); resolve(result || { ok: false }); };
    ipcMain.once(UPDATER_CHANNELS.saveDone, onReply);
    const timeout = setTimeout(() => {
      ipcMain.removeListener(UPDATER_CHANNELS.saveDone, onReply);
      console.warn("Updater save timed out.");
      resolve({ ok: false });
    }, 30000);
    win.webContents.send(UPDATER_CHANNELS.saveBeforeInstall);
  });
}

/** Show a THEMED prompt in the renderer (never a stock OS dialog; design-language "coherent to the edges")
 *  and resolve the chosen button index - the same contract as dialog.showMessageBox's `response`. Falls
 *  back to cancelId/defaultId if there's no live renderer to answer (so an install is never blocked on it). */
function themedPrompt(win: BrowserWindow | null, opts: UpdaterPromptOptions): Promise<number> {
  return new Promise((resolve) => {
    const fallback = opts.cancelId ?? opts.defaultId ?? 0;
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) { resolve(fallback); return; }
    const onReply = (_e: unknown, idx: number) => { clearTimeout(timeout); resolve(typeof idx === "number" ? idx : fallback); };
    ipcMain.once(UPDATER_CHANNELS.promptReply, onReply);
    // Generous: these are user-facing prompts. If the renderer never answers (gone / hung), fall back safely.
    const timeout = setTimeout(() => { ipcMain.removeListener(UPDATER_CHANNELS.promptReply, onReply); resolve(fallback); }, 300000);
    win.webContents.send(UPDATER_CHANNELS.prompt, opts);
  });
}

/** quitAndInstall, guarded by the unsaved-edits check. autoInstallOnAppQuit routes through the normal
 *  window-close save path already, so only this explicit "Restart Now" needs the guard. */
async function quitAndInstallSafely(): Promise<void> {
  const win = activeWindow();
  if (!(await askRendererIsDirty(win))) { autoUpdater.quitAndInstall(); return; }

  const response = await themedPrompt(win, {
    buttons: ["Save and Restart", "Discard and Restart", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "You have unsaved changes.",
    detail: `Save them before restarting to install ${appName} ${updateDownloaded?.version || ""}?`,
  });

  if (response === 2) return; // Cancel - abort the install
  if (response === 0) {
    const result = await triggerRendererSave(win);
    if (!result.ok) {
      await themedPrompt(win, {
        message: "Save failed",
        detail: "Your changes could not be saved, so the update was not installed. Save manually, then try again.",
        buttons: ["OK"],
      });
      return;
    }
  }
  // response === 1 (Discard) falls through.
  autoUpdater.quitAndInstall();
}

autoUpdater.on("update-downloaded", (info: UpdateDownloadedEvent) => {
  clearDownload();
  updateDownloaded = info;
  lastBackgroundError = null; // it got here in the end; stale retry noise would only mislead
  writeLog("info", [`download: ${info.version} downloaded and ready to install`]);
  const win = activeWindow();
  if (!win) return;
  void themedPrompt(win, {
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
    message: "Update ready to install",
    detail: `${appName} ${info.version} has been downloaded. Restart now to apply, or it will install automatically next time you quit.`,
  }).then((response) => { if (response === 0) void quitAndInstallSafely(); });
});

/** Name the app and say how to find its window. Call once, at startup. */
export function configureUpdater(opts: UpdaterOptions): void {
  appName = opts.appName;
  activeWindowFn = opts.activeWindow;
  if (opts.logFile !== undefined) logPath = join(app.getPath("userData"), opts.logFile);
}

/** Fire-and-forget background check; periodic + on launch. No-op in dev. */
export function startBackgroundUpdateCheck(): void {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error("AutoUpdater background check failed:", err?.message || err);
  });
}

/** The Help ▸ Check for Updates… handler: always gives the user feedback (downloading / up to date /
 *  error), unlike the silent background check. */
export async function manualCheckForUpdates(win?: BrowserWindow | null): Promise<void> {
  const parent = win || activeWindow();

  if (!app.isPackaged) {
    await themedPrompt(parent, {
      message: "Updates unavailable in development build",
      detail: `Auto-update only runs in packaged builds.\n\nCurrent version: ${app.getVersion()}`,
      buttons: ["OK"],
    });
    return;
  }

  if (updateDownloaded) {
    const response = await themedPrompt(parent, {
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: "Update ready to install",
      detail: `${appName} ${updateDownloaded.version} has been downloaded. Restart now to apply.`,
    });
    if (response === 0) await quitAndInstallSafely();
    return;
  }

  if (download) {
    // A download is already in flight: show it, live (the dialog subscribes to progress events).
    await themedPrompt(parent, {
      message: "Update available",
      detail: `${appName} ${download.info.version} is downloading. You'll be prompted to restart when it's ready.`,
      buttons: ["OK"],
      progress: true,
    });
    return;
  }

  try {
    // A manual check starts a fresh retry cycle: if the last one gave up, this is the user asking again.
    await autoUpdater.checkForUpdates();
    // With autoDownload off, `update-available` (fired during the await) starts the managed download,
    // so by here `download` is set iff the feed had something newer. (Read through locals: TS narrows the
    // module-level `download` to null after the guard above and cannot see the event handler mutate it.)
    const started = download as DownloadState | null;
    const ready = updateDownloaded as UpdateDownloadedEvent | null;
    if (started) {
      await themedPrompt(parent, {
        message: "Update available",
        detail: `${appName} ${started.info.version} is downloading. You'll be prompted to restart when it's ready.`,
        buttons: ["OK"],
        progress: true,
      });
      lastBackgroundError = null;
    } else if (ready) {
      // The check completed a download between our earlier guard and now (tiny window, but free to handle).
      const response = await themedPrompt(parent, {
        buttons: ["Restart Now", "Later"], defaultId: 0, cancelId: 1,
        message: "Update ready to install",
        detail: `${appName} ${ready.version} has been downloaded. Restart now to apply.`,
      });
      if (response === 0) await quitAndInstallSafely();
    } else if (lastBackgroundError) {
      await themedPrompt(parent, {
        message: "You're on the latest version, but updates have had errors.",
        detail: `Current version: ${appName} ${app.getVersion()}\n\nLast update error:\n${lastBackgroundError}`,
        buttons: ["OK"],
      });
      lastBackgroundError = null;
    } else {
      await themedPrompt(parent, {
        message: "You're on the latest version.",
        detail: `${appName} ${app.getVersion()} is up to date.`,
        buttons: ["OK"],
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = lastBackgroundError && lastBackgroundError !== message
      ? `${message}\n\nA previous background check also failed with:\n${lastBackgroundError}`
      : message;
    await themedPrompt(parent, { message: "Update check failed", detail, buttons: ["OK"] });
    lastBackgroundError = null;
  }
}
