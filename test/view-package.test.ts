// View packages (view-package.ts): reading a folder or an npm pack tarball, installing under
// <dir>/<id>/<version>/, listing, and choosing the installed version for a project's pin.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  chooseInstalled, compareVersions, installExtensionPackage, installedExtensions, readExtensionPackage, readTarball,
  planPackageAdd, removeInstalledExtension, resolveInstalled, viewMenuLabel, extensionRows, planProjectRemoval,
  planPackageUpdate, manifestChanges, sameAsInstalled,
} from "../src/view-package.js";
import type { ExtensionPackage, InstalledExtension } from "../src/view-package.js";

const PROBE = join(import.meta.dirname, "fixtures/probe-view");
const temps: string[] = [];
const temp = async (): Promise<string> => { const d = await mkdtemp(join(tmpdir(), "view-pkg-")); temps.push(d); return d; };
afterEach(async () => { for (const d of temps.splice(0)) await rm(d, { recursive: true, force: true }); });

/** A minimal ustar writer: regular files, and a pax header for a long name. */
function tar(entries: [string, string | Uint8Array, string?][]): Buffer {
  const blocks: Buffer[] = [];
  const header = (name: string, size: number, type: string): Buffer => {
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 100), 0, "utf8");
    h.write("0000644\0", 100); h.write("0000000\0", 108); h.write("0000000\0", 116);
    h.write(size.toString(8).padStart(11, "0") + "\0", 124);
    h.write("00000000000\0", 136);
    h.write("        ", 148);
    h.write(type, 156);
    h.write("ustar\0", 257); h.write("00", 263);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    return h;
  };
  const pad = (b: Buffer): Buffer => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
  for (const [name, content, type = "0"] of entries) {
    const body = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
    if (name.length > 100) {
      const rec = ` path=${name}\n`;
      let len = rec.length + 1;
      while (String(len).length + rec.length !== len) len = String(len).length + rec.length;
      const pax = Buffer.from(`${len}${rec}`);
      blocks.push(header("PaxHeader", pax.length, "x"), pad(pax));
    }
    blocks.push(header(name, body.length, type), pad(body));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

const manifestText = (id = "probe", version = "1.0.0", extra = ""): string => JSON.stringify({
  schema: "wildwinter/extension@0", id, name: "Probe", version,
  targets: { patter: { line: { fields: [{ name: "note", type: "text" }] } } },
  views: [{ id: "inspect", name: "Probe view", entry: "view/probe-view.js", element: "probe-view" }],
}) + extra;

describe("readExtensionPackage", () => {
  it("reads the fixture folder: its manifest, no problems, and its files", async () => {
    const r = await readExtensionPackage(PROBE);
    if (!r.ok) throw new Error(r.why);
    expect(r.manifest.id).toBe("probe");
    expect(r.problems).toEqual([]);
    expect([...r.files.keys()].sort()).toEqual(["package.json", "probe.extension.json", "view/probe-view.js"]);
  });

  it("skips node_modules and dotfiles in a folder", async () => {
    const d = await temp();
    await writeFile(join(d, "probe.extension.json"), manifestText());
    await mkdir(join(d, "node_modules/x"), { recursive: true });
    await writeFile(join(d, "node_modules/x/a.js"), "");
    await writeFile(join(d, ".DS_Store"), "");
    const r = await readExtensionPackage(d);
    expect(r.ok && [...r.files.keys()]).toEqual(["probe.extension.json"]);
  });

  it("reads an npm pack tarball, taking off package/, with a long pax name", async () => {
    const d = await temp();
    const long = `package/view/${"a".repeat(120)}.js`;
    await writeFile(join(d, "probe-1.0.0.tgz"), gzipSync(tar([
      ["package/probe.extension.json", manifestText()],
      ["package/view/probe-view.js", "export {};"],
      [long, "x"],
      ["package/view", "", "5"],
    ])));
    const r = await readExtensionPackage(join(d, "probe-1.0.0.tgz"));
    if (!r.ok) throw new Error(r.why);
    expect([...r.files.keys()].sort()).toEqual(["probe.extension.json", `view/${"a".repeat(120)}.js`, "view/probe-view.js"]);
    expect(new TextDecoder().decode(r.files.get("view/probe-view.js"))).toBe("export {};");
  });

  it("refuses a tarball with a path out of the package, and a file that isn't one", async () => {
    expect(readTarball(gzipSync(tar([["package/../evil.js", "x"]])))).toMatch(/outside it/);
    expect(readTarball(Buffer.from("not gzip"))).toMatch(/isn't a folder or an npm package tarball/);
  });

  it("says why when there's no manifest, two, a mismatched one, or nothing at all", async () => {
    const d = await temp();
    expect(await readExtensionPackage(join(d, "nope"))).toEqual({ ok: false, why: `There's nothing at ${join(d, "nope")}.` });
    expect(await readExtensionPackage(d)).toMatchObject({ ok: false, why: expect.stringMatching(/no extension manifest/) });
    await writeFile(join(d, "probe.extension.json"), manifestText());
    await writeFile(join(d, "other.extension.json"), manifestText("other"));
    expect(await readExtensionPackage(d)).toMatchObject({ ok: false, why: expect.stringMatching(/more than one extension manifest at its top level: other.extension.json, probe.extension.json/) });
    await rm(join(d, "other.extension.json"));
    await writeFile(join(d, "probe.extension.json"), manifestText("pro"));
    expect(await readExtensionPackage(d)).toMatchObject({ ok: false, why: expect.stringMatching(/names the extension "pro"/) });
  });
});

describe("installing", () => {
  it("installs into <dir>/<id>/<version>, lists it, replaces it, and removes it", async () => {
    const dir = await temp();
    const r = await readExtensionPackage(PROBE);
    if (!r.ok) throw new Error(r.why);
    const done = await installExtensionPackage(r, dir);
    if (!done.ok) throw new Error(done.why);
    expect(done.installed.root).toBe(join(dir, "probe", "1.0.0"));
    expect(await readFile(join(dir, "probe/1.0.0/view/probe-view.js"), "utf8")).toContain("probe-view");
    const again = await installExtensionPackage({ ...r, files: new Map([...r.files].filter(([p]) => p !== "package.json")) }, dir);
    expect(again.ok).toBe(true);
    expect((await readdir(join(dir, "probe/1.0.0"))).sort()).toEqual(["probe.extension.json", "view"]);
    expect(await readdir(join(dir, "probe"))).toEqual(["1.0.0"]);   // no temp folders left behind
    const listed = await installedExtensions(dir);
    expect(listed.map((x) => [x.id, x.version, x.manifest.name])).toEqual([["probe", "1.0.0", "Probe"]]);
    await removeInstalledExtension(dir, "probe", "1.0.0");
    expect(await installedExtensions(dir)).toEqual([]);
  });

  it("won't install a manifest with a fault", async () => {
    const pkg: ExtensionPackage = {
      manifest: JSON.parse(manifestText()), files: new Map(),
      problems: [{ severity: "error", code: "x", path: "", message: "the manifest has no name" }],
    };
    expect(await installExtensionPackage(pkg, await temp())).toEqual({ ok: false, why: "Probe's manifest has a fault, so it won't install: the manifest has no name." });
  });
});

describe("choosing the installed version", () => {
  const at = (version: string): InstalledExtension => ({ id: "pattershot", version, root: `/x/${version}`, manifest: { name: "Pattershot" } as never });
  const all = [at("0.3.0"), at("0.4.1"), at("1.2.0")];

  it("compares versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
  it("takes the pinned version exactly", () => {
    expect(chooseInstalled(all, "pattershot", "0.3.0")).toEqual({ installed: all[0] });
  });
  it("takes the highest of the same major with a warning", () => {
    expect(chooseInstalled([at("0.4.1"), at("1.2.0")], "pattershot", "0.3.0")).toEqual({
      installed: at("0.4.1"), warning: "This project expects Pattershot 0.3.0; 0.4.1 is installed.",
    });
  });
  it("opens nothing across a major version, and says so", () => {
    expect(chooseInstalled([at("1.2.0")], "pattershot", "0.3.0")).toEqual({
      installed: null, why: "This project expects Pattershot 0.3.0; 1.2.0 is installed, and a different major version won't open.",
    });
  });
  it("says when it isn't installed, and takes the highest with no pin", () => {
    expect(chooseInstalled([], "pattershot", "0.3.0", "Pattershot")).toEqual({ installed: null, why: "Pattershot isn't installed on this machine." });
    expect(chooseInstalled(all, "pattershot").installed?.version).toBe("1.2.0");
  });
  it("resolves over a real folder", async () => {
    const dir = await temp();
    const r = await readExtensionPackage(PROBE);
    if (!r.ok) throw new Error(r.why);
    await installExtensionPackage(r, dir);
    expect((await resolveInstalled(dir, "probe", "1.0.0")).installed?.root).toBe(join(dir, "probe/1.0.0"));
    expect(await resolveInstalled(dir, "probe", "1.1.0")).toMatchObject({ warning: "This project expects Probe 1.1.0; 1.0.0 is installed." });
  });
});

describe("planning Add Extension", () => {
  const shot = (version: string, requires?: string[]) => ({
    schema: "wildwinter/extension@0", id: "pattershot", name: "Pattershot", version, targets: { patter: {} },
    ...(requires ? { requires } : {}),
  }) as never;

  it("takes an extension the project lacks, with the requirements it lacks", () => {
    expect(planPackageAdd(shot("0.4.0", ["patterstage"]), [])).toEqual({ project: "take", version: "0.4.0", missing: ["patterstage"] });
    expect(planPackageAdd(shot("0.4.0", ["patterstage"]), [{ id: "patterstage", pin: "0.5.0" }]))
      .toEqual({ project: "take", version: "0.4.0", missing: [] });
  });
  it("installs only at the pinned version", () => {
    expect(planPackageAdd(shot("0.4.0", ["patterstage"]), [{ id: "pattershot", pin: "0.4.0" }]))
      .toEqual({ project: "none", pinned: "0.4.0", version: "0.4.0", missing: [] });
  });
  it("offers a newer version, with what it would need", () => {
    expect(planPackageAdd(shot("0.5.0", ["patterstage"]), [{ id: "pattershot", pin: "0.4.0" }]))
      .toEqual({ project: "update", pinned: "0.4.0", version: "0.5.0", missing: ["patterstage"] });
  });
  it("never downgrades, and says so", () => {
    expect(planPackageAdd(shot("0.3.0"), [{ id: "pattershot", pin: "0.4.0" }])).toEqual({
      project: "none", pinned: "0.4.0", version: "0.3.0", missing: [],
      note: "This project takes Pattershot 0.4.0, newer than this package's 0.3.0, so it keeps 0.4.0.",
    });
    expect(planPackageAdd(shot("0.9.0"), [{ id: "pattershot", pin: "1.0.0" }]).note)
      .toBe("This project takes Pattershot 1.0.0, newer than this package's 0.9.0, so it keeps 1.0.0. The views installed from this package won't open in it, being a different major version.");
  });
  it("labels a view not installed here", () => {
    expect(viewMenuLabel("Performance sheet", true)).toBe("Performance sheet");
    expect(viewMenuLabel("Performance sheet", false)).toBe("Performance sheet (not installed)…");
  });
});

describe("the Extensions window's rows", () => {
  const man = (id: string, name: string, version: string, extra: Record<string, unknown> = {}) => ({
    schema: "wildwinter/extension@0", id, name, version, targets: { patter: {} }, ...extra,
  }) as never;
  const sheet = { views: [{ id: "sheet", name: "Performance sheet", entry: "view/s.js", element: "x-sheet" }] };
  const stage = { id: "patterstage", pin: "0.5.0", manifest: man("patterstage", "Patterstage", "0.5.0") };
  const shot = { id: "pattershot", pin: "0.4.0", manifest: man("pattershot", "Pattershot", "0.4.0", { ...sheet, requires: ["patterstage"] }) };
  const at = (id: string, name: string, version: string, extra = {}): InstalledExtension =>
    ({ id, version, manifest: man(id, name, version, extra), root: `/v/${id}/${version}` });

  it("lists what the project takes and what's installed, by name, each with its versions and views", () => {
    const rows = extensionRows([shot, stage], [at("pattershot", "Pattershot", "0.4.0", sheet), at("pattershot", "Pattershot", "0.3.0", sheet), at("other", "Another", "1.0.0")], "patter");
    expect(rows.map((r) => r.name)).toEqual(["Another", "Pattershot", "Patterstage"]);
    expect(rows[1]).toEqual({
      id: "pattershot", name: "Pattershot", inProject: true, pinned: "0.4.0", views: ["Performance sheet"],
      installed: ["0.3.0", "0.4.0"], needsInstall: false, requiredBy: [],
    });
    expect(rows[2]).toMatchObject({ inProject: true, views: [], installed: [], needsInstall: false, requiredBy: ["Pattershot"] });
    expect(rows[0]).toMatchObject({ inProject: false, installed: ["1.0.0"], requiredBy: [] });
    expect(rows[0]!.pinned).toBeUndefined();
  });
  it("says when a taken extension's views aren't installed here", () => {
    expect(extensionRows([shot], [], "patter")[0]).toMatchObject({ needsInstall: true, installed: [] });
  });

  it("refuses to remove an extension another one needs, naming it, and one the project doesn't take", () => {
    expect(planProjectRemoval("patterstage", [shot, stage])).toEqual({ ok: false, why: "Pattershot needs Patterstage, so remove Pattershot first." });
    expect(planProjectRemoval("pattershot", [shot, stage])).toEqual({ ok: true, name: "Pattershot" });
    expect(planProjectRemoval("nope", [shot])).toEqual({ ok: false, why: "This project doesn't take nope." });
    const two = { id: "b", manifest: man("b", "Bee", "1.0.0", { requires: ["patterstage"] }) };
    expect(planProjectRemoval("patterstage", [shot, stage, two]))
      .toEqual({ ok: false, why: "Pattershot and Bee need Patterstage, so remove Pattershot and Bee first." });
  });
});

describe("Update…", () => {
  const m = (version: string, extra: Record<string, unknown> = {}) => ({
    schema: "wildwinter/extension@0", id: "pattershot", name: "Pattershot", version,
    targets: { patter: { line: { fields: [{ name: "look", label: "Look", type: "text" }] } } }, ...extra,
  }) as never;
  const row = { id: "pattershot", name: "Pattershot", inProject: true, pinned: "0.4.0", installed: ["0.4.0"] };

  it("refuses another extension's package, naming both", () => {
    expect(planPackageUpdate(row, { ...(m("0.5.0") as object), id: "lights", name: "Lights" } as never, m("0.4.0"), "patter", []))
      .toEqual({ kind: "refused", why: "That package is Lights (\u201clights\u201d), not Pattershot (\u201cpattershot\u201d), so nothing changed." });
  });
  it("refuses an older version, naming both", () => {
    expect(planPackageUpdate(row, m("0.3.0"), m("0.4.0"), "patter", [])).toEqual({
      kind: "refused", why: "This project takes Pattershot 0.4.0, newer than this package's 0.3.0, so nothing changed: an update never goes back to an older version.",
    });
    expect(planPackageUpdate({ ...row, inProject: false, pinned: undefined as never, installed: ["0.3.0", "0.4.0"] }, m("0.3.5"), m("0.4.0"), "patter", []))
      .toMatchObject({ kind: "refused", why: expect.stringContaining("Pattershot 0.4.0 is installed here") });
  });
  it("calls the same version a reinstall", () => {
    expect(planPackageUpdate(row, m("0.4.0"), m("0.4.0"), "patter", [])).toEqual({ kind: "same", version: "0.4.0" });
  });
  it("says what a newer version changes, and what it needs that the project lacks", () => {
    const next = m("0.5.0", {
      targets: { patter: { line: { fields: [{ name: "gesture", label: "Gesture", type: "text" }] }, scene: { fields: [{ name: "mood", type: "text" }] } } },
      views: [{ id: "sheet", name: "Performance sheet", entry: "view/s.js", element: "x-sheet" }],
      requires: ["patterstage"],
    });
    expect(planPackageUpdate(row, next, m("0.4.0"), "patter", [])).toEqual({
      kind: "newer", from: "0.4.0", to: "0.5.0", missing: ["patterstage"],
      changes: [
        "Line: adds \u201cGesture\u201d; removes \u201cLook\u201d.",
        "Scene: adds \u201cmood\u201d.",
        "Views: adds Performance sheet.",
        "Now needs \u201cpatterstage\u201d.",
      ],
    });
    expect(manifestChanges(m("0.4.0"), m("0.5.0"), "patter")).toEqual([]);
  });

  it("knows when a package's files are exactly what's installed", async () => {
    const dir = await temp();
    const pkg = await readExtensionPackage(PROBE);
    if (!pkg.ok) throw new Error(pkg.why);
    const r = await installExtensionPackage(pkg, dir);
    if (!r.ok) throw new Error(r.why);
    expect(await sameAsInstalled(pkg, r.installed.root)).toBe(true);
    const changed = new Map(pkg.files);
    changed.set("view/probe-view.js", new TextEncoder().encode("// rebuilt"));
    expect(await sameAsInstalled({ ...pkg, files: changed }, r.installed.root)).toBe(false);
    const more = new Map(pkg.files);
    more.set("view/extra.js", new TextEncoder().encode("x"));
    expect(await sameAsInstalled({ ...pkg, files: more }, r.installed.root)).toBe(false);
    expect(await sameAsInstalled(pkg, join(dir, "nope"))).toBe(false);
  });
});
