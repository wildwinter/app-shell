// ---------------------------------------------------------------------------
// The manners for a field that names a declared property.
//
// The RULE is property-names.ts, which is dependency-free because each app's
// domain layer keeps its own copy of it. This is the other half: how a field
// BEHAVES while somebody types a name into it, which only UI touches, so the
// shell owns it outright.
//
// The manners are the gameId editor's, adopted rather than re-argued (see
// id-editor.ts): an illegal name is marked and blocks Save, and Tab coerces it,
// in the field, where it can be seen and undone. Nothing is rewritten as it is
// typed. Patterpad's first pass at this folded every keystroke to lower case;
// that is the manner the id editor had already rejected, on the grounds that an
// app which silently renames a thing has made a decision that was not its to
// make, and a property name is exactly that kind of thing: the author is naming
// something their own conditions will call.
//
// It arrived here as two copies, one per app, written in one session and already
// carrying the same forty lines of fault wording. Lifting them before they could
// drift is the whole reason this file exists.
// ---------------------------------------------------------------------------

import { isValidPropertyName, propertyNameify, RESERVED_PROPERTY_NAMES } from "./property-names.js";

/** Re-check callbacks for bound REFERENCE fields, so a host can say "the declarations
 *  changed" without holding a handle per row. */
const refSyncs = new WeakMap<HTMLInputElement, () => void>();

/**
 * One line saying what is wrong with this name, or undefined when nothing is.
 *
 * Each branch names what actually HAPPENS rather than reciting the rule, because
 * the person reading it is usually somebody wondering why a condition does
 * nothing. Kept to one line: it lands in a rollover on the field, and hosts
 * repeat it in the Save error rather than inventing a summary of their own.
 */
export function propertyNameProblem(name: string): string | undefined {
  if (isValidPropertyName(name)) return undefined;
  const suggestion = propertyNameify(name);
  const tail = suggestion ? ` Try "${suggestion}", or press Tab.` : "";
  if (RESERVED_PROPERTY_NAMES.includes(name.toLowerCase())) {
    return `Cannot be used: "${name.toLowerCase()}" is a keyword in expressions.${tail}`;
  }
  // The one that is not an error anywhere else: `@scope.a-b` compiles to a-minus-b.
  if (name.includes("-")) return `Cannot be used: a hyphen reads as subtraction in an expression.${tail}`;
  if (/^[0-9]/.test(name)) return `Cannot be used: a name cannot start with a digit.${tail}`;
  if (name !== name.toLowerCase()) {
    return `Cannot be used: expressions fold names, so this would look for "${name.toLowerCase()}".${tail}`;
  }
  return `Cannot be used: only lower case letters, digits and underscores.${tail}`;
}

/**
 * Wire a name field: mark it live, explain the fault in its rollover, and coerce
 * on Tab. `onCommit` receives what the author typed, VERBATIM, on every input.
 *
 * `.illegal` rather than dupGuard's `.invalid`, because both can be true of one
 * field and `dupGuard.check()` owns that class: it would clear this marking every
 * time it ran, including at the moment of a blocked Save.
 *
 * An empty field is not marked. An unfinished row is a different thing from an
 * illegal one, and hosts prune blank names on save.
 */
export function bindPropertyName(
  input: HTMLInputElement,
  onCommit: (value: string) => void,
  opts: { hint?: string } = {},
): void {
  const hint = opts.hint;
  const sync = (): void => {
    const v = input.value.trim();
    const problem = v === "" ? undefined : propertyNameProblem(v);
    input.classList.toggle("illegal", !!problem);
    if (problem) input.title = problem;
    else if (input.title.startsWith("Cannot be used")) {
      if (hint) input.title = hint;
      else input.removeAttribute("title");
    }
  };
  input.addEventListener("input", () => { onCommit(input.value); sync(); });
  input.addEventListener("keydown", (e) => {
    // The opt-in coercion, the id editor's gesture. Shift+Tab is left alone: it is
    // how somebody leaves a field they have not finished with.
    if (e.key !== "Tab" || e.shiftKey) return;
    const typed = input.value.trim();
    if (typed === "" || isValidPropertyName(typed)) return;
    const coerced = propertyNameify(typed);
    if (!coerced || coerced === input.value) return;
    e.preventDefault();
    input.value = coerced;
    onCommit(coerced);
    sync();
  });
  sync();
}

/**
 * The first field in `host` holding a name no expression could reach, for a Save
 * gate. Hosts hand this back beside `dupGuard.firstDuplicate()`: two faults, two
 * sets of words, one gate.
 */
export function firstIllegalPropertyName(host: ParentNode): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>("input.illegal");
}

// ---------------------------------------------------------------------------
// Reference fields, which are a different job from declaration fields.
//
// A declaration NAMES a property; a reference POINTS at one. The expression
// parser folds every reference, so `@world.isNight` reaches `isnight` perfectly
// well and complaining about the capital would be inventing a rule the language
// does not have. Everything else still bites, and harder: no declaration may
// contain a hyphen, so `is-night` in a reference can never match anything that
// exists.
//
// And a reference has a fault a declaration cannot have: naming something that
// was never declared. That is not a grammar question, so the host supplies the
// list. The cost of getting it wrong is quiet - a coverage driver pointed at a
// property nobody declared feeds a value nobody reads, the branches it was meant
// to exercise stay unexercised, and the report shows them as never hit, which
// reads as "this content is unreachable" rather than "that name is a typo".
// ---------------------------------------------------------------------------

export interface PropertyRefOptions {
  /** The names that exist, read fresh on every check so a declaration added in the
   *  same dialog clears the complaint. Compared case-insensitively, since the
   *  parser folds. */
  known: () => string[];
  /** The scope token this field addresses, for the wording ("no @world property..."). */
  scope?: string;
  /** Shown on the field when there is nothing to complain about. */
  hint?: string;
}

/** The closest known name, when one is close enough to be worth naming. Deliberately
 *  narrow: a wrong suggestion is worse than none, so it wants a shared prefix or a
 *  single-character slip, not the least-bad match in the list. */
function nearest(name: string, known: string[]): string | undefined {
  const n = name.toLowerCase();
  const byPrefix = known.filter((k) => k.toLowerCase().startsWith(n) || n.startsWith(k.toLowerCase()));
  if (byPrefix.length === 1) return byPrefix[0];
  let best: string | undefined;
  let bestScore = 3;                                        // strictly better than "three edits away"
  for (const k of known) {
    const a = k.toLowerCase();
    if (Math.abs(a.length - n.length) > 2) continue;
    // Levenshtein, small strings, no need for a matrix beyond two rows.
    let prev = Array.from({ length: n.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= n.length; j++) {
        row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === n[j - 1] ? 0 : 1));
      }
      prev = row;
    }
    const d = prev[n.length]!;
    if (d < bestScore) { bestScore = d; best = k; }
  }
  return best;
}

/** Why this reference cannot be used, or undefined when it can. */
export function propertyRefProblem(name: string, opts: PropertyRefOptions): string | undefined {
  const scope = opts.scope ? `@${opts.scope}` : "that scope";
  // Case is NOT a fault here: the parser folds references.
  const folded = name.toLowerCase();
  if (!isValidPropertyName(folded)) {
    const suggestion = propertyNameify(name);
    const tail = suggestion ? ` Try "${suggestion}", or press Tab.` : "";
    if (RESERVED_PROPERTY_NAMES.includes(folded)) return `Cannot be used: "${folded}" is a keyword in expressions.${tail}`;
    if (name.includes("-")) return `Cannot be used: a hyphen reads as subtraction in an expression.${tail}`;
    if (/^[0-9]/.test(name)) return `Cannot be used: a name cannot start with a digit.${tail}`;
    return `Cannot be used: only lower case letters, digits and underscores.${tail}`;
  }
  const known = opts.known();
  if (known.some((k) => k.toLowerCase() === folded)) return undefined;
  const near = nearest(folded, known);
  if (near) return `No ${scope} property is called "${name}". Did you mean "${near}"?`;
  if (known.length === 0) return `No ${scope} properties are declared yet. Declare one above first.`;
  const shown = known.slice(0, 3).map((k) => `"${k}"`).join(", ");
  const more = known.length > 3 ? `, and ${known.length - 3} more` : "";
  return `No ${scope} property is called "${name}". Declared: ${shown}${more}.`;
}

/**
 * Wire a field that POINTS at a declared property: same manners as a declaration
 * field (mark, do not rewrite, Tab coerces), plus the declared names offered as a
 * datalist, because the rule is declare-then-reference and a picker makes that
 * painless rather than pedantic.
 *
 * Marks `.illegal` for an undeclared name too, which gates Save wherever the host
 * already asks `firstIllegalPropertyName`.
 */
export function bindPropertyRef(
  input: HTMLInputElement,
  onCommit: (value: string) => void,
  opts: PropertyRefOptions,
): void {
  const list = document.createElement("datalist");
  list.id = `shell-propref-${Math.random().toString(36).slice(2, 9)}`;
  input.setAttribute("list", list.id);

  // Attached lazily, not once at bind. A datalist has to be IN the document to do anything, and it is
  // attached as a sibling of the input - so binding a field that has not been appended yet (which is
  // the ordinary order for a builder that makes its nodes and then mounts them) silently produced no
  // autocomplete at all: no error, nothing to see. This re-tries on every sync, so it heals as soon as
  // the field reaches the tree.
  const attach = (): void => {
    if (!list.isConnected && input.parentNode) input.after(list);
  };

  const sync = (): void => {
    attach();
    const known = opts.known();
    list.replaceChildren(...known.map((k) => { const o = document.createElement("option"); o.value = k; return o; }));
    const v = input.value.trim();
    const problem = v === "" ? undefined : propertyRefProblem(v, opts);
    input.classList.toggle("illegal", !!problem);
    if (problem) input.title = problem;
    else if (input.title.startsWith("Cannot be used") || input.title.startsWith("No ")) {
      if (opts.hint) input.title = opts.hint;
      else input.removeAttribute("title");
    }
  };
  refSyncs.set(input, sync);

  input.addEventListener("input", () => { onCommit(input.value); sync(); });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    const typed = input.value.trim();
    // Only a GRAMMAR fault is coercible. An undeclared name is not something Tab can
    // fix, and a legal reference in the wrong case is not a fault at all.
    if (typed === "" || isValidPropertyName(typed.toLowerCase())) return;
    const coerced = propertyNameify(typed);
    if (!coerced || coerced === input.value) return;
    e.preventDefault();
    input.value = coerced;
    onCommit(coerced);
    sync();
  });
  sync();
}

/**
 * Re-check every bound reference field inside `host`. Hosts call this when the
 * DECLARATIONS change, since a reference's validity depends on a list it does not
 * own: rename a property and the driver pointing at it is wrong from that moment,
 * with nothing typed into it.
 */
export function revalidatePropertyRefs(host: ParentNode): void {
  for (const input of host.querySelectorAll("input")) refSyncs.get(input)?.();
}
