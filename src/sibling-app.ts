// ---------------------------------------------------------------------------
// The other family app: find it on this machine and start it at a place in a
// project. Show Card in Storyletter (Patterpad) and Show Scene in Patterpad
// (Storyletter) were this file twice, and had drifted (Storyletter searched
// Spotlight on its main thread before the usual folders, and froze when
// Patterpad wasn't installed). Main-process, Node only.
//
// Finding it: the author's own answer first (remembered per person, since
// where an app is installed differs between machines), then where each
// platform puts it (macOS the two Applications folders, Windows the per-user
// installer's default), then on macOS Spotlight by bundle id, asynchronously
// and only after the fixed places miss. Linux ships an AppImage, which lives
// wherever it was saved, so there the author points at it.
//
// Starting it: every family app takes `<app> <project> --at <address>` and
// forwards a second launch to the running app, which jumps in place. So this
// starts the executable directly, never `open -a` on macOS: a cold `open`
// delivers the project through open-file and drops `--at`.
//
// Asking where it is, once neither answers, is locateApp: the same flow in both
// apps, asked in the window through the app's prompt (prompt-main.ts), then a
// file picker, then remembered.
// ---------------------------------------------------------------------------

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AppPrompt } from "./prompt-channels.js";

const execFileAsync = promisify(execFile);

/** A family app another can open. */
export interface SiblingApp {
  /** Its product name: the bundle's and the executable's name, and what the words call it. */
  name: string;
  /** Its appId (`build.appId` in the app's package.json): Spotlight finds it by this on macOS. */
  bundleId: string;
}

/** The family's apps. Room for more (Pattershot) when one needs opening. */
export const SIBLING_APPS = {
  patterpad: { name: "Patterpad", bundleId: "com.patterkit.patterpad" },
  storyletter: { name: "Storyletter", bundleId: "studio.storylet.storyletter" },
} as const satisfies Record<string, SiblingApp>;

/** The executable inside a macOS app bundle, or the path itself for anything else. */
export function appExecutable(path: string, app: SiblingApp, platform: NodeJS.Platform = process.platform): string {
  return platform === "darwin" && path.endsWith(".app") ? join(path, "Contents", "MacOS", app.name) : path;
}

/** Where `app` is on this machine, as an executable to start, or undefined. `remembered` is the author's
 *  own answer (an app bundle or an executable). Never blocks: Spotlight runs asynchronously, and only when
 *  the fixed places miss. */
export async function findApp(app: SiblingApp, remembered?: string, platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  const candidates: string[] = [];
  if (remembered) candidates.push(appExecutable(remembered, app, platform));
  if (platform === "darwin") {
    candidates.push(
      appExecutable(`/Applications/${app.name}.app`, app, platform),
      appExecutable(join(homedir(), "Applications", `${app.name}.app`), app, platform),
    );
  } else if (platform === "win32") {
    const local = process.env["LOCALAPPDATA"];
    if (local) candidates.push(join(local, "Programs", app.name, `${app.name}.exe`));
  }
  const fixed = candidates.find((c) => existsSync(c));
  if (fixed || platform !== "darwin") return fixed;
  try {
    const { stdout } = await execFileAsync("mdfind", [`kMDItemCFBundleIdentifier == '${app.bundleId}'`], { encoding: "utf8", timeout: 3000 });
    return stdout.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".app"))
      .map((found) => appExecutable(found, app, platform)).find((c) => existsSync(c));
  } catch { return undefined; } // Spotlight off or slow
}

/** Start the app on `project`, at `address` when given (`<project> --at <address>`). Detached: it outlives
 *  the app that started it. Throws only when the executable can't be started at all. */
export function launchApp(executable: string, project: string, address?: string): void {
  const args = address !== undefined ? [project, "--at", address] : [project];
  spawn(executable, args, { detached: true, stdio: "ignore" }).unref();
}

/** The words for asking where `app` is, from the app `from` (its name). One set for the family. */
export function locateCopy(app: SiblingApp, from: string): {
  /** The confirm's title and body, and its button (Cancel is the other). */
  title: string; body: string; locate: string;
  /** The file picker's title, message, and button. */
  pickerTitle: string; pickerMessage: string; pickerButton: string;
  /** What was picked isn't the app. */
  notIt: string;
} {
  return {
    title: `${from} can't find ${app.name}`,
    body: `Point to it once and ${from} will remember where it is.`,
    locate: `Locate ${app.name}…`,
    pickerTitle: `Locate ${app.name}`,
    pickerMessage: `Choose the ${app.name} app. ${from} will remember where it is.`,
    pickerButton: `Use ${app.name}`,
    notIt: `That isn't ${app.name}.`,
  };
}

/** The file picker's options for locating `app` (pass them to `dialog.showOpenDialog`): starts in
 *  Applications and takes apps on macOS, takes the .exe on Windows. */
export function locateDialogOptions(app: SiblingApp, from: string, platform: NodeJS.Platform = process.platform): {
  title: string; message: string; buttonLabel: string; properties: ["openFile"];
  defaultPath?: string; filters?: { name: string; extensions: string[] }[];
} {
  const copy = locateCopy(app, from);
  return {
    title: copy.pickerTitle, message: copy.pickerMessage, buttonLabel: copy.pickerButton, properties: ["openFile"],
    ...(platform === "darwin" ? { defaultPath: "/Applications", filters: [{ name: "Applications", extensions: ["app"] }] } : {}),
    ...(platform === "win32" ? { filters: [{ name: app.name, extensions: ["exe"] }] } : {}),
  };
}

/** What `locateApp` needs from the app: how it asks and picks (its window prompt and file picker), and
 *  the remembered path it keeps per person. */
export interface LocateAppOptions {
  app: SiblingApp;
  /** The asking app's name. */
  from: string;
  remembered: string | undefined;
  /** Ask in the window: the app's `WindowPrompt.ask`. */
  ask: (prompt: AppPrompt) => Promise<number>;
  /** The file picker, given `locateDialogOptions`: the path chosen, or undefined when cancelled. */
  pick: (options: ReturnType<typeof locateDialogOptions>) => Promise<string | undefined>;
  /** Keep the path the author pointed at. */
  remember: (path: string) => void;
  platform?: NodeJS.Platform;
}

/** Find `app`, asking the author to point at it when it can't be found, and remember their answer. The
 *  executable to start; `canceled` when they said no; `error` (the words to show) when what they picked
 *  isn't the app. */
export async function locateApp(opts: LocateAppOptions): Promise<{ executable: string } | { canceled: true } | { error: string }> {
  const platform = opts.platform ?? process.platform;
  const found = await findApp(opts.app, opts.remembered, platform);
  if (found !== undefined) return { executable: found };
  const copy = locateCopy(opts.app, opts.from);
  const answer = await opts.ask({ title: copy.title, sub: copy.body, buttons: ["Cancel", copy.locate], defaultId: 1, cancelId: 0 });
  if (answer !== 1) return { canceled: true };
  const chosen = await opts.pick(locateDialogOptions(opts.app, opts.from, platform));
  if (chosen === undefined) return { canceled: true };
  const executable = await findApp(opts.app, chosen, platform);
  if (executable === undefined) return { error: copy.notIt };
  opts.remember(chosen);
  return { executable };
}
