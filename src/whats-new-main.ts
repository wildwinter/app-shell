// ---------------------------------------------------------------------------
// What's New's main-process half (whats-new.ts is the dialog): which version
// ran last, and the "Show what's new after updates" tickbox, kept in the app's
// own settings through the two callbacks it hands over.
// ---------------------------------------------------------------------------

import { ipcMain } from "electron";
import { WHATS_NEW_CHANNELS, type WhatsNewState } from "./whats-new-channels.js";

export { WHATS_NEW_CHANNELS, type WhatsNewState } from "./whats-new-channels.js";

/** What the app keeps for What's New in its own settings. */
export interface WhatsNewMemory {
  /** The version that last ran. Absent until the first run with What's New. */
  lastVersion?: string;
  /** The tickbox; absent means ticked. */
  show?: boolean;
}

export interface WhatsNewMainOptions {
  /** `app.getVersion()`. */
  version: string;
  read: () => WhatsNewMemory;
  write: (patch: WhatsNewMemory) => void;
  /** This machine has run the app before (its settings hold a recent project, say), for the first launch
   *  with What's New, which has no version on record. */
  existing?: boolean;
}

/**
 * Answer the renderer's launch question and remember the tickbox. Call once,
 * at startup. The state is worked out before this version is recorded, and
 * given until the renderer says the dialog was closed (`seen`): a window that
 * reloads before then (a crash, a dev server's first reload) still shows it,
 * and one that reloads after hears that nothing is new.
 *
 * The first run with What's New has no `lastVersion`. `existing` tells an
 * install that was already in use (it hears about this version) from a fresh
 * one (it hears nothing, since nothing has changed for it).
 */
export function registerWhatsNew(opts: WhatsNewMainOptions): void {
  const before = opts.read();
  const state: WhatsNewState = {
    version: opts.version,
    ...(before.lastVersion !== undefined ? { previous: before.lastVersion } : { existing: opts.existing === true }),
    show: before.show !== false,
  };
  if (before.lastVersion !== opts.version) opts.write({ lastVersion: opts.version });
  ipcMain.removeHandler(WHATS_NEW_CHANNELS.state);
  let seen = false;
  ipcMain.handle(WHATS_NEW_CHANNELS.state, (): WhatsNewState => {
    const show = opts.read().show !== false;
    return seen ? { version: opts.version, previous: opts.version, show } : { ...state, show };
  });
  ipcMain.removeAllListeners(WHATS_NEW_CHANNELS.seen);
  ipcMain.on(WHATS_NEW_CHANNELS.seen, () => { seen = true; });
  ipcMain.removeAllListeners(WHATS_NEW_CHANNELS.setShow);
  ipcMain.on(WHATS_NEW_CHANNELS.setShow, (_e, show: unknown) => { opts.write({ show: show === true }); });
}
