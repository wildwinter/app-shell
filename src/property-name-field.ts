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
