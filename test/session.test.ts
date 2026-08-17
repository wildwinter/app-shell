import { describe, expect, it } from "vitest";
import { createProjectSession, type Satellite, type SessionStore } from "../src/session.js";
import type { RecentProject } from "../src/app-store.js";

/** Mirrors `createAppStore`: recents are `{ path, name? }`, and an omitted name
 *  keeps whatever was known rather than blanking it. */
function fakeStore(initial: { recents?: RecentProject[]; lastProject?: string } = {}): SessionStore & { state: { recents: RecentProject[]; lastProject?: string } } {
  const state = { recents: initial.recents ?? [], lastProject: initial.lastProject };
  return {
    state,
    get: () => state,
    touchProject(path, name) {
      const known = state.recents.find((r) => r.path === path);
      const entry: RecentProject = { path, ...(name ?? known?.name ? { name: name ?? known?.name } : {}) };
      state.recents = [entry, ...state.recents.filter((r) => r.path !== path)];
      state.lastProject = path;
    },
    forgetProject(path) {
      state.recents = state.recents.filter((r) => r.path !== path);
      if (state.lastProject === path) state.lastProject = undefined;
    },
  };
}

function fakeSatellite(open = true): Satellite & { sent: string[]; cleared: number } {
  const sat = {
    sent: [] as string[],
    cleared: 0,
    channel: "thing:project",
    clear() { sat.cleared++; },
    window: () => (open ? { isDestroyed: () => false, webContents: { send: (c: string) => { sat.sent.push(c); } } } : undefined),
  };
  return sat;
}

describe("project session", () => {
  it("records the ROOT, not the path asked for", () => {
    // A file-association launch names a shard inside the project; recents must
    // hold the project.
    const store = fakeStore();
    const s = createProjectSession<string, string>({
      store,
      open: () => ({ session: "live", root: "/p/proj", reply: "ok" }),
    });
    expect(s.openAt("/p/proj/boxes/a.storyletbox")).toBe("ok");
    expect(store.state.recents).toEqual([{ path: "/p/proj" }]);
    expect(s.current()).toBe("live");
  });

  it("a failed open drops it from recents and leaves the current project alone", () => {
    const store = fakeStore();
    let closed = 0;
    let willFail = false;
    const s = createProjectSession<string, string>({
      store,
      open: (p) => (willFail ? { error: "gone" } : { session: p, root: p, reply: "ok" }),
      close: () => { closed++; },
    });
    s.openAt("/p/one");
    willFail = true;
    expect(s.openAt("/p/two")).toEqual({ error: "gone" });
    expect(s.current()).toBe("/p/one");        // still open
    expect(closed).toBe(0);                    // and not closed
    expect(store.state.recents).toEqual([{ path: "/p/one" }]);
  });

  it("closes the outgoing session only after the new one has opened", () => {
    const order: string[] = [];
    const s = createProjectSession<string, string>({
      store: fakeStore(),
      open: (p) => { order.push(`open ${p}`); return { session: p, root: p, reply: "ok" }; },
      close: (sess) => { order.push(`close ${sess}`); },
    });
    s.openAt("/p/one");
    s.openAt("/p/two");
    expect(order).toEqual(["open /p/one", "open /p/two", "close /p/one"]);
  });

  it("clears and nudges every satellite, open or not", () => {
    const shown = fakeSatellite(true);
    const hidden = fakeSatellite(false);
    const s = createProjectSession<string, string>({
      store: fakeStore(),
      open: (p) => ({ session: p, root: p, reply: "ok" }),
      satellites: [shown, hidden],
    });
    s.openAt("/p/one");
    expect(shown.sent).toEqual(["thing:project"]);
    expect(shown.cleared).toBe(1);
    // A closed window is still CLEARED: the cache lives in main and would
    // otherwise be handed to the window the next time it opens.
    expect(hidden.cleared).toBe(1);
    expect(hidden.sent).toEqual([]);
  });

  it("satellites can be added and removed after construction", () => {
    const late = fakeSatellite();
    const s = createProjectSession<string, string>({
      store: fakeStore(),
      open: (p) => ({ session: p, root: p, reply: "ok" }),
    });
    const remove = late.channel ? s.addSatellite(late) : () => {};
    s.openAt("/p/one");
    expect(late.cleared).toBe(1);
    remove();
    s.openAt("/p/two");
    expect(late.cleared).toBe(1);
  });

  it("rebuilds the menu on success and on failure", () => {
    let menus = 0;
    let ok = true;
    const s = createProjectSession<string, string>({
      store: fakeStore(),
      open: (p) => (ok ? { session: p, root: p, reply: "ok" } : { error: "no" }),
      refreshMenu: () => { menus++; },
    });
    s.openAt("/p/one");
    ok = false;
    s.openAt("/p/two");
    expect(menus).toBe(2);   // recents changed both times
  });

  it("only lets the renderer name paths the app already knows", () => {
    const store = fakeStore({ recents: [{ path: "/p/one" }, { path: "/p/two", name: "Two" }], lastProject: "/p/one" });
    const s = createProjectSession<string, string>({
      store,
      open: (p) => ({ session: p, root: p, reply: "ok" }),
    });
    expect(s.isKnownPath("/p/one")).toBe(true);
    expect(s.isKnownPath("/p/two/")).toBe(true);     // resolved, so a trailing slash is the same place
    expect(s.isKnownPath("/p/three")).toBe(false);
    expect(s.isKnownPath("/etc")).toBe(false);
  });

  it("recognises every recent, not just the last project", () => {
    // THE REGRESSION 0.25.0 opened. `isKnownPath` filtered the list to whatever
    // was a string, so when recents became objects every entry was dropped in
    // silence and a file-association launch stopped recognising anything but
    // `lastProject`. No error, no empty list, just a launcher that had quietly
    // narrowed. Asserted on an entry that is NOT lastProject on purpose.
    const store = fakeStore({ recents: [{ path: "/p/one" }, { path: "/p/two", name: "Two" }], lastProject: "/p/one" });
    const s = createProjectSession<string, string>({
      store,
      open: (p) => ({ session: p, root: p, reply: "ok" }),
    });
    expect(s.isKnownPath("/p/two")).toBe(true);
  });

  it("records the name the open revealed, without a second call to the store", () => {
    // The session is the thing that just opened the project, so it is where the
    // name is in hand. Before this an app had to touch the store again itself.
    const store = fakeStore();
    const s = createProjectSession<string, string>({
      store,
      open: () => ({ session: "live", root: "/p/proj", name: "The Tavern", reply: "ok" }),
    });
    s.openAt("/p/proj");
    expect(store.state.recents).toEqual([{ path: "/p/proj", name: "The Tavern" }]);
  });

  it("an open that reveals no name keeps the one already known", () => {
    const store = fakeStore({ recents: [{ path: "/p/proj", name: "The Tavern" }] });
    const s = createProjectSession<string, string>({
      store,
      open: () => ({ session: "live", root: "/p/proj", reply: "ok" }),
    });
    s.openAt("/p/proj");
    expect(store.state.recents).toEqual([{ path: "/p/proj", name: "The Tavern" }]);
  });
});
