// ---------------------------------------------------------------------------
// The welcome screen: what an app shows with no project open. Title, one line
// under it, the actions (Open, New), an optional teaching line, optional
// captioned groups (Storyletter's shipped examples), and the recents.
//
// Both apps drew this with the same twelve CSS rules under two class prefixes
// (`.recent-name` / `.wel-recent-name`), four of them byte-identical. The CSS
// here is Patterpad's; the captioned groups are Storyletter's, as an optional
// slot, drawn as a plain list of rows (name + hint) rather than cards.
//
// The whole screen is a drag region (the window has no title bar to grab
// here) and every control opts out. Styles ship as welcome.css.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

export interface WelcomeAction {
  label: string;
  onClick: () => void;
  /** The one accent button (Open a project…). */
  primary?: boolean;
}

export interface WelcomeRecent {
  /** What the project calls itself, with the folder stem as the fallback. */
  name: string;
  /** Beside the name, because two projects may share a name and the folder
   *  is how you tell them apart. */
  path: string;
  onOpen: () => void;
}

export interface WelcomeGroupItem {
  name: string;
  /** What choosing it gets you, said before the click. */
  hint?: string;
  onOpen: () => void;
}

export interface WelcomeGroup {
  /** Sentence-case label text ("Learn from a finished project"); never an overline. */
  caption: string;
  /** The consequence of a click, said before the click ("Each opens as your
   *  own copy, in a folder you choose."). */
  note?: string;
  items: WelcomeGroupItem[];
}

export interface WelcomeOptions {
  title: string;
  sub: string;
  actions: WelcomeAction[];
  recents: WelcomeRecent[];
  groups?: WelcomeGroup[];
  /** The teaching door: a line under the actions, quieter than a button
   *  ("New to Patter? Take the interactive tour"). The app builds and styles
   *  it; a text action in it is a link, not bare muted text. */
  tourLine?: HTMLElement;
  /** The recents caption. Default "Recent". */
  recentsCaption?: string;
  /** How many recents to show. Default 5. */
  maxRecents?: number;
  /** A sentence about why the last open failed, under everything. */
  error?: string;
}

export interface Welcome {
  el: HTMLElement;
  /** Redraw the recents (the list changes as projects open and close). */
  setRecents(recents: WelcomeRecent[]): void;
  setError(error: string | undefined): void;
}

/** Mount the welcome into `host` (replacing its children). */
export function mountWelcome(host: HTMLElement, opts: WelcomeOptions): Welcome {
  const caption = (text: string): HTMLElement => el("h2", "welcome-caption", text);
  const group = (label: string, ...body: (Node | null)[]): HTMLElement =>
    el("section", "welcome-group", caption(label), ...body);

  const actions = el("div", "welcome-actions");
  for (const a of opts.actions) {
    const b = el("button", { className: `btn${a.primary ? " primary" : ""}`, text: a.label, onClick: a.onClick });
    b.type = "button";
    actions.append(b);
  }

  const groups = (opts.groups ?? []).map((g) => group(g.caption,
    g.note !== undefined ? el("p", "welcome-note", g.note) : null,
    el("div", "welcome-list", ...g.items.map((item) => {
      const b = el("button", { className: "welcome-item", onClick: item.onOpen },
        el("span", "welcome-item-name", item.name),
        item.hint !== undefined ? el("span", "welcome-item-hint", item.hint) : null);
      b.type = "button";
      return b;
    })),
  ));

  const recentsHost = el("div", "welcome-recents-slot");
  const drawRecents = (recents: WelcomeRecent[]): void => {
    const shown = recents.slice(0, opts.maxRecents ?? 5);
    recentsHost.replaceChildren();
    if (shown.length === 0) return;
    recentsHost.append(group(opts.recentsCaption ?? "Recent",
      el("div", "welcome-recents", ...shown.map((r) => {
        const b = el("button", { className: "welcome-recent", onClick: r.onOpen },
          el("span", "welcome-recent-name", r.name),
          el("span", "welcome-recent-path", r.path));
        b.type = "button";
        return b;
      })),
    ));
  };
  drawRecents(opts.recents);

  const error = el("p", "welcome-error");
  const setError = (text: string | undefined): void => {
    error.textContent = text ?? "";
    error.hidden = text === undefined || text === "";
  };
  setError(opts.error);

  const root = el("div", "welcome", el("div", "welcome-card",
    el("h1", "welcome-title", opts.title),
    el("p", "welcome-sub", opts.sub),
    actions,
    opts.tourLine ? el("div", "welcome-line", opts.tourLine) : null,
    ...groups,
    recentsHost,
    error,
  ));
  host.replaceChildren(root);
  return { el: root, setRecents: drawRecents, setError };
}
