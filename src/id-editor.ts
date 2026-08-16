// ---------------------------------------------------------------------------
// The gameId editor: a small anchored popover for setting a thing's address.
//
// Patterpad's `id-editor.ts`, lifted into the shell so both apps have the same
// manners. They did not: Storyletter's accepted anything and let the save
// quietly rewrite it, Patterpad's refused an illegal address and offered Tab as
// an opt-in slugify. Patterpad's is the right half of that argument and is what
// this is - the address is what a host will call the content by, and an app that
// silently renames it has made a decision that was not its to make.
//
// THE SEAM: this knows nothing about what it is addressing. It takes the pinned
// value, the name-derived fallback to show as a placeholder, and hands back a
// string to persist ("" = go back to deriving one).
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { openAnchoredPanel } from "./anchored.js";
import { gameIdify as defaultSlugify, isValidGameId as defaultValid } from "./ids.js";

export interface GameIdEditorOptions {
  anchor: HTMLElement;
  /** The pinned address, or "" when it is being derived. */
  value: string;
  /** What it derives to, shown as the placeholder. */
  derived: string;
  /** Persist. "" means "stop pinning, go back to deriving". */
  onCommit: (gameId: string) => void;
  /** The panel's title. Both apps say "Game ID"; a third may not. */
  title?: string;
  /** Override the rules. Defaults are the shell's, which is what a new app
   *  should use; an app whose domain layer owns them can pass its own. */
  slugify?: (text: string) => string;
  validate?: (gameId: string) => boolean;
  /** Where the panel goes, for hosts that anchor it somewhere tight. */
  prefer?: "left" | "below" | "centre";
  /** Chrome the panel must not cover, passed through to the anchored panel: an
   *  app with a problems bar along the bottom wants it usable while an address
   *  is being edited. Without this the editor is the one panel in a host that
   *  can land on top of its own bars. */
  keepClear?: string[];
}

/**
 * Open it. Returns false when that click TOGGLED the panel shut, which is the
 * anchored panel's contract and worth passing on: a caller that repaints on open
 * needs to know it did not.
 */
export function openGameIdEditor(opts: GameIdEditorOptions): boolean {
  const slugify = opts.slugify ?? defaultSlugify;
  const valid = opts.validate ?? defaultValid;

  const panel = openAnchoredPanel({
    anchor: opts.anchor, className: "shell-id-editor", title: opts.title ?? "Game ID", width: 260,
    ...(opts.prefer !== undefined ? { prefer: opts.prefer } : {}),
    ...(opts.keepClear !== undefined ? { keepClear: opts.keepClear } : {}),
  });
  if (!panel) return false;

  const input = el("input", "shell-id-input");
  input.type = "text";
  input.value = opts.value;
  input.placeholder = opts.derived || "<game-id>";
  input.spellcheck = false;

  const hint = el("div", "shell-id-hint", "Lower case, digits, hyphens. Empty = auto from the name.");
  const actions = el("div", "shell-id-actions");
  const reset = el("button", "shell-id-reset", "Reset to auto");
  const set = el("button", "shell-id-set", "Set");
  reset.type = "button";
  set.type = "button";
  actions.append(reset, set);
  panel.body.append(input, hint, actions);

  // "" is allowed and means reset; anything else has to be a legal address.
  const legal = (): boolean => { const v = input.value.trim(); return v === "" || valid(v); };
  const sync = (): void => {
    set.disabled = !legal();
    hint.classList.toggle("bad", !legal());
  };
  const commit = (): void => {
    if (!legal()) return;
    opts.onCommit(input.value.trim());
    panel.close();
  };

  input.addEventListener("input", sync);
  input.addEventListener("keydown", (e) => {
    // Stop keys reaching the app underneath: a canvas listening for Delete must
    // not act on one typed into an address.
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    // The opt-in coercion. Nothing is rewritten unless it is asked for, and when
    // it is, it happens in the field where it can be seen and undone.
    if (e.key === "Tab" && input.value.trim() !== "") {
      e.preventDefault();
      input.value = slugify(input.value);
      sync();
    }
  });
  set.addEventListener("click", commit);
  reset.addEventListener("click", () => { opts.onCommit(""); panel.close(); });

  sync();
  setTimeout(() => input.focus(), 0);
  return true;
}
