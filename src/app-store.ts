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
 * `place` is deliberately opaque: "open where you left off" is a family idea,
 * but WHERE is a scene and a caret in one app and a box, a tab and a card in
 * another. The shell stores it and clears it when the project changes, which is
 * the one rule about it that is not app-specific.
 */
export interface AppSettingsCore<Place> {
  recents: string[];
  lastProject?: string;
  place?: Place;
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
  /** Where the author was. Compared before writing: this is called on every
   *  navigation and must not mean a disk write per click. */
  setPlace(place: Place): void;
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
      // A DIFFERENT project invalidates the remembered place; the same one must
      // keep it, or "open where you left off" could never work, since reopening
      // goes through here.
      if (state.lastProject !== path) delete state.place;
      state.recents = [path, ...state.recents.filter((p) => p !== path)].slice(0, maxRecents);
      state.lastProject = path;
      save();
    },
    forgetProject(path) {
      state.recents = state.recents.filter((p) => p !== path);
      if (state.lastProject === path) delete state.lastProject;
      save();
    },
    setPlace(place) {
      if (JSON.stringify(state.place) === JSON.stringify(place)) return;
      state.place = place;
      save();
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
