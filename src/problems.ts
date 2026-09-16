// ---------------------------------------------------------------------------
// Problem copy: a validator's diagnostic rewritten for the person at the
// keyboard, through a table the app fills.
//
// Patterpad's `humanizeProblem` (its renderer.ts) proved the shape: a dozen
// validator categories each mapped to a plain sentence with a next step, naming
// things by their title, and a fallback that softens the technical residue.
// Storyletter showed the raw compiler string and labelled it `path [where]`
// (ui-review-2026-09, finding 17), the bracketed id that "Diagnostics name what
// the author can see" (design-language.md) rules out for anything but a
// DANGLING reference. This module is the translator; the tables are the
// apps', because the codes are theirs. `defaultProblemCopy` covers the handful
// of codes both validators raise in some form, as a floor an app spreads into
// its own table.
// ---------------------------------------------------------------------------

/** What a translator needs to know about a problem. `code` is the app's own
 *  category (Patterpad's `detail`, or a code Storyletter derives from its
 *  compiler message); `title` is the author-facing name of the thing the
 *  problem is about, when the app can resolve one; `where` is the raw
 *  reference (an id) for when it cannot. */
export interface ProblemLike {
  code?: string;
  message: string;
  path?: string;
  where?: string;
  title?: string;
}

export interface ProblemCopy {
  /** The sentence: what is wrong, in the author's words. */
  text: string;
  /** What to do about it, when there is one thing to do. */
  next?: string;
  /** The reference this problem is about no longer has a name to give, so the
   *  raw id may be shown, written `(id ...)` so it cannot be mistaken for a
   *  name. Set by the table entry; the translator never guesses it. */
  dangling?: boolean;
}

export type ProblemCopyEntry = (problem: ProblemLike) => ProblemCopy;
export type ProblemCopyTable = Record<string, ProblemCopyEntry>;

/** The name to call the thing a problem is about: its title in curly quotes,
 *  "(id ...)" only when the reference dangles and there is nothing else,
 *  and "This" otherwise, because the bar's "go to" shows the reader what
 *  "this" is and an id is not something they can look for. */
export function problemName(p: ProblemLike, dangling = false): string {
  if (p.title) return `“${p.title}”`;
  if (dangling && p.where) return `(id ${p.where})`;
  return "This";
}

/**
 * Translate `problem` through `table`. A matching entry decides the copy; with
 * no entry the raw message is kept and prefixed by the title when there is one
 * ("Burner Rig: duplicate id"). Nothing here ever writes `[where]`; an id
 * appears only as `(id ...)`, only when the entry says the reference dangles,
 * and only when there is no title to say instead.
 */
export function describeProblem(problem: ProblemLike, table: ProblemCopyTable = {}): ProblemCopy {
  const entry = problem.code ? table[problem.code] : undefined;
  if (entry) {
    const copy = entry(problem);
    const text = copy.dangling && !problem.title && problem.where && !copy.text.includes(`(id ${problem.where})`)
      ? `${copy.text} (id ${problem.where})`
      : copy.text;
    return copy.next ? { text, next: copy.next } : { text };
  }
  const message = problem.message.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
  return { text: problem.title ? `${problem.title}: ${message}` : message };
}

/** `describeProblem` as one line for a bar that has room for one: the sentence,
 *  then the next step after a space. */
export function problemLine(problem: ProblemLike, table?: ProblemCopyTable): string {
  const { text, next } = describeProblem(problem, table);
  return next ? `${text} ${next}` : text;
}

/**
 * The codes both validators raise in some form, in the family's voice. An app
 * spreads this into its own table and adds its own codes over it; a code an
 * app does not raise costs nothing.
 *
 *   duplicate-gameid    two things share one Game ID
 *   invalid-gameid      a Game ID that breaks the address rule
 *   dangling-reference  a jump / tag / property points at something gone
 *   unknown-property    a condition or effect names an undeclared property
 *   missing-name        a thing that needs a name has none
 *   empty               a container with nothing in it
 *   stale-build         the playable build is older than the source
 *   merge-conflict      a file still carries conflict markers
 */
export const defaultProblemCopy: ProblemCopyTable = {
  "duplicate-gameid": (p) => ({
    text: `The Game ID on ${problemName(p)} is already used elsewhere.`,
    next: "Each one must be unique; change one of them.",
  }),
  "invalid-gameid": (p) => ({
    text: `The Game ID on ${problemName(p)} isn't valid.`,
    next: "Use lowercase letters, digits and hyphens.",
  }),
  "dangling-reference": (p) => ({
    text: `${problemName(p, true)} points at something that no longer exists.`,
    next: "Choose where it goes.",
    dangling: true,
  }),
  "unknown-property": (p) => ({
    text: `${problemName(p)} uses a property that isn't set up yet.`,
    next: "Declare it in the project settings, or fix the name.",
  }),
  "missing-name": (p) => ({ text: `${problemName(p)} needs a name.` }),
  "empty": (p) => ({
    text: `${problemName(p)} is empty.`,
    next: "Add something inside it, or remove it.",
  }),
  "stale-build": (p) => ({
    text: `Your playable build${p.path ? ` (${p.path})` : ""} is out of date.`,
    next: "It refreshes the next time you publish.",
  }),
  "merge-conflict": (p) => ({
    text: `${p.path ?? "This file"} still has an unresolved merge conflict in it.`,
    next: "Resolve it in your version control tool, then reopen the project.",
  }),
};
