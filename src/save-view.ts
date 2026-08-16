// ---------------------------------------------------------------------------
// The save indicator: the six lines that draw what `createSaveController`
// already computes.
//
// The controller has been shared since 0.14.0 and its three states with it, but
// the DRAWING stayed in each app - so both apps hand-rendered the output of one
// machine and promptly drifted. Patterpad's was `<span id="dirty" hidden>●
// unsaved</span>`: present only when there was something to worry about.
// Storyletter's always paints one of Saved / Saving… / Unsaved. (Design review
// 2026-08, A4.)
//
// STORYLETTER'S WON, and the reasoning is worth keeping because it is not
// "newer is better". Three states are what the shared controller models, and an
// app that autosaves without being asked owes the author the reassurance as
// well as the warning: a dot that only ever appears to worry you leaves "did
// that get written?" unanswered at exactly the moment it is asked. "Saving…"
// earns its place separately - on a slow disk or a slow version-control hook a
// write takes long enough to see.
//
// It cannot drift again, which is the actual point of putting it here.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import type { SaveStatus } from "./save.js";

export interface SaveIndicator {
  /** Put it in the topbar. */
  readonly el: HTMLElement;
  /** Wire straight to the controller's `onStatus`. */
  set(status: SaveStatus): void;
}

/** What each state says. Not an option: two apps saying it differently is the
 *  drift this exists to end. */
const WORDS: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved",
};

export function saveIndicator(initial: SaveStatus = "saved"): SaveIndicator {
  const node = el("span");
  const set = (status: SaveStatus): void => {
    node.className = `savestat ${status}`;
    node.textContent = WORDS[status];
  };
  set(initial);
  return { el: node, set };
}
