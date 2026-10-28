// ---------------------------------------------------------------------------
// The per-entity colour model (design-language.md section 4): a stable hash of
// a name selects an INDEX into the curated palette - repeatable, storage-free.
// The hues live in the token layer as `--char-0 .. --char-(N-1)` per theme, so
// a colour reference adapts to light/dark with zero JS. Each app defines the
// `--char-*` values in its own palette; this module only picks the slot.
//
// Storylet Studio uses it for dimension-value / zone chips; Patterpad for
// character cues.
//
// A colour can also be STORED: an app may keep a slot index on the thing
// itself (a character's `colour`), and every lookup passes it in beside the
// name. The point is a rename: hashing the new name would hand the character
// a different colour, so the app stamps the old name's slot (`hashColour`)
// into its model at rename time and the colour stays put. A stored slot that
// isn't a valid index is ignored and the hash answers, as if none were given.
// ---------------------------------------------------------------------------

/** Curated colour slots; must match the `--char-*` set defined per theme. */
export const PALETTE_SIZE = 12;

export const PALETTE = Array.from({ length: PALETTE_SIZE }, (_, i) => `var(--char-${i})`) as readonly string[];

/** Whether `v` is a palette slot: an integer from 0 to PALETTE_SIZE - 1. */
export function isColourSlot(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < PALETTE_SIZE;
}

/** The slot a name hashes to, ignoring anything stored: what an app freezes
 *  into its model when a character is renamed, so the colour survives the new
 *  name. FNV-1a + an fmix32 avalanche, well distributed even for short,
 *  similar names. */
export function hashColour(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) % PALETTE_SIZE;
}

/** A name's palette slot: the stored one when it is a valid slot, else the
 *  hash of the name. */
export function colourIndex(name: string, stored?: number | null): number {
  return isColourSlot(stored) ? stored : hashColour(name);
}

/** The theme-aware CSS variable reference for a name's slot (the stored one
 *  when it is valid, else the hash). */
export function colourFor(name: string, stored?: number | null): string {
  return PALETTE[colourIndex(name, stored)]!;
}
