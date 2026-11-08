// ---------------------------------------------------------------------------
// The apps' CHANGELOG.md, read for What's New (the October 2026 UI review,
// step 5a): what each version means to the people using it, in the words the
// changelog already uses. Pure, with no DOM and no electron, so a release
// script can run the same rules the dialog does.
//
// The format both apps keep (Keep a Changelog):
//
//   ## [0.40.0] - 2026-10-28
//   ### Added
//   - **The command palette.** Press Cmd+K to ...
//   - **File ▸ Extensions…** opens a tool window ...
//     - a nested point, which What's New leaves to the full notes
//   ### Fixed
//   - **Checkboxes follow the palette**, not the system ...
//
// What's New shows each entry's preview: the bold lede and the rest of its
// first paragraph, whole sentences, up to about forty words (PREVIEW_WORDS),
// so a reader gets the lede and what it means, and the detail stays in the
// full notes (Ian, 2026-11-08: "a short lede and a quick idea of what that
// means"; patterkit design/changelog-writing.md). Breaking entries come first,
// marked; Added, Changed and Removed follow; Fixed entries show the same way
// under their own heading. A version can pick its own list with a
// `### Highlights` section, which then replaces the automatic one.
//
// A version whose only entries are carriers ("Patterplay 0.46.0 inside",
// "Nothing changed in the runtime") is drawn as one line rather than a heading
// of its own, so a run of lockstep releases doesn't read as a wall of empty
// versions.
//
// A version can also carry an `### Announcement`: hand-written news, such as a
// new member of the family, which What's New draws as a callout above every
// version it shows. Each entry is a bold title and the words after it, links
// kept:
//
//   ### Announcement
//   - **Meet Patterstage.** Patter stories, staged. [Find out more](https://...)
//
// It goes with its version: shown on the first launch after that update, and
// in Help ▸ What's New while the version is one of the latest three.
// ---------------------------------------------------------------------------

/** About how many words of an entry What's New shows: the lede and whole
 *  sentences of its first paragraph until the next would pass this. */
export const PREVIEW_WORDS = 40;
/** The most words a lede may run to before the release check refuses it. */
export const LEDE_WORDS = 12;

/** One entry's preview, as What's New shows it: `lead` was bold in the
 *  changelog, and `rest` is what follows it in the first paragraph, whole
 *  sentences, up to about PREVIEW_WORDS in all ("" when the bold was the whole
 *  entry). `breaking` marks an entry from a `### Breaking` section. */
export interface ChangelogLead {
  lead: string;
  rest: string;
  breaking?: true;
}

/** A hand-written announcement: `title` was bold in the changelog, and `body`
 *  is the rest of the entry, with its `[links](url)` and `code` kept for the
 *  dialog to draw ("" when the title stands alone). */
export interface ChangelogAnnouncement {
  title: string;
  body: string;
}

export interface ChangelogVersion {
  /** "0.40.0", or "Unreleased". */
  version: string;
  /** "2026-10-28"; absent for an undated (unreleased) section. */
  date?: string;
  /** The previews to show, in changelog order: the Highlights when there are
   *  any, else Breaking (first), Added, Changed and Removed. */
  headlines: ChangelogLead[];
  /** The Fixed entries' previews, in changelog order. */
  fixed: ChangelogLead[];
  /** How many entries the Fixed section has (`fixed.length`). */
  fixes: number;
  /** The version's Announcement entries, in changelog order. */
  announcements: ChangelogAnnouncement[];
  /** True when every entry is a carrier line ("Patterplay 0.46.0 inside",
   *  "Nothing changed in the runtime") and there's nothing else to say: drawn
   *  as one line rather than a heading of its own. */
  carrier: boolean;
}

/** One top-level entry, for checking: its section, its first line, and its lead if it has one. */
export interface ChangelogEntry {
  section: string;
  text: string;
  lead?: ChangelogLead;
}

/** What the release check found wrong with an entry, in words for the person releasing. */
export interface ChangelogProblem {
  entry: ChangelogEntry;
  problem: string;
}

const VERSION = /^## \[([^\]]+)\](?:\s+-\s+(\S+))?\s*$/;
const SECTION = /^### (.+?)\s*$/;
const HEADLINE_SECTIONS = ["breaking", "added", "changed", "removed"];
/** A lede that only says a version went by: another product's release inside this one, or a lockstep bump. */
const CARRIER = /\b\d+\.\d+\.\d+ inside\b|^nothing changed in the runtime\b/i;

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** The sentences of a paragraph, each with its closing quote or bracket. A stop inside `code`, or one not
 *  followed by a space (a version number, a filename), doesn't end a sentence. */
function sentences(s: string): string[] {
  const out: string[] = [];
  let start = 0;
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "`") code = !code;
    if (code || !/[.!?]/.test(c)) continue;
    let j = i + 1;
    while (j < s.length && /["”’)]/.test(s[j]!)) j++;
    if (j === s.length || /\s/.test(s[j]!)) {
      out.push(s.slice(start, j).trim());
      start = j;
      i = j - 1;
    }
  }
  const tail = s.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** The bold lede of an entry, and the rest of its first paragraph up to about `cap` words. */
export function leadOf(text: string, cap = PREVIEW_WORDS): ChangelogLead | undefined {
  const m = /^\*\*(.+?)\*\*(.*)$/s.exec(text.trim());
  if (!m) return undefined;
  const lead = clean(m[1]!);
  // An ellipsis isn't an ending: "File ▸ Extensions…" is a menu item's name, and the sentence goes on.
  const boldIsSentence = /[.!?:]["”’)]*$/.test(lead);
  // A sentence that introduces nested points ends on a colon; on its own, in What's New, it ends.
  const after = clean(m[2]!).replace(/:$/, ".");
  let rest = "";
  let count = words(lead);
  sentences(after).forEach((s, i) => {
    // The bold is a phrase: the sentence runs on after it, so the first always completes it.
    const completes = i === 0 && !boldIsSentence;
    if (!completes && count + words(s) > cap) return;
    rest = rest ? `${rest} ${s}` : s;
    count += words(s);
  });
  return { lead, rest };
}

/** An Announcement entry: its bold title, and the rest with links kept. */
function announcementOf(text: string): ChangelogAnnouncement {
  const m = /^\*\*(.+?)\*\*(.*)$/s.exec(text.trim());
  if (!m) return { title: clean(text), body: "" };
  return { title: clean(m[1]!), body: m[2]!.replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim() };
}

/** Markdown the dialog doesn't draw: links keep their words, emphasis goes. */
function clean(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
}

/** Every version section, newest first as the file has them, with each entry. */
function sections(md: string): Array<{ version: string; date?: string; entries: ChangelogEntry[] }> {
  const out: Array<{ version: string; date?: string; entries: ChangelogEntry[] }> = [];
  let section = "";
  let entry: ChangelogEntry | undefined;
  const finish = (): void => {
    if (!entry) return;
    entry.text = entry.text.trim();
    const lead = leadOf(entry.text);
    if (lead) entry.lead = lead;
    entry = undefined;
  };
  for (const line of md.split(/\r?\n/)) {
    const v = VERSION.exec(line);
    if (v) {
      finish();
      const date = v[2] && /^\d{4}-\d{2}-\d{2}$/.test(v[2]) ? v[2] : undefined;
      out.push({ version: v[1]!, ...(date ? { date } : {}), entries: [] });
      section = "";
      continue;
    }
    const s = SECTION.exec(line);
    if (s) { finish(); section = s[1]!.toLowerCase(); continue; }
    const cur = out[out.length - 1];
    if (!cur || !section) continue;
    if (line.startsWith("- ")) {
      finish();
      entry = { section, text: line.slice(2) };
      cur.entries.push(entry);
    } else if (entry && /^\s+-\s/.test(line)) {
      finish(); // a nested point ends the lead's paragraph; the full notes keep it
    } else if (entry && /^\s+\S/.test(line)) {
      entry.text += ` ${line.trim()}`;
    } else if (line.trim() === "") {
      finish();
    }
  }
  finish();
  return out;
}

/** An entry's preview, with a bare entry's text standing in for a missing lede. */
function preview(e: ChangelogEntry): ChangelogLead {
  const p: ChangelogLead = e.lead ?? { lead: clean(e.text), rest: "" };
  return e.section === "breaking" ? { ...p, breaking: true } : p;
}

/** Every version in the changelog, newest first, Unreleased included. */
export function parseChangelog(md: string): ChangelogVersion[] {
  return sections(md).map(({ version, date, entries }) => {
    const highlights = entries.filter((e) => e.section === "highlights");
    const shown = highlights.length
      ? highlights
      : HEADLINE_SECTIONS.flatMap((s) => entries.filter((e) => e.section === s));
    const headlines = shown.map(preview);
    const fixed = entries.filter((e) => e.section === "fixed").map(preview);
    const announcements = entries.filter((e) => e.section === "announcement").map((e) => announcementOf(e.text));
    const carrier = !highlights.length && !announcements.length && !fixed.length
      && headlines.length > 0 && headlines.every((h) => CARRIER.test(h.lead));
    return { version, ...(date ? { date } : {}), headlines, fixed, fixes: fixed.length, announcements, carrier };
  });
}

/** The entries of one version that have no bold lead, which What's New can't
 *  headline: a release check fails on any of these. */
export function entriesWithoutLead(md: string, version: string): ChangelogEntry[] {
  const found = sections(md).find((s) => s.version === version);
  return (found?.entries ?? []).filter((e) => !e.lead);
}

/**
 * What a release check refuses in one version's entries, so What's New reads
 * as written for a person (design/changelog-writing.md): an entry with no bold
 * lede; a lede over LEDE_WORDS words, which is a paragraph in bold; a bare
 * label with nothing after it ("1.0.0.", "Play in game."), which says nothing;
 * and a package name in the lede ("@patterkit/ops"), which names the plumbing
 * rather than the change.
 */
export function changelogProblems(md: string, version: string): ChangelogProblem[] {
  const found = sections(md).find((s) => s.version === version);
  const out: ChangelogProblem[] = [];
  for (const entry of found?.entries ?? []) {
    const lead = entry.lead;
    if (!lead) { out.push({ entry, problem: "no bold lede for What's New to show" }); continue; }
    const n = words(lead.lead);
    if (n > LEDE_WORDS) out.push({ entry, problem: `the lede runs to ${n} words; keep it under ${LEDE_WORDS} and let the sentence after it explain` });
    if (n <= 3 && !lead.rest && entry.section !== "announcement") out.push({ entry, problem: "a label with nothing after it: say what it means in a sentence" });
    if (/@[a-z0-9-]+\/[a-z0-9-]+/i.test(lead.lead)) out.push({ entry, problem: "a package name in the lede: say what changed for the reader, and name the package in the detail" });
  }
  return out;
}

/** Compare two versions numerically ("0.10.0" after "0.9.2"); a pre-release
 *  ("1.0.0-beta.1") sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const split = (v: string): [number[], string] => {
    const [core = "", pre = ""] = v.replace(/^v/, "").split("-", 2);
    return [core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre];
  };
  const [ca, pa] = split(a);
  const [cb, pb] = split(b);
  for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
    const d = (ca[i] ?? 0) - (cb[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa === pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  return pa < pb ? -1 : 1;
}

/**
 * The released versions after `previous`, up to and including `current`,
 * newest first: what changed since the person last ran the app. Nothing for a
 * fresh install (`previous` undefined), since nothing has changed for them,
 * and nothing undated, since that hasn't been released.
 */
export function versionsSince(versions: ChangelogVersion[], previous: string | undefined, current: string): ChangelogVersion[] {
  if (previous === undefined) return [];
  return versions
    .filter((v) => v.date !== undefined && compareVersions(v.version, previous) > 0 && compareVersions(v.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The latest `count` released versions up to `current`, newest first: what
 *  Help ▸ What's New shows. */
export function latestVersions(versions: ChangelogVersion[], current: string, count = 3): ChangelogVersion[] {
  return versions
    .filter((v) => v.date !== undefined && compareVersions(v.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, count);
}
