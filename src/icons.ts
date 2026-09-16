// ---------------------------------------------------------------------------
// The family's icon vocabulary.
//
// An icon is a WORD. Two apps in one suite spelling "close" differently is the
// same fault as calling one thing a scene here and a chapter there, and it is
// harder to notice because nobody reads glyphs, they just feel wrong. This
// module exists so that no app ever types a codepoint again: it asks for
// `iconNode("close")` and gets whatever the family has agreed that means.
//
// The evidence that it was needed, gathered 2026-08-09 across both apps:
// Patterpad spelled close as a cross twelve times, Storyletter used the same
// cross once and a multiplication sign twice, in one window, and a comment
// bubble had just been invented from scratch with nothing to check it against.
//
// DRAWN, not typed (design-language.md section 4, "Icons are drawn, and so are
// separators", 2026-09-16). The first cut of this table was Unicode glyphs,
// which render from whatever symbol font the OS has, so weight, baseline and
// optical size drifted per character and per platform. The vocabulary is now
// one drawn set: Lucide, vendored below as inline SVG strings on one 24-unit
// grid at one stroke weight. The words did not change; what they draw did.
//
//   Lucide 1.46.0 (lucide-static), ISC licence.
//   https://lucide.dev  /  https://cdn.jsdelivr.net/npm/lucide-static@1.46.0/icons/<name>.svg
//   Fetched 2026-09-16. The chosen decision record is
//   patterkit/design/ui-review-2026-09/07c-track-c-icon-sets-notes.md.
//
// STROKE. The family draws icons at 14px inside its small square buttons and
// wants a 1.5px rendered stroke against Inter at that size (Inter Regular's
// stems are about 1.3px there). Lucide's native stroke is 2 on a 24 grid,
// which is 2 x 14/24 = 1.17px at 14px, a shade light. So the root of every
// stroke icon carries stroke-width="2.571": 2.571 x 14/24 = 1.5. A caller
// drawing at another size gets the proportional weight (12px: 1.29px; 16px:
// 1.71px), which is what one drawn set means. Filled shapes (the discs) carry
// fill="currentColor" and no stroke at all.
//
// Every icon is `currentColor`, so it takes the colour of the button it sits
// in, and none of the strings carries width/height: the size is the caller's
// (`iconNode(name, size)`), so an icon can never be the wrong size somewhere
// because a CSS rule failed to reach it.
//
// Adding one: it needs a MEANING, not a picture. "A downward chevron" is not an
// entry; "expand this" is. If two callers want the same picture for two
// meanings, that is two entries, and one of them will be wrong later.
// ---------------------------------------------------------------------------
//
// Lucide licence (the icons vendored in this file):
//
//   ISC License
//   Copyright (c) 2026 Lucide Icons and Contributors
//
//   Permission to use, copy, modify, and/or distribute this software for any
//   purpose with or without fee is hereby granted, provided that the above
//   copyright notice and this permission notice appear in all copies.
//
//   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
//   WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
//   MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
//   ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
//   WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
//   ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
//   OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
//   Portions of Lucide (among those used here: arrow-down, arrow-left,
//   arrow-right, arrow-up, check, chevron-down, chevron-left, chevron-right,
//   circle, lock, plus, search, x) derive from Feather, MIT,
//   Copyright (c) 2013-present Cole Bemis. See LICENSES.md.
// ---------------------------------------------------------------------------

/**
 * The typed glyphs the vocabulary used to draw.
 *
 * @deprecated Since the move to drawn icons (design-language.md, "Icons are
 * drawn"). Kept byte-for-byte so a consumer still doing
 * `textContent = icon.close` keeps working while each app moves; a new call
 * site uses `iconNode(name)` (a node to append) or `iconHtml(name)` (for an
 * innerHTML build). The names are the same in all three. Removed once both
 * apps have moved.
 */
export const icon = {
  // --- dismissing and revealing ---------------------------------------------
  /** Close a panel, a dialog, a popover. Patterpad's, twelve times over. */
  close: "✕",
  /** The overflow menu on a document or a row: "more about this". */
  more: "⋯",
  /** Collapsed disclosure, pointing at what would open. */
  collapsed: "▸",
  /** Expanded disclosure. */
  expanded: "▾",
  /** A dropdown's affordance, where it is not a real <select>. */
  dropdown: "▾",

  // --- moving through things ------------------------------------------------
  /** Back / previous, in a breadcrumb or a stepper. */
  back: "‹",
  /** Forward / next. */
  forward: "›",
  /** Up one, in a list. */
  up: "↑",
  /** Down one. */
  down: "↓",

  // --- state ----------------------------------------------------------------
  /** Done, applied, agreed. */
  tick: "✓",
  /** Somebody else holds this: the version-control lock. */
  locked: "⊘",
  /** Read-only on disk with no other holder: the resting state of everything
   *  in a lock-based working copy that nobody has checked out yet. */
  readOnly: "○",
  /** YOU hold this one: checked out / opened by the current user, still yours to
   *  edit. Shares its glyph with `note`, which the table permits: an entry is a
   *  MEANING, and two meanings may draw the same shape. */
  checkedOut: "✎",
  /** Tracked, with local changes not yet committed. */
  modified: "●",
  /** Not in version control yet: new since the last commit. */
  untracked: "+",
  /** Something needs attention but is not fatal. */
  warning: "‼",
  /** A live thing: the running position, an active marker. */
  dot: "●",
  /** Play, in the sense of "run this". */
  play: "▶",
  /** Start the thing again from the top: a play session, a sweep. Named for the
   *  act, not the arrow, which is the table's rule. */
  restart: "⟲",
  /** The three ways a collection can be shown. Named by what you get rather than
   *  by the glyph, so a second app can pick the same three without copying
   *  somebody's taste in symbols. */
  viewCards: "▦",
  viewTable: "☰",
  viewNode: "◈",

  // --- handling -------------------------------------------------------------
  /** The drag grip on a reorderable row. */
  grip: "⠿",
  /** Add one of whatever this list holds. */
  add: "+",

  // --- annotation -----------------------------------------------------------
  /** Documentation notes: the pencil. Both apps had chosen it independently,
   *  which is the happiest way for a vocabulary entry to arrive. */
  note: "✎",
  /** A comment thread. Speech, not a pencil: documentation states the reason,
   *  comments are the conversation, and the two must never look alike. */
  comment: "❝",
} as const;

/**
 * Every word in the vocabulary. The 26 the glyph table had, plus the seven the
 * 2026-09 review found the apps drawing by hand with nothing to check against.
 */
export type IconName =
  | keyof typeof icon
  /** History back, the topbar's quiet arrow pair (nav-history.ts). An ARROW,
   *  not a chevron: a chevron says structure, an arrow says time (the author's
   *  ruling, 2026-08-28). Added beside `arrowRight` so the pair share a set. */
  | "arrowLeft"
  /** History forward; also the one honest "go there" arrow where a link used
   *  to carry a typed one. */
  | "arrowRight"
  /** Connect to a server, a live link, a running game. */
  | "connect"
  /** Search. */
  | "search"
  /** Keep this window on top (tool-window-web.ts). */
  | "pin"
  /** Settings. */
  | "settings"
  /** Record. The icon is the DISC; painting it in the danger colour while
   *  recording is the caller's job, through the button's own colour. */
  | "record";

// The two roots every drawing shares. Kept as constants so the table below is
// the inner elements only, which is what a reader compares against lucide.dev.
const STROKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.571" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const FILL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">';
const stroked = (inner: string): string => `${STROKE}${inner}</svg>`;
const filled = (inner: string): string => `${FILL}${inner}</svg>`;

// The three discs are the one drawing in the table that is not Lucide's own
// element as shipped: Lucide's `circle` is an r=10 outline that fills its box,
// which at badge size beside a row title is a blot, so the disc is drawn at a
// smaller radius with the fill forced (the same amount of hand-drawing as the
// legacy noteFilled below, and the decision record's stated cost). `modified`
// and `dot` share it, as their glyphs did; `record` is larger because a record
// button is meant to fill more of its box.
const DISC = filled('<circle cx="12" cy="12" r="6"/>');
const DISC_LARGE = filled('<circle cx="12" cy="12" r="9"/>');

/**
 * The drawings, by word. Each is a complete `<svg viewBox="0 0 24 24" …>`
 * string with no width/height (see `iconNode` / `iconHtml`, which size it).
 * The Lucide name each derives from is on the entry, so a reviewer can put
 * the two side by side.
 */
const DRAWN: Record<IconName, string> = {
  // --- dismissing and revealing ---------------------------------------------
  /** Close a panel, a dialog, a popover. (x) */
  close: stroked('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  /** The overflow menu on a document or a row: "more about this". (ellipsis) */
  more: stroked('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  /** Collapsed disclosure, pointing at what would open. (chevron-right) */
  collapsed: stroked('<path d="m9 18 6-6-6-6"/>'),
  /** Expanded disclosure. (chevron-down) */
  expanded: stroked('<path d="m6 9 6 6 6-6"/>'),
  /** A dropdown's affordance, where it is not a real <select>. (chevron-down) */
  dropdown: stroked('<path d="m6 9 6 6 6-6"/>'),

  // --- moving through things ------------------------------------------------
  /** Back / previous, in a breadcrumb or a stepper. (chevron-left) */
  back: stroked('<path d="m15 18-6-6 6-6"/>'),
  /** Forward / next. (chevron-right) */
  forward: stroked('<path d="m9 18 6-6-6-6"/>'),
  /** Up one, in a list. (arrow-up) */
  up: stroked('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'),
  /** Down one. (arrow-down) */
  down: stroked('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
  /** History back. (arrow-left) */
  arrowLeft: stroked('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
  /** History forward; "go there". (arrow-right) */
  arrowRight: stroked('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),

  // --- state ----------------------------------------------------------------
  /** Done, applied, agreed. (check) */
  tick: stroked('<path d="M20 6 9 17l-5-5"/>'),
  /** Somebody else holds this: the version-control lock. (lock) */
  locked: stroked('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  /** Read-only on disk with no other holder. (lock-open) An open lock rather
   *  than a struck-out eye: this state is not a prohibition. Nobody holds the
   *  file, saving checks it out, and it is the resting state of everything the
   *  author has not touched yet under a lock-based VCS. eye-off would say "you
   *  cannot", which is false here; the open lock says "not held", beside
   *  `locked`, which is the shut one, so the two read as a pair. */
  readOnly: stroked('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
  /** YOU hold this one: checked out, still yours to edit. (pencil) */
  checkedOut: stroked('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
  /** Tracked, with local changes not yet committed. (a disc; see DISC) */
  modified: DISC,
  /** Not in version control yet: new since the last commit. (plus) */
  untracked: stroked('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  /** Something needs attention but is not fatal. (triangle-alert) */
  warning: stroked('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  /** A live thing: the running position, an active marker. (a disc) */
  dot: DISC,
  /** Play, in the sense of "run this". (play) */
  play: stroked('<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>'),
  /** Start the thing again from the top: a play session, a sweep. (rotate-ccw) */
  restart: stroked('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
  /** The three ways a collection can be shown, named by what you get. */
  /** Cards. (layout-grid) */
  viewCards: stroked('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
  /** A table. (rows-3: a ruled box, which is a table. `list` is bullets, and
   *  the view is not a list.) */
  viewTable: stroked('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M21 9H3"/><path d="M21 15H3"/>'),
  /** A node graph. (waypoints: four nodes on edges reads as a graph.
   *  `git-fork` reads as version control, which this family also draws, and
   *  a picture that means two things is the fault this table exists to
   *  prevent.) */
  viewNode: stroked('<path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>'),
  /** Record: the disc, in whatever colour the button is. (a disc; see DISC_LARGE) */
  record: DISC_LARGE,

  // --- handling -------------------------------------------------------------
  /** The drag grip on a reorderable row. (grip-vertical) */
  grip: stroked('<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>'),
  /** Add one of whatever this list holds. (plus) */
  add: stroked('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  /** Connect: to a server, a live link, a running game. (plug) */
  connect: stroked('<path d="M12 22v-5"/><path d="M15 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/><path d="M9 8V2"/>'),
  /** Search. (search) */
  search: stroked('<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>'),
  /** Keep this window on top. (pin) */
  pin: stroked('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'),
  /** Settings. (settings) */
  settings: stroked('<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>'),

  // --- annotation -----------------------------------------------------------
  /** Documentation notes: a document with lines on it. (file-text) The glyph
   *  table drew a pencil and shared it with `checkedOut`; the drawn set gives
   *  the two meanings two shapes, and notes get the document, which is what
   *  the shell's own noteFilled/noteOutline pair had always drawn. */
  note: stroked('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  /** A comment thread. Speech, not a document: documentation states the
   *  reason, comments are the conversation, and the two must never look
   *  alike. (message-square) */
  comment: stroked('<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>'),
};

/**
 * The drawings as strings, by word, for a caller that builds markup itself.
 * Prefer `iconHtml(name, size)`, which sizes it; these carry no width/height.
 *
 * Two legacy entries ride along unchanged: `noteFilled` and `noteOutline`, the
 * has-notes / no-notes pair Patterpad drew on a 16-unit grid before the set
 * existed. They are sized in the markup (13px) and on their own grid, so they
 * are NOT part of the vocabulary above and `iconNode` does not know them; no
 * app uses them today. They stay until a 24-grid pair replaces them, because
 * their two-state meaning (there are notes / there are none) has no Lucide
 * shape, and re-weighting the 16-grid drawing to the family stroke merges its
 * text lines.
 */
export const iconSvg = {
  ...DRAWN,
  /** A document with lines: notes exist on this thing. (legacy, 16 grid) */
  noteFilled: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M3.4 1.4h5.3L12.6 5.3v8.1a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2V2.6A1.2 1.2 0 0 1 3.4 1.4ZM4.9 6.8h6.2v1.1H4.9Zm0 2.1h6.2v1.1H4.9Zm0 2.1h3.7v1.1H4.9Z"/></svg>',
  /** The same document, empty: nothing written here yet. (legacy, 16 grid) */
  noteOutline: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3.4 2h4.9l3.9 3.9v7.5a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M8.3 2.2v3.8h3.8"/><path d="M4.9 8h6.2M4.9 10h6.2M4.9 12h3.7" stroke-width="0.95"/></svg>',
} as const;

export type IconSvgName = keyof typeof iconSvg;

/** Every word, in table order, for a test or a gallery to walk. */
export const ICON_NAMES = Object.keys(DRAWN) as IconName[];

/** The default size: 14px, the family's icon inside its small square button. */
export const ICON_SIZE = 14;

/**
 * The drawing as markup with its size set, for a caller building innerHTML.
 * `data-icon` carries the word, so a stylesheet or a test can find it.
 */
export function iconHtml(name: IconName, size = ICON_SIZE): string {
  return DRAWN[name].replace("<svg ", `<svg width="${size}" height="${size}" data-icon="${name}" `);
}

// One parsed template per word, filled on first use; every call clones it, so
// the string is parsed once per window and each caller gets its own node.
const templates = new Map<IconName, SVGSVGElement>();

/**
 * The drawing as a fresh SVG node, sized. Append it where the glyph used to be
 * set as text; it is `aria-hidden`, so the button's accessible name stays the
 * button's (`aria-label` / `data-tip`), as it always had to.
 */
export function iconNode(name: IconName, size = ICON_SIZE): SVGSVGElement {
  let tpl = templates.get(name);
  if (!tpl) {
    const holder = document.createElement("template");
    holder.innerHTML = DRAWN[name];
    tpl = holder.content.firstElementChild as SVGSVGElement;
    tpl.setAttribute("data-icon", name);
    templates.set(name, tpl);
  }
  const node = tpl.cloneNode(true) as SVGSVGElement;
  node.setAttribute("width", String(size));
  node.setAttribute("height", String(size));
  return node;
}

// The glyph table, reversed, so a legacy call site that still hands the shell
// a typed character ("✕", "↑") draws the word it stood for. Where two words
// shared a glyph the first in table order wins, which is fine: the picture was
// the same either way. Goes when `icon` does.
const BY_GLYPH = new Map<string, IconName>();
for (const [name, glyph] of Object.entries(icon) as [IconName, string][]) {
  if (!BY_GLYPH.has(glyph)) BY_GLYPH.set(glyph, name);
}

/** The word a deprecated glyph stood for, or undefined for any other string. */
export function iconNameOfGlyph(glyph: string): IconName | undefined {
  return BY_GLYPH.get(glyph);
}

/** Whether a string is a word in the vocabulary. */
export function isIconName(s: string): s is IconName {
  return Object.prototype.hasOwnProperty.call(DRAWN, s);
}
