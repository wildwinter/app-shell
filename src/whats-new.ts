// ---------------------------------------------------------------------------
// What's New (the October 2026 UI review, step 5a): the first launch after an
// update says what's new in it, in the changelog's own words, and Help ▸
// What's New shows the latest at any time. It tells people what's new, not
// what moved inside: each entry's preview (its bold lede and the start of its
// first paragraph; changelog.ts), Breaking ones first and marked, the fixes
// the same way under their own heading, and a link to the full release notes.
// A version that only carries another release ("Patterplay 0.46.0 inside") is
// one line, not a heading.
//
// The changelog is built into the app (the renderer imports CHANGELOG.md as
// text), so nothing here needs the network. A fresh install shows nothing:
// nothing has changed for them. Several versions skipped show together, newest
// first. A tickbox, "Show what's new after updates", ticked by default, turns
// the launch dialog off; Help ▸ What's New still opens it.
//
// A version's Announcement (hand-written news, such as a new member of the
// family) is a callout above every version shown, so it reads as a banner even
// when several versions show together. It goes with its version: it leaves
// Help ▸ What's New once three newer versions have shipped.
//
// The main half (whats-new-main.ts) remembers which version last ran and the
// tickbox, and answers WHATS_NEW_CHANNELS.state once per launch.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { dialogFrame } from "./dialog.js";
import { latestVersions, parseChangelog, versionsSince, type ChangelogAnnouncement, type ChangelogLead, type ChangelogVersion } from "./changelog.js";

export { WHATS_NEW_CHANNELS, type WhatsNewState } from "./whats-new-channels.js";
import type { WhatsNewState } from "./whats-new-channels.js";

export interface WhatsNewOptions {
  /** "Patterpad". */
  appName: string;
  /** The app's CHANGELOG.md, as text. */
  changelog: string;
  /** The running version. */
  version: string;
  /** The tickbox as it stands. */
  show: boolean;
  /** The tickbox changed. */
  onShow: (show: boolean) => void;
  /** Where a version's full release notes are. */
  releaseNotes: (version: string) => string;
  /** How a link opens (the app's allow-listed shell.openExternal bridge). */
  openExternal: (url: string) => void;
  /** The dialog closed. The launch passes the bridge to `WHATS_NEW_CHANNELS.seen`, so a reload before then
   *  shows it again and one after doesn't. */
  onClose?: () => void;
}

/** The first launch after an update: open What's New for every version since
 *  the last run, if there's anything to say and the tickbox allows it. True
 *  when it opened. */
export function whatsNewAfterUpdate(state: WhatsNewState, opts: Omit<WhatsNewOptions, "version" | "show">): boolean {
  if (!state.show) return false;
  const all = parseChangelog(opts.changelog);
  // No version on record: an install from before What's New hears about this version; a fresh one, nothing.
  const versions = state.previous !== undefined ? versionsSince(all, state.previous, state.version)
    : state.existing ? latestVersions(all, state.version, 1).filter((v) => v.version === state.version) : [];
  if (versions.length === 0) return false;
  showWhatsNew(versions, { ...opts, version: state.version, show: state.show });
  return true;
}

/** Help ▸ What's New: the latest three released versions up to this one. */
export function openWhatsNew(opts: WhatsNewOptions): void {
  showWhatsNew(latestVersions(parseChangelog(opts.changelog), opts.version), opts);
}

/** A preview as the dialog draws it: the bold part strong, `code` as code, a Breaking one marked. */
function leadNode(h: ChangelogLead): HTMLElement {
  const li = el("li", "whatsnew-item");
  if (h.breaking) li.append(el("span", "whatsnew-tag", "Breaking"));
  const strong = el("strong");
  inline(strong, h.lead);
  li.append(strong);
  if (h.rest) inline(li, /^[,;:.)]/.test(h.rest) ? h.rest : ` ${h.rest}`); // "**Quieter corners**, and ..." keeps its comma close
  return li;
}

/** Text with `code` spans, as the changelog writes menu items and identifiers. */
function inline(into: HTMLElement, text: string): void {
  text.split(/(`[^`]+`)/).forEach((part) => {
    if (!part) return;
    if (part.startsWith("`") && part.endsWith("`")) into.append(el("code", undefined, part.slice(1, -1)));
    else into.append(part);
  });
}

/** An announcement as the dialog draws it: the title strong, then the body,
 *  whose web links open through the app's bridge (any other link keeps only its words). */
function announcementNode(a: ChangelogAnnouncement, openExternal: (url: string) => void): HTMLElement {
  const box = el("div", "whatsnew-announcement");
  const p = el("p");
  const strong = el("strong");
  inline(strong, a.title);
  p.append(strong);
  if (a.body) p.append(" ");
  a.body.split(/(\[[^\]]+\]\([^)]*\))/).forEach((part) => {
    const m = /^\[([^\]]+)\]\(([^)]*)\)$/.exec(part);
    if (!m) { inline(p, part); return; }
    if (!/^https?:\/\//.test(m[2]!)) { inline(p, m[1]!); return; }
    const link = el("a", undefined, m[1]!);
    link.href = m[2]!;
    link.addEventListener("click", (e) => { e.preventDefault(); openExternal(link.href); });
    p.append(link);
  });
  box.append(p);
  return box;
}

function showWhatsNew(versions: ChangelogVersion[], opts: WhatsNewOptions): void {
  const frame = dialogFrame({ title: `What’s new in ${opts.appName}`, className: "whatsnew-dialog", ...(opts.onClose ? { onClose: opts.onClose } : {}) });
  if (versions.length === 0) {
    frame.body.append(el("p", "whatsnew-empty", `There are no release notes for ${opts.appName} ${opts.version} yet.`));
  }
  for (const a of versions.flatMap((v) => v.announcements)) frame.body.append(announcementNode(a, opts.openExternal));
  for (const v of versions) {
    const link = el("a", undefined, "Full release notes");
    link.href = opts.releaseNotes(v.version);
    link.addEventListener("click", (e) => { e.preventDefault(); opts.openExternal(link.href); });
    if (v.carrier) {
      // Only another release inside this one: the version, what it carried, and the link, on one line.
      const p = el("p", "whatsnew-carrier");
      p.append(el("strong", undefined, v.version), " ");
      inline(p, v.headlines.map((h) => (h.rest ? `${h.lead}${/^[,;:.)]/.test(h.rest) ? "" : " "}${h.rest}` : h.lead)).join(" "));
      p.append(" ", link);
      frame.body.append(p);
      continue;
    }
    const section = el("section", "whatsnew-version");
    const head = el("h3", "whatsnew-head", opts.appName === "" ? v.version : `${opts.appName} ${v.version}`);
    section.append(head);
    if (v.headlines.length) section.append(el("ul", "whatsnew-list", ...v.headlines.map(leadNode)));
    if (v.fixed.length) {
      section.append(el("p", "whatsnew-sub", "Fixed"));
      section.append(el("ul", "whatsnew-list whatsnew-fixed", ...v.fixed.map(leadNode)));
    }
    const foot = el("p", "whatsnew-foot", link);
    section.append(foot);
    frame.body.append(section);
  }

  const box = el("input");
  box.type = "checkbox";
  box.checked = opts.show;
  box.addEventListener("change", () => opts.onShow(box.checked));
  const tick = el("label", "whatsnew-show", box, "Show what’s new after updates");
  const ok = el("button", { className: "btn primary", onClick: () => frame.close() }, "OK");
  ok.type = "button";
  frame.actions.append(tick, ok);
  frame.open();
  queueMicrotask(() => ok.focus());
}
