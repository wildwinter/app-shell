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
// What's New shows each Added, Changed and Removed entry's lead: the bold
// opening and, when the bold is a phrase rather than a sentence, the rest of
// its first sentence. Fixes are a count. A version can pick its own list with
// a `### Highlights` section, which then replaces the automatic one.
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

/** One entry's lead, as What's New shows it: `lead` was bold in the
 *  changelog, and `rest` finishes its first sentence ("" when the bold was
 *  the whole sentence). */
export interface ChangelogLead {
  lead: string;
  rest: string;
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
  /** The leads to show, in changelog order: the Highlights when there are
   *  any, else Added, Changed and Removed. */
  headlines: ChangelogLead[];
  /** How many entries the Fixed section has. */
  fixes: number;
  /** The version's Announcement entries, in changelog order. */
  announcements: ChangelogAnnouncement[];
}

/** One top-level entry, for checking: its section, its first line, and its lead if it has one. */
export interface ChangelogEntry {
  section: string;
  text: string;
  lead?: ChangelogLead;
}

const VERSION = /^## \[([^\]]+)\](?:\s+-\s+(\S+))?\s*$/;
const SECTION = /^### (.+?)\s*$/;
const HEADLINE_SECTIONS = new Set(["added", "changed", "removed"]);

/** The bold opening of an entry, and the rest of its first sentence. */
export function leadOf(text: string): ChangelogLead | undefined {
  const m = /^\*\*(.+?)\*\*(.*)$/s.exec(text.trim());
  if (!m) return undefined;
  const lead = clean(m[1]!);
  // An ellipsis isn't an ending: "File ▸ Extensions…" is a menu item's name, and the sentence goes on.
  if (/[.!?:]["\u201d\u2019)]*$/.test(lead)) return { lead, rest: "" };
  // The bold is a phrase: the sentence runs on after it, to its first full stop.
  const after = clean(m[2]!);
  const end = /^(.*?[.!?])(\s|$)/s.exec(after);
  // A sentence that introduces nested points ends on a colon; on its own, in What's New, it ends.
  return { lead, rest: (end ? end[1]! : after).replace(/:$/, ".") };
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

/** Every version in the changelog, newest first, Unreleased included. */
export function parseChangelog(md: string): ChangelogVersion[] {
  return sections(md).map(({ version, date, entries }) => {
    const highlights = entries.filter((e) => e.section === "highlights");
    const shown = highlights.length ? highlights : entries.filter((e) => HEADLINE_SECTIONS.has(e.section));
    return {
      version,
      ...(date ? { date } : {}),
      headlines: shown.map((e) => e.lead ?? { lead: clean(e.text), rest: "" }),
      fixes: entries.filter((e) => e.section === "fixed").length,
      announcements: entries.filter((e) => e.section === "announcement").map((e) => announcementOf(e.text)),
    };
  });
}

/** The entries of one version that have no bold lead, which What's New can't
 *  headline: a release check fails on any of these. */
export function entriesWithoutLead(md: string, version: string): ChangelogEntry[] {
  const found = sections(md).find((s) => s.version === version);
  return (found?.entries ?? []).filter((e) => !e.lead);
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
