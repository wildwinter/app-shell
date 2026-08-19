// ---------------------------------------------------------------------------
// Property names: what an author may call a value the story reads and writes.
//
// This belongs to the shell for the same reason gameIds do (see ids.ts): it
// follows from the SHAPE these apps share - a project of data files, authored in
// an editor, compiled for something else to run - rather than from any one
// subject. Nothing here needs the words card, beat, hand or scene.
//
// UNLIKE gameIds, the rule is not a house style. It is dictated by the
// expression language both families embed (`@wildwinter/expr`), and every clause
// below is a failure observed by compiling one:
//
//   parser.ts tokenises an identifier as  /[a-zA-Z_][a-zA-Z0-9_]*/  and then
//   FOLDS it: `name: propTok.value.toLowerCase()`.
//
//   @patter.is_night   ->  ["sv","patter","is_night"]        reachable
//   @patter.isNight    ->  ["sv","patter","isnight"]         folded: a declaration
//                                                            spelled `isNight` is
//                                                            one nothing can reach
//   @patter.is-night   ->  ["bin","-",["sv","patter","is"],  NOT an error: it is
//                           ["s","night"]]                   SUBTRACTION. A hyphen
//                                                            silently compiles to
//                                                            a different meaning
//   @patter.is night   ->  parse error
//   @patter.9lives     ->  parse error (a name cannot start with a digit)
//   @patter.not        ->  parse error (`true false and or not` are keywords)
//
// The hyphen line is why this is worth a shared rule rather than a per-app
// check: every other violation is loud, and that one quietly means something
// else. It is also why a property name is NOT a gameId with different spelling -
// a gameId is built out of hyphens, and here a hyphen is an operator.
//
// DEPENDENCY-FREE on purpose, ids.ts's reasoning verbatim: the apps' compilers,
// CLIs and embedded runtimes need these rules far from any UI, so they keep
// their own copies and assert parity with these in a test.
// ---------------------------------------------------------------------------

/** The five words `@wildwinter/expr` lexes as keywords, so a property may not be
 *  called any of them: the reference does not resolve, it fails to parse. Kept
 *  here as a copy for the same reason the rules are (no dependency), and each
 *  app probes the real parser to prove the list is still true. */
export const RESERVED_PROPERTY_NAMES: readonly string[] = ["true", "false", "and", "or", "not"];

/** What an editor should tell an author, in one line. */
export const PROPERTY_NAME_HINT =
  "Lower case letters, digits and underscores. Cannot start with a digit. No hyphens or spaces.";

/**
 * Coerce a label into a legal property name: lower case, apostrophes dropped,
 * runs of anything else to a single underscore, no trailing underscore, an
 * underscore in front if it would otherwise start with a digit, and one behind
 * if it would otherwise be a keyword.
 *
 * A LEADING underscore is kept where the author typed one, because `_private` is
 * a legal name and a meaningful choice; only the ends that would be illegal are
 * touched.
 *
 * May return "", when there was nothing usable in the input. Callers treat that
 * as "no name yet" rather than as a name.
 */
export function propertyNameify(text: string): string {
  const trimmed = text.trim();
  // An underscore the author actually typed is kept; one that is only the ghost of
  // leading punctuation is not. That is the difference between `_private` and `!gold`.
  const deliberateLeading = trimmed.startsWith("_");
  let out = trimmed.toLowerCase().replace(/['’]/g, "")
    .replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (out === "") return "";
  if (deliberateLeading || /^[0-9]/.test(out)) out = `_${out}`;
  if (RESERVED_PROPERTY_NAMES.includes(out)) out = `${out}_`;
  return out;
}

/**
 * Is this a name the expression language can actually reach? Lower case letters,
 * digits and underscores, not starting with a digit, and not a keyword.
 *
 * "" is NOT legal: an unnamed declaration is an unfinished row, which is a
 * different thing from an illegal one, and callers distinguish them.
 */
export function isValidPropertyName(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED_PROPERTY_NAMES.includes(name);
}

/**
 * The one thing that is only a case difference, e.g. `isNight` -> `isnight`.
 *
 * Worth its own question because it is the only violation that can be repaired
 * without guessing at intent: the language already folds every REFERENCE, so
 * folding the declaration to match changes nothing observable, where inventing
 * an underscore for a space is a decision about what the author meant. Loaders
 * fold this class silently and report the rest.
 */
export function isCaseOnlyPropertyName(name: string): boolean {
  return !isValidPropertyName(name) && isValidPropertyName(name.toLowerCase());
}
