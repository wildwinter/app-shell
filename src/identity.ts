// ---------------------------------------------------------------------------
// "Who is working here?" - Patterpad's first-run identity, as the family's.
//
// `{ name, email? }`, asked ONCE at first startup and skippable, editable later
// from User Information… in the menu. It belongs to the person at the keyboard,
// never to the project, which is why the app stores it in ITS OWN state and not
// in a shard: a project carrying a name would hand it to whoever opened the file
// next.
//
// The shell asks and returns; PERSISTING is the app's, because each app has its
// own state file. `suggested` is there for the day simple-vc-lib can say who the
// version control thinks you are (see patterkit from-storylets/vc-current-user),
// so the box opens with a sensible answer rather than empty.
//
// Two occasions, one dialog (ui-review-2026-09, Patterpad adoption step 5): the
// first run is a welcome, the menu item is an edit, and the title and the
// primary button say which. Without a `mode` it is the plain ask it always was.
// ---------------------------------------------------------------------------

import { el, labelled } from "./dom.js";
import { dialogFrame } from "./dialog.js";

export interface Identity { name: string; email?: string }

export interface IdentityOptions {
  /** What it already says, if anything. */
  current?: Identity;
  /** A name to offer when there is none: the VCS's, one day. */
  suggested?: Identity;
  /**
   * `"welcome"` is the first run ("Welcome to <appName>", Continue); `"edit"`
   * is the menu item ("User information", Save). Absent, the title is the
   * shell's "Who is working here?" and the button is Save.
   */
  mode?: "welcome" | "edit";
  /** Names the app in the welcome title. Without it the title is "Welcome". */
  appName?: string;
  /**
   * By default a skip resolves `undefined` and the app asks again next launch.
   * With this on, a skip resolves `{ name: "" }`: the app stores the blank and
   * never asks again (Patterpad's first run, where main fills in a default).
   * A Save with an empty name counts as a skip either way.
   */
  neverAskAgainOnSkip?: boolean;
}

/** Ask, and record the answer. Resolves when the dialog closes, either way. */
export function askIdentity(opts: IdentityOptions = {}): Promise<Identity | undefined> {
  return new Promise<Identity | undefined>((resolve) => {
    const seed = opts.current ?? opts.suggested;
    const name = el("input", "field shell-ident-input") as HTMLInputElement;
    name.placeholder = "Your name";
    name.value = seed?.name ?? "";
    const email = el("input", "field shell-ident-input") as HTMLInputElement;
    email.placeholder = "Optional";
    email.type = "email";
    email.value = seed?.email ?? "";

    const skip = el("button", "btn shell-ident-btn", "Skip");
    const save = el("button", "btn primary shell-ident-btn", opts.mode === "welcome" ? "Continue" : "Save");
    skip.type = "button"; save.type = "button";

    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      const typed = name.value.trim();
      const value = email.value.trim();
      const answer: Identity | undefined = keep && typed !== ""
        ? (value === "" ? { name: typed } : { name: typed, email: value })
        : (opts.neverAskAgainOnSkip === true ? { name: "" } : undefined);
      resolve(answer);
      frame.close();
    };

    // The frame owns the panel, the scrim, Escape and the exit motion; this
    // owns the two fields and the two answers.
    const frame = dialogFrame({
      title: titleFor(opts),
      sub: subFor(opts),
      className: "shell-ident",
      onClose: () => finish(false),   // Escape, or closed by someone else: a skip
    });
    // Captions above the fields, not placeholders alone: a placeholder is gone
    // the moment there is a value in the box, and the VCS's suggestion is one.
    frame.body.append(el("div", "shell-ident-fields", labelled("Name", name), labelled("Email", email)));
    frame.actions.append(skip, save);

    skip.addEventListener("click", () => finish(false));
    save.addEventListener("click", () => finish(true));
    // Enter saves, Escape skips: the two answers the dialog has.
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); });
    email.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); });

    frame.open();
    name.focus();
  });
}

function titleFor(opts: IdentityOptions): string {
  if (opts.mode === "welcome") return opts.appName ? `Welcome to ${opts.appName}` : "Welcome";
  if (opts.mode === "edit") return "User information";
  return "Who is working here?";
}

/** The one sub line, minus its last sentence when this IS the later change. */
function subFor(opts: IdentityOptions): string {
  const why = "Your name goes on the comments you write. It's kept in this app, not in the project.";
  return opts.mode === "edit" ? why : `${why} You can change it later.`;
}
