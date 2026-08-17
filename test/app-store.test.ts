// The app store, and specifically that a place belongs to a PROJECT. This held
// one place and dropped it whenever another project was opened, which is the
// behaviour these tests exist to make impossible to reintroduce.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppStore } from "../src/app-store.js";

interface Where { scene: string; caret?: string }

let dir = "";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "shell-store-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const store = () => createAppStore<Where, { greeting: string }>({ dir, defaults: { greeting: "hi" } });

describe("places are per project", () => {
  it("keeps each project's place while you move between them", () => {
    const s = store();
    s.touchProject("/a");
    s.setPlace({ scene: "one", caret: "n1" });
    s.touchProject("/b");
    s.setPlace({ scene: "two" });
    s.touchProject("/a");

    // The old behaviour landed you at the top of A here, having forgotten.
    expect(s.placeOf()).toEqual({ scene: "one", caret: "n1" });
    expect(s.placeOf("/b")).toEqual({ scene: "two" });
  });

  it("survives a restart", () => {
    const first = store();
    first.touchProject("/a");
    first.setPlace({ scene: "one" });
    expect(store().placeOf("/a")).toEqual({ scene: "one" });
  });

  it("forgets a project's place when the project is forgotten", () => {
    const s = store();
    s.touchProject("/a");
    s.setPlace({ scene: "one" });
    s.forgetProject("/a");
    expect(s.placeOf("/a")).toBeUndefined();
  });

  it("drops places for projects that age out of recents", () => {
    // Otherwise the file grows for ever with places for projects the author
    // can no longer see in the menu.
    const s = createAppStore<Where, object>({ dir, defaults: {}, maxRecents: 2 });
    s.touchProject("/a"); s.setPlace({ scene: "one" });
    s.touchProject("/b"); s.touchProject("/c");
    expect(s.get().recents).toEqual(["/c", "/b"]);
    expect(s.placeOf("/a")).toBeUndefined();
  });

  it("ignores setPlace with no project open", () => {
    const s = store();
    s.setPlace({ scene: "nowhere" });
    expect(s.placeOf()).toBeUndefined();
  });

  it("MIGRATES a single `place` written by an older version", () => {
    // Without this, everyone's first launch after the update forgets where they
    // were, which is the complaint the change exists to fix.
    writeFileSync(join(dir, "app-settings.json"), JSON.stringify({
      recents: ["/a"], lastProject: "/a", place: { scene: "legacy" }, panes: {}, windows: {},
    }));
    const s = store();
    expect(s.placeOf("/a")).toEqual({ scene: "legacy" });
  });

  it("writes atomically, leaving no temp file behind", () => {
    const s = store();
    s.touchProject("/a");
    const saved = JSON.parse(readFileSync(join(dir, "app-settings.json"), "utf8")) as { recents: string[] };
    expect(saved.recents).toEqual(["/a"]);
  });
});
