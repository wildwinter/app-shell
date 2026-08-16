// ---------------------------------------------------------------------------
// Game IDs: the host-facing ADDRESS of a thing.
//
// This belongs to the shell because it follows from the SHAPE these apps share
// rather than from any one subject: a project of data files that compiles to
// artefacts for something else to consume. "Something else consumes it" is the
// whole reason content needs a stable name a program can call it by. Nothing
// here needs the words card, beat, hand or scene to describe.
//
// It arrived here as two byte-identical copies, in Storyletter's model and
// Patterpad's, each with its own editor popover on top - and the two editors had
// grown DIFFERENT manners for the same job, which is how the duplication was
// noticed at all.
//
// DEPENDENCY-FREE on purpose. The apps' domain layers (compilers, CLIs, engine
// runtimes) need these rules far from any UI, and they keep their own copies
// rather than taking a dependency on a UI kit; each asserts parity with these in
// a test, so the copies cannot drift in silence. A NEW app starts from these.
// ---------------------------------------------------------------------------

/**
 * Slugify a name into hyphen form: lower case, apostrophes dropped, runs of
 * anything else to a single hyphen, no leading or trailing hyphen.
 *
 * May return "", when there was nothing usable in the input. Callers treat that
 * as "no pinned address" rather than as an address.
 */
export function gameIdify(text: string): string {
  return text.toLowerCase().replace(/['’]/g, "")
    .replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

/** Is this a legal address? Lower case, digits and hyphens, starting and ending
 *  with a letter or a digit. Note "" is NOT legal: an empty pinned address means
 *  "derive one", which is a different thing from an address. */
export function isValidGameId(gameId: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(gameId);
}
