// ---------------------------------------------------------------------------
// An extension's problems, worded for the writer, in both apps.
//
// The command lines word an extension's problems for the file: "entries.card.c_7k2.cue.sound: "cue.sound" is
// required and not set". The problems bar says the same for the writer: the extension by its name, the item as
// the writer knows it, and the field by its label: "Probe: The bell needs a sound in cue." Patterpad wrote these
// rules first (its problem-copy.ts); they are the family's, here, so the two apps read alike.
//
// What is the app's is passed in: how it names the item (a line by its words, a card by its title), the words
// for its node kinds, and where the writer goes to change a value ("in the inspector", "on its page"). The rules
// key on the toolkit's code for the problem (`@wildwinter/toolkit/extensions`' Problem.code), which each app's
// compiler carries on the issue; a code they do not know stands as the message it came with.
//
// No app state, no Electron, no DOM: words only.
// ---------------------------------------------------------------------------

/** A field declaration as the wording reads it: its name, its label, and a record's or an item's own fields. */
export interface FieldWordsDecl {
  name: string;
  label?: string;
  fields?: readonly FieldWordsDecl[];
  of?: { fields?: readonly FieldWordsDecl[] };
}

/** What the app knows to word one problem about a value. */
export interface ValueProblemWords {
  /** The extension's name, which leads the line ("Probe"). */
  extension: string;
  /** The item, as the writer knows it ("“What'll it be, stranger?”", "the card “bell”"). */
  node: string;
  /** The field, by its label (`fieldPhrase`). */
  field: string;
  /** Where a value is changed, finishing "Pick one ..." ("in the inspector", "on its page"). */
  place: string;
  /** A node kind in the app's words ("game event", "hand template"). */
  kindWord(kind: string): string;
}

export const quoted = (s: string): string => `“${s}”`;
const cap = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const article = (s: string): string => (/^[aeiou]/i.test(s) ? "an" : "a");

/** A field inside a node's entry, by its label: "Note", "sound in cue", "item 2 of words". */
export function fieldPhrase(fields: readonly FieldWordsDecl[], path: string): string {
  const tokens = path.split(/\.|(?=\[)/).filter((t) => t !== "");
  const top = fields.find((f) => f.name === tokens[0]);
  const topLabel = top?.label ?? tokens[0] ?? "";
  if (tokens.length <= 1) return topLabel;
  const last = tokens[tokens.length - 1]!;
  const index = /^\[(\d+)\]$/.exec(last);
  if (index) return `item ${Number(index[1]) + 1} of ${topLabel}`;
  const parts = [...(top?.fields ?? []), ...(top?.of?.fields ?? [])];
  return `${parts.find((f) => f.name === last)?.label ?? last} in ${topLabel}`;
}

/** The sentence and its next step for one value a check refused, by the toolkit's code; undefined for a code
 *  the rules do not know. `message` is the check's own sentence, which some sentences take their values from. */
export function valueProblemSentence(code: string | undefined, message: string, w: ValueProblemWords): { text: string; next?: string } | undefined {
  const { field, node, extension: name, place } = w;
  const on = `${field} on ${node}`;
  const value = /^"[^"]*" is "([^"]*)"/.exec(message)?.[1];
  switch (code) {
    case "required": return { text: `${node} needs ${article(field)} ${field}.` };
    case "wrong-type": return { text: `${on} isn't the kind of value ${name} expects.`, next: `Set it again ${place}.` };
    case "below-min": { const m = / is ([^,]+), below the least it may be, (.+)$/.exec(message); return m ? { text: `${on} is ${m[1]}, but ${name} takes nothing below ${m[2]}.` } : undefined; }
    case "above-max": { const m = / is ([^,]+), above the most it may be, (.+)$/.exec(message); return m ? { text: `${on} is ${m[1]}, but ${name} takes nothing above ${m[2]}.` } : undefined; }
    case "not-a-value":
      if (/not among its flags$/.test(message)) return { text: `${on} has a flag that isn't one of its choices.`, next: `Pick from the choices ${place}.` };
      return { text: `${on} is ${quoted(value ?? "")}, which isn't one of its choices.`, next: `Pick one ${place}.` };
    case "not-a-stage": return { text: `${on} is ${quoted(value ?? "")}, which isn't one of its stages.`, next: `Pick one ${place}.` };
    case "renamed-stage": {
      const m = / is "([^"]*)", a stage this extension has since renamed "([^"]*)"/.exec(message);
      return m ? { text: `${on} is ${quoted(m[1]!)}, a stage ${name} has since renamed ${quoted(m[2]!)}.`, next: `Pick ${quoted(m[2]!)} to update it.` } : undefined;
    }
    case "no-such-node": {
      const m = / (?:names|is keyed by) (\w+) "([^"]*)", which does not exist/.exec(message);
      return m ? { text: `${on} names the ${w.kindWord(m[1]!)} ${quoted(m[2]!)}, which isn't in the project.`, next: "Choose another, or clear it." } : undefined;
    }
    case "missing-id": return { text: `An item in ${field} on ${node} has no id.`, next: `Give it one ${place}.` };
    case "duplicate-id": { const id = / repeats the id "([^"]*)"/.exec(message)?.[1]; return { text: `Two items in ${field} on ${node} share the id ${quoted(id ?? "")}.`, next: "Give each its own." }; }
    case "unknown-field": case "unknown-key":
      return { text: `${node} has a value for ${quoted(field)}, which ${name} doesn't declare any more.`, next: "It's kept, but your game won't get it." };
    default: return undefined;
  }
}

/** A problem's line: the extension's name, then the sentence and its next step. */
export function extensionLine(extension: string, c: { text: string; next?: string } | undefined): string | undefined {
  return c ? `${extension}: ${cap(c.text)}${c.next ? ` ${c.next}` : ""}` : undefined;
}

/** What the app knows to word an entry problem (`entryProblemLine`). */
export interface EntryProblemWords {
  extension: string;
  /** The extension's declarations for a node kind. */
  fields(kind: string): readonly FieldWordsDecl[];
  /** A node as the writer knows it, by kind and id. */
  node(kind: string, id: string): string;
  place: string;
  kindWord(kind: string): string;
}

/**
 * The writer's line for a problem in a node's extension values, read from the command line's
 * "entries.<kind>.<id>[.<path>]: <what is wrong>" and the toolkit's code (`orphan` and `unresolved` included);
 * undefined for a message not of that shape, or a code the rules do not know.
 */
export function entryProblemLine(message: string, code: string | undefined, w: EntryProblemWords): string | undefined {
  const entry = /^entries\.(\w+)\.([^.:\s[]+)(\S*?): (.*)$/.exec(message);
  if (!entry) return undefined;
  const [, kind, id, rest, said] = entry as unknown as [string, string, string, string, string];
  if (code === "orphan") {
    return extensionLine(w.extension, { text: `There are values for ${article(w.kindWord(kind))} ${w.kindWord(kind)} that isn't in the project any more.`, next: "They're kept, but your game won't get them." });
  }
  if (code === "unresolved") return extensionLine(w.extension, { text: "A merge left a clash in this data that hasn't been resolved.", next: "Resolve it before you publish." });
  const field = fieldPhrase(w.fields(kind), rest.replace(/^\./, ""));
  return extensionLine(w.extension, valueProblemSentence(code, said, {
    extension: w.extension, node: w.node(kind, id), field, place: w.place, kindWord: w.kindWord,
  }));
}
