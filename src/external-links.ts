// ---------------------------------------------------------------------------
// Which web addresses an app lets its renderer open in the browser. Both apps
// opened only their About links (an allow-list in main, so a page can't send
// the user anywhere), and What's New's "Full release notes" link and any link
// in a changelog announcement were silently dropped, since neither was on it.
// One rule for the family: the About links, the app's own GitHub release pages,
// and pages on the app's own sites. Pure, so main and tests share it.
// ---------------------------------------------------------------------------

/** What an app lets out. */
export interface ExternalLinkRules {
  /** Exact addresses (the About dialog's). */
  links: Iterable<string>;
  /** The GitHub repository whose release pages open ("owner/name"). */
  repo: string;
  /** Sites whose pages open, by origin ("https://patterkit.dev"). */
  sites?: Iterable<string>;
}

/** A version's release page: what What's New's "Full release notes" links to. */
export function releaseNotesUrl(repo: string, version: string): string {
  return `https://github.com/${repo}/releases/tag/v${version}`;
}

const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Whether `url` may open in the browser under `rules`. Only https, and never with credentials in it. */
export function externalLinkAllowed(url: string, rules: ExternalLinkRules): boolean {
  if (new Set(rules.links).has(url)) return true;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.origin === "https://github.com") {
    const prefix = `/${rules.repo}/releases/tag/`;
    if (u.pathname.startsWith(prefix) && !u.search && !u.hash) return RELEASE_TAG.test(u.pathname.slice(prefix.length));
    return false;
  }
  for (const site of rules.sites ?? []) {
    let origin: string;
    try { origin = new URL(site).origin; } catch { continue; }
    if (u.origin === origin) return true;
  }
  return false;
}
