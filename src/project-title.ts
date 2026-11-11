// ---------------------------------------------------------------------------
// The project's name in the top bar: one button, the same in every app.
//
// Each app used to draw its own. Storyletter's was a button with a rollover and
// a click to the overview; Patterpad's was a `<strong>` with the same rollover
// and click added in script, and since it wasn't a button it sat inside the
// title bar's window-drag region, where Electron sends the page no hover and no
// click. Both were dead in the app and alive in the browser preview (2026-11-11).
// One component ends the drift: it is a button, so the drag region leaves it
// alone (`.topbar.titlebar :is(button, ...)` in pane-shell.css).
//
// What it shows: the project's name in the title ink, and, where the app has
// one, a quieter note beside it (Storyletter's server status). Where the app
// says where the project lives and what a click does, the rollover reads
// "The project overview" and the path beneath it, and a click goes there.
// With no path (a welcome screen, before any project is open) it is only a
// name: no rollover, no click, no hover colour.
// ---------------------------------------------------------------------------

export interface ProjectTitleOptions {
  /** The project's name, or the app's own while no project is open. */
  name: string;
  /** Where the project lives on disk. Absent: there is no project, so the
   *  title is just a name, with no rollover and no click. */
  path?: string;
  /** A quieter note beside the name, a fact about the project (Storyletter's
   *  "3 edits to send"). Absent or empty: none. */
  note?: string;
  /** What a click does: the app's way to its project overview. Called only
   *  while there is a path. */
  onOpen?: () => void;
}

export interface ProjectTitle {
  /** The button; seat it in the pane shell's `topbarLead`. */
  readonly el: HTMLButtonElement;
  /** Show another name, path, or note (each call says all three; what it
   *  leaves out is cleared). The click handler stays as mounted unless given. */
  update(opts: ProjectTitleOptions): void;
}

/** The rollover for a project title that leads to the overview. */
export const projectTitleTip = (path: string): string => `The project overview\n${path}`;

export function projectTitle(opts: ProjectTitleOptions): ProjectTitle {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "shell-project-title shell-topbar-title";
  let onOpen = opts.onOpen;
  let live = false;
  button.addEventListener("click", () => { if (live) onOpen?.(); });

  const update = (o: ProjectTitleOptions): void => {
    if (o.onOpen) onOpen = o.onOpen;
    const name = document.createTextNode(o.name);
    const parts: Node[] = [name];
    if (o.note) {
      const note = document.createElement("span");
      note.className = "shell-project-title-note shell-topbar-sub";
      note.textContent = o.note;
      parts.push(note);
    }
    button.replaceChildren(...parts);
    live = o.path !== undefined && o.path !== "" && onOpen !== undefined;
    button.classList.toggle("is-inert", !live);
    if (live) {
      button.dataset.tip = projectTitleTip(o.path!);
      button.removeAttribute("aria-disabled");
    } else {
      delete button.dataset.tip;
      button.setAttribute("aria-disabled", "true");
    }
  };
  update(opts);
  return { el: button, update };
}
