// The other family app: the bundle's executable on macOS, the remembered answer
// first, Linux taking only that, Windows' per-user install, the Spotlight
// search never reached when a fixed place answers, the launch's arguments, one
// set of words for asking, and the one flow that asks, picks, and remembers.

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const spawned: Array<{ exe: string; args: string[]; opts: Record<string, unknown> }> = [];
const mdfind = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...a: unknown[]) => { mdfind(...a); const cb = a[a.length - 1] as (e: Error) => void; cb(new Error("no Spotlight here")); },
  spawn: (exe: string, args: string[], opts: Record<string, unknown>) => { spawned.push({ exe, args, opts }); return { unref() {} }; },
}));

const { SIBLING_APPS, appExecutable, findApp, launchApp, locateApp, locateCopy, locateDialogOptions } = await import("../src/sibling-app.js");

const dirs: string[] = [];
const tempRoot = (prefix: string): string => { const d = mkdtempSync(join(tmpdir(), prefix)); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); spawned.length = 0; mdfind.mockClear(); vi.unstubAllEnvs(); });

describe("the family's apps", () => {
  it("names each app's bundle id as its build.appId", () => {
    expect(SIBLING_APPS.patterpad).toEqual({ name: "Patterpad", bundleId: "com.patterkit.patterpad" });
    expect(SIBLING_APPS.storyletter).toEqual({ name: "Storyletter", bundleId: "studio.storylet.storyletter" });
  });

  it("runs the executable inside a macOS app bundle, and the path itself elsewhere", () => {
    expect(appExecutable("/Applications/Storyletter.app", SIBLING_APPS.storyletter, "darwin"))
      .toBe("/Applications/Storyletter.app/Contents/MacOS/Storyletter");
    expect(appExecutable("C:/x/Patterpad.exe", SIBLING_APPS.patterpad, "win32")).toBe("C:/x/Patterpad.exe");
  });
});

describe("findApp", () => {
  it("takes the place the author pointed at, and on Linux nothing else", async () => {
    const image = join(tempRoot("sibling-"), "Patterpad.AppImage");
    writeFileSync(image, "");
    expect(await findApp(SIBLING_APPS.patterpad, image, "linux")).toBe(image);
    expect(await findApp(SIBLING_APPS.patterpad, undefined, "linux")).toBeUndefined();
    expect(mdfind).not.toHaveBeenCalled();
  });

  it("looks in Windows' per-user install", async () => {
    const local = tempRoot("sibling-");
    const exe = join(local, "Programs", "Storyletter", "Storyletter.exe");
    mkdirSync(join(local, "Programs", "Storyletter"), { recursive: true });
    writeFileSync(exe, "");
    vi.stubEnv("LOCALAPPDATA", local);
    expect(await findApp(SIBLING_APPS.storyletter, undefined, "win32")).toBe(exe);
  });

  it("on macOS, never searches Spotlight when the remembered bundle answers", async () => {
    const bundle = join(tempRoot("sibling-"), "Patterpad.app");
    mkdirSync(join(bundle, "Contents", "MacOS"), { recursive: true });
    writeFileSync(join(bundle, "Contents", "MacOS", "Patterpad"), "");
    expect(await findApp(SIBLING_APPS.patterpad, bundle, "darwin")).toBe(join(bundle, "Contents", "MacOS", "Patterpad"));
    expect(mdfind).not.toHaveBeenCalled();
  });

  it("on macOS, searches Spotlight by bundle id only after the fixed places miss, and gives up quietly", async () => {
    const missing = join(tempRoot("sibling-"), "Nowhere.app");
    const found = await findApp({ name: "NoSuchSibling", bundleId: "test.no.such" }, missing, "darwin");
    expect(found).toBeUndefined();
    expect(mdfind).toHaveBeenCalledWith("mdfind", ["kMDItemCFBundleIdentifier == 'test.no.such'"], expect.anything(), expect.any(Function));
  });
});

describe("launchApp", () => {
  it("starts the executable detached, with --at when there's a place to open", () => {
    launchApp("/x/Storyletter", "/p/game.storylets", "intro");
    launchApp("/x/Patterpad", "/p/game.patter");
    expect(spawned.map((s) => [s.exe, s.args])).toEqual([
      ["/x/Storyletter", ["/p/game.storylets", "--at", "intro"]],
      ["/x/Patterpad", ["/p/game.patter"]],
    ]);
    expect(spawned[0]!.opts).toEqual({ detached: true, stdio: "ignore" });
  });
});

describe("asking where it is", () => {
  it("has one set of words, from either app", () => {
    expect(locateCopy(SIBLING_APPS.patterpad, "Storyletter")).toEqual({
      title: "Storyletter can't find Patterpad",
      body: "Point to it once and Storyletter will remember where it is.",
      locate: "Locate Patterpad…",
      pickerTitle: "Locate Patterpad",
      pickerMessage: "Choose the Patterpad app. Storyletter will remember where it is.",
      pickerButton: "Use Patterpad",
      notIt: "That isn't Patterpad.",
    });
  });

  it("starts the picker in Applications on macOS and takes the .exe on Windows", () => {
    expect(locateDialogOptions(SIBLING_APPS.storyletter, "Patterpad", "darwin")).toMatchObject({
      title: "Locate Storyletter", buttonLabel: "Use Storyletter", properties: ["openFile"],
      defaultPath: "/Applications", filters: [{ name: "Applications", extensions: ["app"] }],
    });
    expect(locateDialogOptions(SIBLING_APPS.storyletter, "Patterpad", "win32").filters).toEqual([{ name: "Storyletter", extensions: ["exe"] }]);
    const linux = locateDialogOptions(SIBLING_APPS.storyletter, "Patterpad", "linux");
    expect(linux).not.toHaveProperty("filters");
    expect(linux).not.toHaveProperty("defaultPath");
  });
});

describe("locateApp", () => {
  const app = SIBLING_APPS.patterpad;
  const image = (): string => { const p = join(tempRoot("sibling-"), "Patterpad.AppImage"); writeFileSync(p, ""); return p; };
  const flow = (over: Partial<Parameters<typeof locateApp>[0]> = {}) => {
    const asked: unknown[] = []; const picked: unknown[] = []; const kept: string[] = [];
    const run = locateApp({
      app, from: "Storyletter", remembered: undefined, platform: "linux",
      ask: async (p) => { asked.push(p); return 1; },
      pick: async (o) => { picked.push(o); return undefined; },
      remember: (p) => { kept.push(p); },
      ...over,
    });
    return { run, asked, picked, kept };
  };

  it("doesn't ask when the remembered path answers", async () => {
    const at = image();
    const f = flow({ remembered: at });
    await expect(f.run).resolves.toEqual({ executable: at });
    expect(f.asked).toEqual([]);
  });

  it("asks in the family's words, with Cancel first and Locate the default", async () => {
    const f = flow({ ask: async (p) => { f0.push(p); return 0; } });
    const f0: unknown[] = [];
    await expect(f.run).resolves.toEqual({ canceled: true });
    expect(f0).toEqual([{ title: "Storyletter can't find Patterpad", sub: "Point to it once and Storyletter will remember where it is.", buttons: ["Cancel", "Locate Patterpad…"], defaultId: 1, cancelId: 0 }]);
  });

  it("opens the picker with the family's options, and a cancelled pick is cancelled", async () => {
    const f = flow();
    await expect(f.run).resolves.toEqual({ canceled: true });
    expect(f.picked).toEqual([locateDialogOptions(app, "Storyletter", "linux")]);
    expect(f.kept).toEqual([]);
  });

  it("remembers what the author picked when it's the app", async () => {
    const at = image();
    const f = flow({ pick: async () => at });
    await expect(f.run).resolves.toEqual({ executable: at });
    expect(f.kept).toEqual([at]);
  });

  it("says so, and remembers nothing, when the pick isn't the app", async () => {
    const f = flow({ pick: async () => "/no/such/Patterpad" });
    await expect(f.run).resolves.toEqual({ error: "That isn't Patterpad." });
    expect(f.kept).toEqual([]);
  });
});
