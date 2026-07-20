// ---------------------------------------------------------------------------
// The per-entity colour model (design-language.md section 4): a stable hash of
// a name selects an INDEX into the curated palette - repeatable, storage-free.
// The hues live in the token layer as `--char-0 .. --char-(N-1)` per theme, so
// a colour reference adapts to light/dark with zero JS. Each app defines the
// `--char-*` values in its own palette; this module only picks the slot.
//
// Storylet Studio uses it for dimension-value / zone chips; Patterpad for
// character cues.
// ---------------------------------------------------------------------------

/** Curated colour slots; must match the `--char-*` set defined per theme. */
export const PALETTE_SIZE = 12;

export const PALETTE = Array.from({ length: PALETTE_SIZE }, (_, i) => `var(--char-${i})`) as readonly string[];

/** Hash a name to a palette slot: FNV-1a + an fmix32 avalanche, well
 *  distributed even for short, similar names. */
export function colourIndex(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) % PALETTE_SIZE;
}

/** The theme-aware CSS variable reference for a name's slot. */
export function colourFor(name: string): string {
  return PALETTE[colourIndex(name)]!;
}
