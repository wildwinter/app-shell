// ---------------------------------------------------------------------------
// The welcome screen: what an app shows with no project open. It has two
// states, with one job each (patterkit design/proposals/quiet-welcome-and-
// whats-new.md, W1 and W2; Ian, 2026-11-12: this was the busiest page in
// either app, where the rest is kept quiet).
//
//   First run (no recents): the mark, the title and its line, then the tour
//   (the accent button), New, and Open. A new user has nothing to open, so
//   Open is not the accent button here.
//
//   With recents: Open (the accent button) and New, then a short list of
//   recent names under a hairline, and the tour as one line beneath.
//
// Kits, the other examples and their feature pills are New Project's (the kit
// gallery), and only there: the welcome used to repeat them.
//
// A recent is its name. The folder is its rollover, and shows under the name
// only when two names in the list are the same, which is the one time a
// reader needs it to tell them apart.
//
// The whole screen is a drag region (the window has no title bar to grab
// here) and every control opts out. Styles ship as welcome.css.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

export interface WelcomeAction {
  label: string;
  onClick: () => void;
}

export interface WelcomeTour extends WelcomeAction {
  /** What comes before the link once there are recents ("New to Patter?"). */
  prompt: string;
}

export interface WelcomeRecent {
  /** What the project calls itself, with the folder stem as the fallback. */
  name: string;
  /** The rollover, and under the name when two names in the list match. */
  path: string;
  onOpen: () => void;
}

export interface WelcomeOptions {
  title: string;
  sub: string;
  /** "Open a project…". The accent button once there are recents. */
  open: WelcomeAction;
  /** "New project…". The accent button on a first run with no tour. */
  create: WelcomeAction;
  /** The teaching door ("Take the tour"): the accent button on a first run,
   *  and a line under the recents after that. */
  tour?: WelcomeTour;
  /** Above the title: the app's mark, or an illustration. The app builds it,
   *  in the palette's own colours so it reads in every palette. */
  mark?: HTMLElement;
  recents: WelcomeRecent[];
  /** How many recents to show. Default 5. */
  maxRecents?: number;
  /** A sentence about why the last open failed, under everything. */
  error?: string;
}

export interface Welcome {
  el: HTMLElement;
  /** Redraw for these recents (the list changes as projects open and close). */
  setRecents(recents: WelcomeRecent[]): void;
  setError(error: string | undefined): void;
}

/** Mount the welcome into `host` (replacing its children). */
export function mountWelcome(host: HTMLElement, opts: WelcomeOptions): Welcome {
  const button = (a: WelcomeAction, primary: boolean): HTMLButtonElement => {
    const b = el("button", { className: `btn${primary ? " primary" : ""}`, text: a.label, onClick: a.onClick });
    b.type = "button";
    return b;
  };

  const actions = el("div", "welcome-actions");
  const below = el("div", "welcome-below");
  const draw = (recents: WelcomeRecent[]): void => {
    const shown = recents.slice(0, opts.maxRecents ?? 5);
    const first = shown.length === 0;
    root.classList.toggle("first-run", first);
    below.replaceChildren();
    if (first) {
      actions.replaceChildren(
        ...(opts.tour ? [button(opts.tour, true)] : []),
        button(opts.create, !opts.tour),
        button(opts.open, false),
      );
      return;
    }
    actions.replaceChildren(button(opts.open, true), button(opts.create, false));
    const names = shown.map((r) => r.name);
    const list = el("section", "welcome-recents", ...shown.map((r) => {
      const twin = names.indexOf(r.name) !== names.lastIndexOf(r.name);
      const b = el("button", { className: "welcome-recent", onClick: r.onOpen },
        el("span", "welcome-recent-name", r.name),
        twin ? el("span", "welcome-recent-path", r.path) : null);
      b.type = "button";
      if (!twin) b.dataset["tip"] = r.path;
      return b;
    }));
    list.setAttribute("aria-label", "Recent projects");
    below.append(list);
    if (opts.tour) {
      const link = el("button", { className: "welcome-link", text: opts.tour.label, onClick: opts.tour.onClick });
      link.type = "button";
      below.append(el("p", "welcome-line", `${opts.tour.prompt} `, link));
    }
  };

  const error = el("p", "welcome-error");
  const setError = (text: string | undefined): void => {
    error.textContent = text ?? "";
    error.hidden = text === undefined || text === "";
  };

  const root = el("div", "welcome", el("div", "welcome-card",
    opts.mark ? el("div", "welcome-mark", opts.mark) : null,
    el("h1", "welcome-title", opts.title),
    el("p", "welcome-sub", opts.sub),
    actions,
    below,
    error,
  ));
  draw(opts.recents);
  setError(opts.error);
  host.replaceChildren(root);
  return { el: root, setRecents: draw, setError };
}
