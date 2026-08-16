// ---------------------------------------------------------------------------
// The family's icon vocabulary.
//
// An icon is a WORD. Two apps in one suite spelling "close" differently is the
// same fault as calling one thing a scene here and a chapter there, and it is
// harder to notice because nobody reads glyphs, they just feel wrong. This
// module exists so that no app ever types a codepoint again: it asks for
// `icon.close` and gets whatever the family has agreed that means.
//
// The evidence that it was needed, gathered 2026-08-09 across both apps:
// Patterpad spelled close as `✕` twelve times, Storyletter used `✕` once and
// `×` twice - in one window - and a comment bubble had just been invented from
// scratch with nothing to check it against.
//
// GLYPHS, mostly, rather than SVG. That is a deliberate limit: a text glyph
// inherits colour, size and weight from its button for free, costs nothing to
// ship, and is legible at the small sizes this chrome lives at. SVG is here for
// the two or three shapes Unicode has no honest character for (a document with
// lines on it), lifted from Patterpad where it already drew them.
//
// Adding one: it needs a MEANING, not a picture. "A downward chevron" is not an
// entry; "expand this" is. If two callers want the same picture for two
// meanings, that is two entries, and one of them will be wrong later.
// ---------------------------------------------------------------------------

/**
 * Named by what it MEANS. Grouped by the job, because that is how a caller
 * looks for one.
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

export type IconName = keyof typeof icon;

/**
 * The few shapes no glyph says honestly, as inline SVG.
 *
 * `currentColor` throughout, so they take the colour of the button they sit in
 * exactly as the glyphs do, and sized in the markup for the same reason: an icon
 * that needs a CSS rule to be the right size is an icon that will be the wrong
 * size somewhere.
 *
 * Lifted from Patterpad, which drew them first.
 */
export const iconSvg = {
  /** A document with lines: notes exist on this thing. */
  noteFilled: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M3.4 1.4h5.3L12.6 5.3v8.1a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2V2.6A1.2 1.2 0 0 1 3.4 1.4ZM4.9 6.8h6.2v1.1H4.9Zm0 2.1h6.2v1.1H4.9Zm0 2.1h3.7v1.1H4.9Z"/></svg>',
  /** The same document, empty: nothing written here yet. */
  noteOutline: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M3.4 2h4.9l3.9 3.9v7.5a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M8.3 2.2v3.8h3.8"/><path d="M4.9 8h6.2M4.9 10h6.2M4.9 12h3.7" stroke-width="0.95"/></svg>',
} as const;

export type IconSvgName = keyof typeof iconSvg;
