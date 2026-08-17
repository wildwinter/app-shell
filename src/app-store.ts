// ---------------------------------------------------------------------------
// The user's settings for THIS app: a small JSON file in the app's userData.
//
// Every app in the family has one, and both of the two that exist wrote it
// separately: the same tolerant read, the same merged defaults, the same capped
// recents, the same panes, the same per-tool-window bounds and pin, the same
// identity. That is the definition of shell work.
//
// WHAT BELONGS HERE is settings that follow the PERSON, not the project: where
// their windows were, which panes they like open, what they are called, what
// they had open last. Project content never comes near this file - it is not
// version controlled, it is not shared, and losing it should cost an author
// nothing but a re-arranged window.
//
// The shell owns the CORE it can reason about and hands the app one slice of
// its own (`app`) for everything else - a theme value, a view mode, whatever it
// has. Two stores in one file, one atomic write, so a crash cannot leave an app
// with half its settings.
//
// Electron-free on purpose: it takes a directory. That keeps it unit-testable
// and lets a test point it at a temp dir.
// ---------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Who is at the keyboard. Never in a project: see identity.ts. */
export interface Identity { name: string; email?: string }

/** A remembered window rectangle. Absent = the app's default, centred. */
export interface WindowBounds { x?: number; y?: number; width: number; height: number }

/** One helper window's remembered state. */
export interface WindowState { bounds?: WindowBounds; pinned?: boolean }

/** Side panes: open/closed, and any dragged width. */
export interface PaneState {
  nav?: boolean;
  inspector?: boolean;
  navW?: number;
  inspW?: number;
}

/**
 * The part every app has.
 *
 * `places` is deliberately opaque: "open where you left off" is a family idea,
 * but WHERE is a scene and a caret in one app and a box, a tab and a card in
 * another.
 *
 * It is keyed BY PROJECT, and that is the interesting part. This held a single
 * `place` and dropped it whenever a different project was opened, on the
 * reasoning that clearing it was the one rule that could not be app-specific.
 * That reasoning was wrong, and Patterpad disproved it by having done the other
 * thing for a long time: it remembers the line you were on in every project you
 * have opened. With one slot, working on A, glancing at B and coming back to A
 * lands you at the top of A, having forgotten. Nobody wants that, and no editor
 * outside this package does it.
 */
export interface AppSettingsCore<Place> {
  recents: string[];
  lastProject?: string;
  /** Project path -> where the author was in it. Capped with `recents`, so a
   *  project forgotten from the list stops carrying a place around too. */
  places: Record<string, Place>;
  panes: PaneState;
  identity?: Identity;
  /** Keyed by whatever the app calls each window ("board", "search"). */
  windows: Record<string, WindowState>;
}

export type AppSettings<Place, App> = AppSettingsCore<Place> & { app: App };

export interface AppStoreOptions<Place, App> {
  /** The app's userData directory. */
  dir: string;
  /** The file inside it. One per app; two apps never share. */
  fileName?: string;
  /** The app's own slice, as it should read on a first run. */
  defaults: App;
  /** How the panes should sit before anybody touches them. */
  panes?: PaneState;
  maxRecents?: number;
}

export interface AppStore<Place, App> {
  /** A copy, always: nothing outside can mutate the state behind the store's back. */
  get(): AppSettings<Place, App>;
  /** Merge into the app's own slice and save. */
  patchApp(patch: Partial<App>): void;
  /** Record an opened project: front of recents, deduped, capped. */
  touchProject(path: string): void;
  /** Drop one that failed to open (moved, deleted). */
  forgetProject(path: string): void;
  /** Where the author was in the CURRENT project. Compared before writing: this
   *  is called on every navigation and must not mean a disk write per click.
   *  A no-op with no project open, since there is nothing to key it against. */
  setPlace(place: Place): void;
  /** Where the author was in a project, or undefined if it was never opened or
   *  has aged out of `recents`. Defaults to the current one. */
  placeOf(path?: string): Place | undefined;
  setPanes(panes: PaneState): void;
  setIdentity(identity: Identity): void;
  /** One window's bounds and/or pin, merged with what it already had. */
  setWindow(key: string, state: WindowState): void;
}

export function createAppStore<Place, App extends object>(
  opts: AppStoreOptions<Place, App>,
): AppStore<Place, App> {
  const file = join(opts.dir, opts.fileName ?? "app-settings.json");
  const maxRecents = opts.maxRecents ?? 8;

  let loaded: Partial<AppSettings<Place, App>> = {};
  try {
    loaded = JSON.parse(readFileSync(file, "utf8")) as Partial<AppSettings<Place, App>>;
  } catch {
    // First run, or a file we cannot read. Defaults, never a crash: settings
    // are not worth failing to start over.
  }

  const state: AppSettings<Place, App> = {
    recents: [],
    panes: opts.panes ?? {},
    windows: {},
    ...loaded,
    // Migration: a settings file written before places were keyed by project has
    // a single `place` belonging to `lastProject`. Carry it over rather than
    // dropping it, or everyone's first launch after this update forgets where
    // they were, which is the exact complaint the change is meant to fix.
    places: {
      ...(loaded.places ?? {}),
      ...(loaded.lastProject !== undefined && (loaded as { place?: Place }).place !== undefined
        ? { [loaded.lastProject]: (loaded as { place?: Place }).place as Place }
        : {}),
    },
    // The app's slice merges FIELD BY FIELD, so a key added in a new version
    // arrives with its default rather than being absent for everybody who has
    // run the app before.
    app: { ...opts.defaults, ...(loaded.app ?? {}) },
  };

  const save = (): void => {
    try {
      mkdirSync(opts.dir, { recursive: true });
      // Write beside, then rename: a rename is atomic on every platform this
      // ships to, so a crash mid-write cannot leave a half-written settings
      // file - which both apps' hand-written stores could.
      const temp = `${file}.tmp`;
      writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      renameSync(temp, file);
    } catch {
      // A read-only home directory, a full disk: the app carries on with the
      // settings it has in memory rather than dying over a preference.
    }
  };

  return {
    get: () => structuredClone(state),
    patchApp(patch) {
      Object.assign(state.app, patch);
      save();
    },
    touchProject(path) {
      state.recents = [path, ...state.recents.filter((p) => p !== path)].slice(0, maxRecents);
      state.lastProject = path;
      // Places follow recents: one that has aged off the list should not keep a
      // place in the file for ever. Nothing is dropped for merely opening
      // something else, which is the whole point of keying them.
      for (const key of Object.keys(state.places)) {
        if (!state.recents.includes(key)) delete state.places[key];
      }
      save();
    },
    forgetProject(path) {
      state.recents = state.recents.filter((p) => p !== path);
      if (state.lastProject === path) delete state.lastProject;
      delete state.places[path]; // it moved or went: its place is meaningless now
      save();
    },
    setPlace(place) {
      const path = state.lastProject;
      if (path === undefined) return; // no project open: nothing to key it against
      if (JSON.stringify(state.places[path]) === JSON.stringify(place)) return;
      state.places[path] = place;
      save();
    },
    placeOf: (path) => {
      const key = path ?? state.lastProject;
      return key === undefined ? undefined : structuredClone(state.places[key]);
    },
    setPanes(panes) {
      state.panes = { ...state.panes, ...panes };
      save();
    },
    setIdentity(identity) {
      state.identity = identity;
      save();
    },
    setWindow(key, next) {
      state.windows[key] = { ...state.windows[key], ...next };
      save();
    },
  };
}
