// ---------------------------------------------------------------------------
// Navigation history - the VS Code back/forward pair, family-wide.
//
// The shell owns the STACK and the ARROWS; each app owns what a place is.
// `Place` is opaque here for the same reason the app-store's `places` is:
// "where you are" means a focus + document + tab in Storyletter and a scene +
// position in Patterpad, and the shell has no business knowing either. The app
// supplies two judgements - `same` (two places that are the same DOCUMENT, so
// tab and selection twitches coalesce instead of filling the stack) and
// `usable` (a place can still be restored: the card it names may have been
// deleted since) - and the mechanics cannot drift between the apps.
//
// The model is the browser's: `visit` records the place being LEFT on an
// ordinary navigation and clears the forward list (navigating anew after
// going back branches history, and the abandoned branch is gone); `back` and
// `forward` exchange the current place for the adjacent one. Entries that
// fail `usable` are DISCARDED on the way past, never restored and never moved
// to the other side.
//
// One duty stays with the app, documented rather than latched: restoring a
// place re-dispatches the app's own navigation actions, and those call
// `visit`. The app must not `visit` while it is travelling (Storyletter's
// `arriving` flag is the local idiom), or every Back would push what it just
// left and Forward would never reach anything.
// ---------------------------------------------------------------------------

export interface NavHistoryOptions<Place> {
  /** Same DOCUMENT: a visit whose place is `same` as the newest entry
   *  REPLACES it (keeping the freshest tab) instead of stacking. */
  same(a: Place, b: Place): boolean;
  /** Still restorable? Checked as an entry is stepped onto; a stale one is
   *  dropped and the step continues past it. Default: everything is. */
  usable?(p: Place): boolean;
  /** Entries beyond this age off the far end (default 100). */
  cap?: number;
}

export interface NavHistory<Place> {
  /** Record the place being left, before an ordinary navigation. */
  visit(place: Place): void;
  /** Step back: hands over the current place (it becomes the forward entry)
   *  and returns the place to restore, or undefined at the far end. */
  back(current: Place): Place | undefined;
  forward(current: Place): Place | undefined;
  /** Whether the arrows light. Optimistic: a side holding only stale entries
   *  still reports true, and the press quietly discards them (the alternative
   *  is validating the whole stack on every paint). */
  canBack(): boolean;
  canForward(): boolean;
}

export function createNavHistory<Place>(opts: NavHistoryOptions<Place>): NavHistory<Place> {
  const cap = opts.cap ?? 100;
  const usable = opts.usable ?? ((): boolean => true);
  let past: Place[] = [];
  let ahead: Place[] = [];

  const step = (from: Place[], to: Place[], current: Place): Place | undefined => {
    for (;;) {
      const p = from.pop();
      if (p === undefined) return undefined;
      if (!usable(p)) continue;          // its document is gone: drop, keep walking
      if (opts.same(p, current)) continue;   // a step must MOVE: a self-visit (a
      // tab click routed through a navigation action) is not a journey, and
      // restoring it reads as a dead button
      to.push(current);
      return p;
    }
  };

  return {
    visit(place) {
      ahead = [];
      const top = past[past.length - 1];
      if (top !== undefined && opts.same(top, place)) past[past.length - 1] = place;
      else past.push(place);
      if (past.length > cap) past = past.slice(past.length - cap);
    },
    back(current) { return step(past, ahead, current); },
    forward(current) { return step(ahead, past, current); },
    canBack() { return past.length > 0; },
    canForward() { return ahead.length > 0; },
  };
}

/**
 * The quiet arrow pair, VS Code's shape: greyed where there is nowhere to
 * go, one component so it looks and sits the same in every app of the
 * family; the caller re-`set`s it whenever a navigation may have changed
 * what the arrows can do.
 *
 * ARROWS, not chevrons, and the distinction is the family's glyph grammar
 * (the author's ruling, 2026-08-28): a chevron says STRUCTURE - the pane
 * toggles, a labelled up-crumb, a tree row's disclosure - and an arrow says
 * TIME. The first cut used chevrons, and sitting on the topbar two seats
 * from the pane toggle's chevron the pair read as more of the same thing;
 * it is how every browser, editor and file manager already split the two.
 *
 * The pair's HOME is the topbar's lead, immediately after the nav toggle
 * (Patterpad placed it there first, and the ruling ratified it).
 */
export function historyNav(onBack: () => void, onForward: () => void): {
  el: HTMLElement;
  set(canBack: boolean, canForward: boolean): void;
} {
  const btn = (glyph: string, tip: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "shell-histnav-btn";
    b.textContent = glyph;
    b.dataset["tip"] = tip;
    b.setAttribute("aria-label", tip);
    b.addEventListener("click", onClick);
    return b;
  };
  const back = btn("\u2190", "Back", onBack);
  const forward = btn("\u2192", "Forward", onForward);
  const el = document.createElement("span");
  el.className = "shell-histnav";
  el.append(back, forward);
  return {
    el,
    set(canBack, canForward) { back.disabled = !canBack; forward.disabled = !canForward; },
  };
}
