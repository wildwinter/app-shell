// ---------------------------------------------------------------------------
// The project session: what happens around opening a project, as opposed to
// the opening itself.
//
// Both apps have a function - `openAt` here, `openAndRecord` there - and under
// two different names they do the same six things in the same order:
//
//   1. Ask the app to open it, which is the only app-specific step.
//   2. On failure, drop it from recents (a project that has moved should stop
//      being offered) and rebuild the menu.
//   3. On success, finish with the outgoing session.
//   4. Record the opened ROOT in the store, which also clears the remembered
//      place when it is a different project.
//   5. Invalidate everything main was caching FOR THE OLD PROJECT, and tell
//      each satellite tool window that the ground moved.
//   6. Rebuild the menu, so File > Open Recent is current.
//
// Step 5 is the one worth extracting on its own. Both apps hand-wire it per
// window - a cached result nulled, then `if (win && !win.isDestroyed())
// win.webContents.send(...)` - Storyletter three times, Patterpad twice, and
// every new tool window is another chance to forget one and leave a window
// describing a project that is no longer open. Registering a satellite once
// makes forgetting it impossible.
//
// It also carries `isKnownPath`, which only Patterpad had and which is a real
// guard rather than a tidiness: a renderer must not be able to name an
// arbitrary directory and have main open it. Fresh paths enter through the
// native dialogs, which run in main where the person actually chose them;
// everything else must already be in recents.
//
// Electron-free: a satellite is anything with the two methods it needs, which
// a BrowserWindow satisfies and a test can fake.
// ---------------------------------------------------------------------------

import { resolve } from "node:path";
import type { RecentProject } from "./app-store.js";

/** As much of a BrowserWindow as this file has any business knowing. */
export interface SatelliteWindow {
  isDestroyed(): boolean;
  webContents: { send(channel: string, ...args: unknown[]): void };
}

/**
 * A tool window that shows something about the open project, and any state
 * main is holding on its behalf.
 */
export interface Satellite {
  /** Looked up each time rather than held: these windows open and close. */
  window: () => SatelliteWindow | undefined | null;
  /** What to send when the project changes. The window re-fetches; it is a
   *  nudge, not a payload, because by then the new project is already open. */
  channel: string;
  /** Drop what main was caching for the old project - a coverage report, a
   *  search anchor. Called before the window is told. */
  clear?: () => void;
}

/** The slice of the app store this needs. Structural, so the real store fits
 *  without dragging its generic parameters in here. */
export interface SessionStore {
  get(): { recents: RecentProject[]; lastProject?: string };
  /** The name is what the app just learned by opening the project. Omitting it
   *  keeps whatever was known, which is `createAppStore`'s rule. */
  touchProject(path: string, name?: string): void;
  forgetProject(path: string): void;
  /** Forget only WHICH project was open, keeping it in recents. Close Project
   *  calls this so a quit after closing boots to the welcome screen instead of
   *  silently reopening what the person just closed. Optional: a host without
   *  it keeps its boot behaviour. */
  clearLastProject?(): void;
}

export interface ProjectSessionOptions<S, R> {
  store: SessionStore;
  /**
   * Open it. The one app-specific step.
   *
   * `root` is what gets recorded, and it is not always the path asked for: a
   * file-association launch names a shard INSIDE a project, and it is the
   * project that belongs in recents. `reply` is whatever the app sends back to
   * its renderer - this never looks inside it.
   *
   * `name` is the project's display name, if opening it revealed one. Return it
   * and the session records it with the path; leave it out and whatever was
   * known is kept. This is here so no app has to touch the store a second time
   * just to name what it has already opened.
   */
  open: (path: string) => { session: S; root: string; name?: string; reply: R } | { error: string };
  /**
   * The outgoing session is finished with: sweep its temporary files, close its
   * handles. Called only once the replacement has opened successfully, so a
   * failed open leaves the current project entirely alone.
   */
  close?: (session: S) => void;
  /** Rebuild the application menu. Called after a change either way, because a
   *  failed open changes recents too. */
  refreshMenu?: () => void;
  satellites?: Satellite[];
}

export interface ProjectSession<S, R> {
  /** The open project, or undefined before the first one. */
  current: () => S | undefined;
  /** Open, with everything in the comment above. */
  openAt: (path: string) => R | { error: string };
  /** May the renderer ask for this path? See the note above: only paths the app
   *  already knows, because a native dialog put them there. */
  isKnownPath: (path: string) => boolean;
  /** Close the open project and return to the no-project state (the welcome
   *  screen, in both apps): the close hook runs, the satellites are told, the
   *  menu rebuilds, and the store forgets WHICH project was open while keeping
   *  it in recents. A no-op when nothing is open. */
  closeCurrent: () => void;
  /** Register a tool window after construction, which is when they usually
   *  appear. Returns a function that unregisters it. */
  addSatellite: (satellite: Satellite) => () => void;
  /** Fire every satellite by hand. For the cases that are not an open but do
   *  invalidate the same things - a merge landing new content underneath. */
  invalidateSatellites: () => void;
}

export function createProjectSession<S, R>(opts: ProjectSessionOptions<S, R>): ProjectSession<S, R> {
  let session: S | undefined;
  const satellites: Satellite[] = [...(opts.satellites ?? [])];

  const invalidateSatellites = (): void => {
    for (const sat of satellites) {
      sat.clear?.();
      const win = sat.window();
      if (win && !win.isDestroyed()) win.webContents.send(sat.channel);
    }
  };

  return {
    current: () => session,

    openAt(path) {
      const opened = opts.open(path);
      if ("error" in opened) {
        opts.store.forgetProject(path);
        opts.refreshMenu?.();
        return opened;
      }
      if (session !== undefined) opts.close?.(session);
      session = opened.session;
      opts.store.touchProject(opened.root, opened.name);
      invalidateSatellites();
      opts.refreshMenu?.();
      return opened.reply;
    },

    closeCurrent() {
      if (session === undefined) return;
      opts.close?.(session);
      session = undefined;
      opts.store.clearLastProject?.();
      invalidateSatellites();
      opts.refreshMenu?.();
    },

    isKnownPath(path) {
      const s = opts.store.get();
      // Read `path` off each recent EXPLICITLY rather than filtering the list to
      // whatever looks like a string. The old form did the latter, and when
      // recents became objects in 0.25.0 every entry quietly failed the test and
      // was dropped: no error, no empty list to notice, just a launcher that had
      // stopped recognising every project but the last one. A defensive filter is
      // what turns a shape change into a silent behaviour change, so this one
      // states the shape it wants and lets the compiler enforce it.
      const paths = [s.lastProject, ...s.recents.map((r) => r.path)];
      const known = new Set(paths.filter((p): p is string => !!p).map((p) => resolve(p)));
      return known.has(resolve(path));
    },

    addSatellite(satellite) {
      satellites.push(satellite);
      return () => {
        const i = satellites.indexOf(satellite);
        if (i >= 0) satellites.splice(i, 1);
      };
    },

    invalidateSatellites,
  };
}
