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
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

export interface Identity { name: string; email?: string }

export interface IdentityOptions {
  /** What it already says, if anything. */
  current?: Identity;
  /** A name to offer when there is none: the VCS's, one day. */
  suggested?: Identity;
}


/** Ask, and record the answer. Resolves when the dialog closes, either way. */
export function askIdentity(opts: IdentityOptions = {}): Promise<Identity | undefined> {
  return new Promise<Identity | undefined>((resolve) => {
    const seed = opts.current ?? opts.suggested;
    const name = el("input", "shell-ident-input") as HTMLInputElement;
    name.placeholder = "Your name";
    name.value = seed?.name ?? "";
    const email = el("input", "shell-ident-input") as HTMLInputElement;
    email.placeholder = "Email (optional)";
    email.type = "email";
    email.value = seed?.email ?? "";

    const skip = el("button", "shell-ident-btn", "Skip");
    const save = el("button", "shell-ident-btn primary", "Save");
    skip.type = "button"; save.type = "button";

    const dialog = el("dialog", "shell-ident",
      el("div", "shell-ident-title", "Who is working here?"),
      el("p", "shell-ident-hint",
        "Stamped on the comments you write. Kept in this app, never in the project, and changeable later."),
      el("div", "shell-ident-fields", name, email),
      el("div", "shell-ident-actions", skip, save),
    );
    document.body.append(dialog);

    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      const typed = name.value.trim();
      const value = email.value.trim();
      const answer: Identity | undefined = keep && typed !== ""
        ? (value === "" ? { name: typed } : { name: typed, email: value })
        : undefined;
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    skip.addEventListener("click", () => finish(false));
    save.addEventListener("click", () => finish(true));
    // Enter saves, Escape skips: the two answers the dialog has.
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); });
    email.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(true); });
    dialog.addEventListener("close", () => finish(false));

    dialog.showModal();
    name.focus();
  });
}
