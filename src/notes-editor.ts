// ---------------------------------------------------------------------------
// The documentation-notes editor: Patterpad's, as the family's (Patter spec 18).
//
// Documentation states the reason; comments are the conversation. A note says
// why a card is here, who it is for, what a translator needs to know. It has no
// author, no timestamp, and nobody replies to it.
//
// A MODAL, and that is a decision somebody already paid for: Patterpad tried an
// anchored popover first and removed it as too cramped. Notes are prose, and
// prose needs room.
//
// One text area PER CLASS, each non-blank line becoming a note of that class.
// The alternative - a list of lines each with its own class dropdown - is more
// granular and, as their proposal puts it, fiddlier: you would fill in a form to
// write a sentence.
//
// THE SEAM: this knows nothing about what a note is attached to. The app hands
// it the notes that apply, the ancestors they came from and the classes on
// offer, and takes back a list. Whether the levels are box -> deck -> card or
// scene -> block -> line never reaches here.
//
// Showing INHERITED notes read-only is Storyletter's addition, and it belongs in
// the family: Patterpad deferred it because its stacked inspector already shows
// each ancestor's Notes row, but an app whose editor has no such stack must show
// them somewhere or an author will write the box's note again on the card.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

/** One line of documentation. `type` names its class; absent = editor-only. */
export interface DocLine { type?: string; text: string }

/** What applies to one thing: its own notes, and the ancestors' that reach it.
 *  Inherited notes are READ-ONLY - they are edited where they live, which is
 *  what stops a note being copied down and then disagreeing with itself. */
export interface Notes {
  own: DocLine[];
  inherited: { id: string; label: string; lines: DocLine[] }[];
  /** The classes this app offers, in the order they should appear. */
  classes: string[];
}

const EDITOR_ONLY = "";
const UNTYPED_KEY = "__untyped";

/** The classes the family already has words for; anything else is Title Cased,
 *  so a studio can add one without touching this. Patterpad's labels. */
const CLASS_LABEL: Record<string, string> = {
  everyone: "Everyone", writing: "Writing", vo: "Voice (VO)", loc: "Localisers",
};
const label = (cls: string): string =>
  cls === EDITOR_ONLY ? "Note (editor-only)"
    : CLASS_LABEL[cls] ?? (cls[0]!.toUpperCase() + cls.slice(1));

const PLACEHOLDER: Record<string, string> = {
  vo: "direction for the voice actor / director",
  loc: "context for translators",
};
const placeholder = (cls: string): string =>
  cls === EDITOR_ONLY ? "an internal note - never exported"
    : PLACEHOLDER[cls] ?? "intent / rationale - why this is here";

export interface NotesEditorOptions {
  /** What this is about, for the dialog's title ("Notes: Arrive at the gate"). */
  subject: string;
  notes: Notes;
  /** Commit. Called once, on close, and only when something changed. */
  save: (lines: DocLine[]) => void;
}

/** Open the notes modal. Resolves when it closes. */
export function openNotesEditor(opts: NotesEditorOptions): void {
  const { notes } = opts;

  // Seed one text area per class that already has notes; a fresh thing gets the
  // first class in the vocabulary, so the commonest act (write a note) is typing
  // rather than choosing.
  const seed = new Map<string, string>();
  for (const line of notes.own) {
    const key = line.type ?? EDITOR_ONLY;
    seed.set(key, seed.has(key) ? `${seed.get(key)!}\n${line.text}` : line.text);
  }
  const shown: string[] = [...seed.keys()];
  if (shown.length === 0) shown.push(notes.classes[0] ?? EDITOR_ONLY);
  const areas = new Map<string, HTMLTextAreaElement>();

  const value = (): DocLine[] => {
    const out: DocLine[] = [];
    for (const cls of shown) {
      const area = areas.get(cls);
      if (!area) continue;
      for (const raw of area.value.split("\n")) {
        const text = raw.trim();
        if (text !== "") out.push(cls === EDITOR_ONLY ? { text } : { type: cls, text });
      }
    }
    return out;
  };

  const body = el("div", "shell-notes-body");

  const render = (): void => {
    body.replaceChildren();

    // The inherited context first, because it is what an author needs BEFORE
    // deciding whether to write anything: outermost first, muted, and labelled
    // with where it lives so the answer to "why can I not edit this" is on
    // screen.
    if (notes.inherited.length > 0) {
      const from = el("div", { className: "shell-notes-inherited" },
        el("div", "shell-notes-caption", "Inherited"));
      for (const level of notes.inherited) {
        from.append(el("div", { className: "shell-notes-level" },
          el("span", "shell-notes-level-label", level.label),
          ...level.lines.map((line) => el("div", { className: "shell-notes-line" },
            ...(line.type !== undefined && line.type !== "everyone"
              ? [el("span", "shell-notes-cls", label(line.type))] : []),
            el("span", "", line.text))),
        ));
      }
      body.append(from);
    }

    for (const cls of shown) {
      const block = el("div", { className: "shell-notes-class" },
        el("label", "shell-notes-caption", label(cls)));
      const area = el("textarea", "shell-notes-text");
      area.value = areas.get(cls)?.value ?? seed.get(cls) ?? "";
      area.rows = 4;
      area.placeholder = placeholder(cls);
      area.spellcheck = true;
      areas.set(cls, area);
      block.append(area);
      body.append(block);
    }

    // One line per note, said once where somebody is about to type.
    body.append(el("p", "shell-notes-hint", "One note per line."));

    const remaining = [...notes.classes, EDITOR_ONLY].filter((c) => !shown.includes(c));
    if (remaining.length > 0) {
      const add = el("select", "shell-notes-add");
      add.append(new Option("Add a note for…", ""));
      for (const cls of remaining) add.append(new Option(label(cls), cls === EDITOR_ONLY ? UNTYPED_KEY : cls));
      add.addEventListener("change", () => {
        if (add.value === "") return;
        const cls = add.value === UNTYPED_KEY ? EDITOR_ONLY : add.value;
        shown.push(cls);
        render();
        areas.get(cls)?.focus();
      });
      body.append(add);
    }
  };
  render();

  const done = el("button", "shell-notes-btn primary", "Done");
  const dialog = el("dialog", { className: "shell-notes" },
    el("div", { className: "shell-notes-title", text: `Notes: ${opts.subject}` }),
    body,
    el("div", { className: "shell-notes-actions" }, done),
  );
  dialog.setAttribute("aria-label", `Notes: ${opts.subject}`);
  document.body.append(dialog);

  const before = JSON.stringify(notes.own);
  // Done and Escape both end up here (dialog.close() fires the close event), so
  // the guard is what stops one gesture saving twice.
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    const next = value();
    // Only when something changed: opening a note to read it must not cost an
    // undo step, and must not touch the file (or the version control status).
    if (JSON.stringify(next) !== before) opts.save(next);
    dialog.close();
    dialog.remove();
  };
  done.addEventListener("click", close);
  // Escape closes a <dialog> by itself, and commits: this editor has no Cancel,
  // because a note is prose and losing a paragraph to a stray key is worse than
  // an unwanted note somebody can delete.
  dialog.addEventListener("close", close);

  dialog.showModal();
  areas.get(shown[0] ?? EDITOR_ONLY)?.focus();
}
