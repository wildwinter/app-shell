// ---------------------------------------------------------------------------
// View packages (tier 2 view extensions, patterkit design/view-extensions.md):
// reading an extension's local package, a folder or an `npm pack` tarball,
// installing it on this machine under `<dir>/<id>/<version>/`, listing what's
// installed, and choosing the installed version for a project's pin.
//
// Main-process code with no Electron import, so it runs under test as it is.
// The tarball reader is a small ustar reader over node:zlib (pax and GNU long
// names included), so the package takes no new dependency.
// ---------------------------------------------------------------------------

import { gunzipSync } from "node:zlib";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { manifestProblems, parseManifest, MANIFEST_FILE_SUFFIX } from "@wildwinter/toolkit/extensions";
import type { Manifest, Problem } from "@wildwinter/toolkit/extensions";

const ID = /^[a-z][a-z0-9-]*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
/** The most a package may hold, so a stray folder can't fill memory. */
const MAX_BYTES = 64 * 1024 * 1024;

/** An extension's package, read: its manifest, the manifest's problems, and its files by relative path. */
export interface ExtensionPackage {
  readonly manifest: Manifest;
  /** The manifest's problems; a package with an error among them won't install. */
  readonly problems: readonly Problem[];
  /** Every file, by its forward-slash path relative to the package root. No node_modules, no dotfiles. */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export type PackageRead = ({ readonly ok: true } & ExtensionPackage) | { readonly ok: false; readonly why: string };

/** One installed version of an extension. */
export interface InstalledExtension {
  readonly id: string;
  readonly version: string;
  readonly manifest: Manifest;
  /** The version's folder: `<dir>/<id>/<version>`. */
  readonly root: string;
}

/** A path inside a package is kept unless a segment is a dotfile or node_modules. */
const kept = (path: string): boolean => path.split("/").every((s) => s !== "node_modules" && !s.startsWith("."));
/** A relative, forward-slash path with no empty, `.` or `..` segment. */
const safePath = (path: string): boolean =>
  path !== "" && !path.includes("\\") && !path.includes("\0") && !path.startsWith("/")
  && path.split("/").every((s) => s !== "" && s !== "." && s !== "..");

// --- Reading ---------------------------------------------------------------------

/** Read a package from a folder or an `npm pack` .tgz, and find its one `<id>.extension.json` at the top level. */
export async function readExtensionPackage(path: string): Promise<PackageRead> {
  let stat;
  try { stat = await lstat(path); } catch { return { ok: false, why: `There's nothing at ${path}.` }; }
  let files: Map<string, Uint8Array> | string;
  if (stat.isDirectory()) files = await readFolder(path);
  else if (stat.isFile()) files = readTarball(await readFile(path));
  else return { ok: false, why: `${basename(path)} isn't a folder or an npm package tarball (.tgz).` };
  if (typeof files === "string") return { ok: false, why: files };
  return packageFromFiles(files);
}

/** A package from its files, as read: find the manifest, parse it, check it. */
export function packageFromFiles(files: Map<string, Uint8Array>): PackageRead {
  const manifests = [...files.keys()].filter((p) => !p.includes("/") && p.endsWith(MANIFEST_FILE_SUFFIX));
  if (manifests.length === 0) {
    return { ok: false, why: `This package has no extension manifest (a file such as pattershot${MANIFEST_FILE_SUFFIX}) at its top level.` };
  }
  if (manifests.length > 1) {
    return { ok: false, why: `This package has more than one extension manifest at its top level: ${manifests.sort().join(", ")}.` };
  }
  const file = manifests[0]!;
  let manifest: Manifest;
  try { manifest = parseManifest(new TextDecoder().decode(files.get(file)!)); } catch (e) {
    return { ok: false, why: `The manifest ${file} won't parse: ${(e as Error).message}` };
  }
  const problems = manifestProblems(manifest);
  const stem = file.slice(0, -MANIFEST_FILE_SUFFIX.length);
  if (typeof manifest === "object" && manifest !== null && typeof manifest.id === "string" && manifest.id !== stem) {
    return { ok: false, why: `The manifest ${file} names the extension "${manifest.id}"; its file name should match.` };
  }
  return { ok: true, manifest, problems, files };
}

async function readFolder(root: string): Promise<Map<string, Uint8Array> | string> {
  const files = new Map<string, Uint8Array>();
  let total = 0;
  const walk = async (dir: string, rel: string): Promise<string | null> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (!kept(path)) continue;
      // Links are skipped: a package is its own files, never somewhere else's.
      if (entry.isDirectory()) {
        const why = await walk(join(dir, entry.name), path);
        if (why) return why;
      } else if (entry.isFile()) {
        const bytes = await readFile(join(dir, entry.name));
        total += bytes.length;
        if (total > MAX_BYTES) return tooBig();
        files.set(path, bytes);
      }
    }
    return null;
  };
  const why = await walk(root, "");
  return why ?? files;
}

const tooBig = (): string => `This package is bigger than ${MAX_BYTES / 1024 / 1024} MB, which is more than a view should need.`;
const notATarball = "This file isn't a folder or an npm package tarball (.tgz).";

/** The files in a gzipped tar, with the one top folder every entry shares (`package/` from npm) taken off. */
export function readTarball(gz: Uint8Array): Map<string, Uint8Array> | string {
  let tar: Buffer;
  try { tar = gunzipSync(gz, { maxOutputLength: MAX_BYTES * 2 }); } catch { return notATarball; }
  const raw: [string, Uint8Array][] = [];
  let at = 0;
  let longName: string | null = null;
  let total = 0;
  const text = (from: number, len: number): string => {
    const slice = tar.subarray(from, from + len);
    const end = slice.indexOf(0);
    return slice.subarray(0, end < 0 ? slice.length : end).toString("utf8");
  };
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    if (text(at + 257, 5) !== "ustar") return notATarball;
    const size = parseInt(text(at + 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0) return notATarball;
    const type = String.fromCharCode(header[156]!);
    const prefix = text(at + 345, 155);
    const name = prefix ? `${prefix}/${text(at, 100)}` : text(at, 100);
    const body = tar.subarray(at + 512, at + 512 + size);
    if (body.length < size) return notATarball;
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") { longName = paxPath(body.toString("utf8")) ?? longName; continue; }
    if (type === "L") { longName = body.toString("utf8").replace(/\0+$/, ""); continue; }
    if (type === "g") continue;
    const path = (longName ?? name).replace(/^\.\//, "");
    longName = null;
    // Regular files only: directories are implied, and links are never followed.
    if (type !== "0" && type !== "\0") continue;
    if (!safePath(path)) return "This package holds a file that would land outside it, so it won't be read.";
    total += size;
    if (total > MAX_BYTES) return tooBig();
    raw.push([path, new Uint8Array(body)]);
  }
  const tops = new Set(raw.map(([p]) => p.split("/")[0]));
  const strip = tops.size === 1 && raw.every(([p]) => p.includes("/"));
  const files = new Map<string, Uint8Array>();
  for (const [p, bytes] of raw) {
    const path = strip ? p.slice(p.indexOf("/") + 1) : p;
    if (kept(path)) files.set(path, bytes);
  }
  return files;
}

/** The `path` record of a pax extended header. */
function paxPath(records: string): string | null {
  for (const line of records.split("\n")) {
    const m = /^\d+ path=(.*)$/.exec(line);
    if (m) return m[1]!;
  }
  return null;
}

// --- Installing ----------------------------------------------------------------------

/**
 * Copy a package's files into `<dir>/<id>/<version>/`, replacing the same version if it's there. Written to a
 * temporary folder first and renamed into place, so a failed install leaves what was there before.
 */
export async function installExtensionPackage(
  pkg: ExtensionPackage, dir: string,
): Promise<{ readonly ok: true; readonly installed: InstalledExtension } | { readonly ok: false; readonly why: string }> {
  const { manifest } = pkg;
  const name = typeof manifest.name === "string" ? manifest.name : "This extension";
  const errors = pkg.problems.filter((p) => p.severity === "error");
  if (errors.length > 0 || !ID.test(manifest.id) || !VERSION.test(manifest.version)) {
    const first = errors[0];
    return { ok: false, why: `${name}'s manifest has a fault, so it won't install${first ? `: ${first.message}` : ""}.` };
  }
  const home = join(dir, manifest.id);
  const target = join(home, manifest.version);
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const temp = join(home, `.installing-${manifest.version}-${stamp}`);
  const old = join(home, `.replaced-${manifest.version}-${stamp}`);
  try {
    await mkdir(temp, { recursive: true });
    for (const [path, bytes] of pkg.files) {
      if (!safePath(path) || !kept(path)) continue;
      const to = join(temp, ...path.split("/"));
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, bytes);
    }
    let replaced = false;
    try { await rename(target, old); replaced = true; } catch { /* nothing there yet */ }
    try { await rename(temp, target); } catch (e) {
      if (replaced) await rename(old, target).catch(() => {});
      throw e;
    }
    if (replaced) await rm(old, { recursive: true, force: true });
  } catch (e) {
    await rm(temp, { recursive: true, force: true }).catch(() => {});
    return { ok: false, why: `${name} couldn't be installed: ${(e as Error).message}` };
  }
  return { ok: true, installed: { id: manifest.id, version: manifest.version, manifest, root: target } };
}

/** Remove an installed extension: one version, or every version when none is named. */
export async function removeInstalledExtension(dir: string, id: string, version?: string): Promise<void> {
  if (!ID.test(id) || (version !== undefined && !VERSION.test(version))) return;
  await rm(version === undefined ? join(dir, id) : join(dir, id, version), { recursive: true, force: true });
}

/** Every installed version of every extension under `dir`, by id and then version, oldest first. */
export async function installedExtensions(dir: string): Promise<InstalledExtension[]> {
  const out: InstalledExtension[] = [];
  const names = async (path: string): Promise<string[]> => {
    try { return (await readdir(path, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; }
  };
  for (const id of (await names(dir)).filter((n) => ID.test(n)).sort()) {
    for (const version of (await names(join(dir, id))).filter((n) => VERSION.test(n))) {
      const root = join(dir, id, version);
      try {
        const manifest = parseManifest(await readFile(join(root, `${id}${MANIFEST_FILE_SUFFIX}`), "utf8"));
        if (manifest.id !== id || manifest.version !== version) continue;
        out.push({ id, version, manifest, root });
      } catch { /* a broken install is as good as none */ }
    }
  }
  return out.sort((a, b) => (a.id === b.id ? compareVersions(a.version, b.version) : a.id < b.id ? -1 : 1));
}

/** Compare two major.minor.patch versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Which installed version a project gets: the one to open, with a warning to show, or none and why. */
export interface InstalledChoice {
  readonly installed: InstalledExtension | null;
  /** The installed version isn't the pinned one but shares its major version: it opens, with this shown. */
  readonly warning?: string;
  /** Why nothing opens. */
  readonly why?: string;
}

/**
 * Choose among installed versions for a project's pin: the pinned version exactly, else the highest with the
 * same major version (with a warning), else none. With no pin, the highest. `name` is the extension's name for
 * the sentences, when the project knows it (the id otherwise, or the installed manifest's name).
 */
export function chooseInstalled(
  installed: readonly InstalledExtension[], id: string, pinned?: string, name?: string,
): InstalledChoice {
  const mine = installed.filter((x) => x.id === id).sort((a, b) => compareVersions(b.version, a.version));
  const called = name ?? mine[0]?.manifest.name ?? id;
  if (mine.length === 0) return { installed: null, why: `${called} isn't installed on this machine.` };
  if (pinned === undefined) return { installed: mine[0]! };
  const exact = mine.find((x) => x.version === pinned);
  if (exact) return { installed: exact };
  const major = pinned.split(".")[0];
  const same = mine.find((x) => x.version.split(".")[0] === major);
  if (same) return { installed: same, warning: `This project expects ${called} ${pinned}; ${same.version} is installed.` };
  return {
    installed: null,
    why: `This project expects ${called} ${pinned}; ${mine[0]!.version} is installed, and a different major version won't open.`,
  };
}

/** `chooseInstalled` over what's installed under `dir`. */
export async function resolveInstalled(dir: string, id: string, pinned?: string, name?: string): Promise<InstalledChoice> {
  return chooseInstalled(await installedExtensions(dir), id, pinned, name);
}
