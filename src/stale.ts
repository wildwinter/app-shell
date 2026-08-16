// ---------------------------------------------------------------------------
// The stale-session bar: "what you are playing is older than the project".
//
// Both apps grew one without copying the other, and landed within a word of the
// same sentence - Patterpad's "Scene changed in the editor: restart to play the
// new version", Storyletter's "The project changed in the editor. Restart to
// play the new version." That is the strongest evidence a thing is shape-level
// rather than a taste: any app that compiles a document into something you then
// PLAY has a running session that can fall behind its source, and the only two
// things it can say are what went out of date and how to start again.
//
// So the app supplies the NOUN and the callback, and nothing else. Everything
// left over - the warn-toned banner, the sentence, the restart glyph - is the
// shape, and having it in one place is what stops the two apps drifting to two
// wordings for one situation.
//
// WHOSE DRAWING WON, since the two differed here where the words did not.
// Patterpad's was a line of centred grey text in the choice tray; Storyletter's
// is a bordered warn-toned bar with the button in it. The bar, because this is
// a condition rather than a remark: the session is frozen until you act, and a
// note that reads like the end of a passage does not say so.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { icon } from "./icons.js";

export interface StaleBarOptions {
  /**
   * What went out of date, as a capitalised noun phrase: "The project", "The
   * scene". Written into "<subject> changed in the editor."
   */
  subject: string;
  /** Start again from the current source. */
  onRestart: () => void;
  /** The button, when "Restart" is not the app's word for it. */
  restartLabel?: string;
  /**
   * The rest of the sentence, for an app whose session is not a PLAY: the
   * default is "Restart to play the new version."
   */
  advice?: string;
}

export function staleBar(opts: StaleBarOptions): HTMLElement {
  const label = opts.restartLabel ?? "Restart";
  return el("div", { className: "stale-bar" },
    el("span", { className: "stale-bar-msg",
      text: `${opts.subject} changed in the editor. ${opts.advice ?? "Restart to play the new version."}` }),
    el("button", { className: "stale-bar-go", text: `${icon.restart} ${label}`,
      onClick: () => opts.onRestart() }),
  );
}
