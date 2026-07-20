// Cut a GitHub Release for @wildwinter/app-shell, with the version bump baked
// into the command. Creating the Release triggers .github/workflows/publish.yml,
// which publishes the package if its current version is not yet on npm. The bump
// happens HERE so the released tag always points at a fresh, not-yet-published
// version (publishing an already-published version would be a silent no-op).
//
// Usage:
//   npm run release -- patch      # 0.1.0 -> 0.1.1
//   npm run release -- minor      # 0.1.0 -> 0.2.0
//   npm run release -- 0.3.0      # explicit version
//
// Safety: refuses a dirty or unpushed tree, a missing bump, a bump that doesn't
// change the version, or a target version already on the registry.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const fail = (msg) => { console.error(`release: ${msg}`); process.exit(1); };
const version = () => JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const bump = process.argv[2];
if (!bump) fail("usage: npm run release -- <patch | minor | major | x.y.z>");

if (sh("git status --porcelain")) fail("working tree is dirty - commit or stash first.");
try {
  sh("git fetch --quiet");
  if (sh("git rev-list --count @{upstream}..HEAD") !== "0") fail("HEAD is ahead of its upstream - push before releasing.");
} catch {
  console.warn("release: no upstream tracking branch; skipping the push check.");
}

const before = version();
run(`npm version ${JSON.stringify(bump)} --no-git-tag-version`);
const after = version();
if (after === before) fail(`version unchanged (still ${before}) - nothing to release.`);

const published = sh(`npm view @wildwinter/app-shell@${after} version --@wildwinter:registry=https://registry.npmjs.org 2>/dev/null || true`);
if (published === after) {
  run("git checkout -- package.json package-lock.json");
  fail(`@wildwinter/app-shell@${after} is already on the registry; bump to a newer version.`);
}

const tag = `v${after}`;
console.log(`release: @wildwinter/app-shell ${before} -> ${after} (tag ${tag})`);
run("git add package.json package-lock.json");
run(`git commit -m ${JSON.stringify(`chore(release): @wildwinter/app-shell@${after}`)}`);
run("git push");
run(`gh release create ${tag} --title ${tag} --notes ${JSON.stringify(`Publishes @wildwinter/app-shell@${after} via the publish workflow.`)}`);
console.log(`release: ${tag} created. Watch the publish run with:  gh run watch`);
