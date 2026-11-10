// ---------------------------------------------------------------------------
// The Extensions window's panel (patterkit design/extensions-window.md): every
// extension the open project uses or this machine has installed, with Add
// extension… at the top and, on each row, Update…, Remove from project…, Install
// on this machine…, and an Uninstall for each installed version (sentence case:
// in-window buttons, copy-house-style rule 28). Renderer code,
// mounted by each app's window page under the shell's tool-window head; the
// app's main process builds the rows (`extensionRows`, ./view-package) and does
// the work, asking first, so every button here only says what was clicked.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

/** One extension as the window lists it (built in main by `extensionRows`). */
export interface ExtensionRow {
  readonly id: string;
  readonly name: string;
  /** The project uses it. */
  readonly inProject: boolean;
  /** The version the project pins, when it names one. */
  readonly pinned?: string;
  /** Its views in this app, by name, from the project's manifest (or the newest installed one's). */
  readonly views: readonly string[];
  /** Every version installed on this machine, oldest first. */
  readonly installed: readonly string[];
  /** The installed version this project opens (its pin, else the newest of the same major version, else the
   *  newest), when the project uses it and one fits. */
  readonly inUse?: string;
  /** The project uses it and it has views here, but no version is installed on this machine. */
  readonly needsInstall: boolean;
  /** The names of the other extensions the project uses that require this one: it can't be removed first. */
  readonly requiredBy: readonly string[];
}

/** What the window shows. */
export interface ExtensionsPanelState {
  readonly rows: readonly ExtensionRow[];
  /** A project is open: without one, only Uninstall is offered. */
  readonly hasProject: boolean;
  /** The app's name, for "No views in Patterpad". */
  readonly app: string;
  /** An extension to bring into view and mark (the Window menu's "(not installed)…"). */
  readonly focus?: string;
}

/** What a click asks for. The app asks the writer first where it needs to. */
export interface ExtensionsPanelActions {
  add(): void;
  install(id: string): void;
  remove(id: string): void;
  uninstall(id: string, version: string): void;
  /** Update…: the app asks for the package, says what will happen, and does it. */
  update(id: string): void;
}

export interface ExtensionsPanel {
  readonly el: HTMLElement;
  render(state: ExtensionsPanelState): void;
}

const list = (names: readonly string[]): string =>
  names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const button = (label: string, className: string, onClick: () => void, disabled = false): HTMLButtonElement => {
  const b = el("button", { className, text: label, onClick: () => onClick() });
  b.type = "button";
  b.disabled = disabled;
  return b;
};

/** The row for one extension. */
function rowOf(r: ExtensionRow, state: ExtensionsPanelState, act: ExtensionsPanelActions): HTMLElement {
  const where = r.inProject ? `In this project${r.pinned ? `, version ${r.pinned}` : ""}` : "Not in this project";
  const head = el("div", "ext-row-head",
    el("h2", "ext-name", r.name),
    el("span", "ext-where", where),
    el("span", "ext-spacer"),
    // Update…: for one the project uses (with a project open) or one installed here, from its package.
    (r.inProject && state.hasProject) || r.installed.length > 0 ? button("Update…", "btn", () => act.update(r.id)) : null,
    r.inProject && state.hasProject
      ? button("Remove from project…", "btn", () => act.remove(r.id), r.requiredBy.length > 0)
      : null,
  );
  const views = el("p", "ext-views",
    r.views.length > 0 ? `${r.views.length === 1 ? "View" : "Views"}: ${list(r.views)}` : `No views in ${state.app}.`);
  const parts: HTMLElement[] = [head, views];
  if (r.requiredBy.length > 0) {
    parts.push(el("p", "ext-note", `${list(r.requiredBy)} ${r.requiredBy.length === 1 ? "needs" : "need"} it, so it can't be removed first.`));
  }
  if (r.installed.length > 0) {
    // What's installed is the extension's views, one copy per version, so projects on different versions each
    // open their own. With a project open, each copy says whether this project uses it.
    const tell = r.inProject && state.hasProject;
    const items = r.installed.map((v) => el("li", "ext-version",
      el("span", "ext-version-name", v),
      tell ? el("span", v === r.inUse ? "ext-version-use ext-in-use" : "ext-version-use", v === r.inUse ? "used by this project" : "not used by this project") : null,
      button(`Uninstall ${v}…`, "btn", () => act.uninstall(r.id, v)),
    ));
    const label = r.views.length > 0 ? `${r.views.length === 1 ? "View" : "Views"} installed on this machine` : "Installed on this machine";
    parts.push(el("div", "ext-installed", el("span", "ext-label", label), el("ul", "ext-versions", ...items)));
    if (r.installed.length > 1) {
      parts.push(el("p", "ext-views", "Each version stays installed until you uninstall it, so projects that use different versions each open their own."));
    }
  } else if (r.views.length > 0) {
    parts.push(el("div", "ext-installed",
      el("span", "ext-label", "Not installed on this machine"),
      r.needsInstall && state.hasProject ? button("Install on this machine…", "btn", () => act.install(r.id)) : null,
    ));
  }
  const row = el("section", "ext-row", ...parts);
  row.dataset["extension"] = r.id;
  if (state.focus === r.id) row.classList.add("ext-focus");
  return row;
}

/** The panel: Add Extension… and a row per extension. `render` redraws it from a state main sends. */
export function extensionsPanel(act: ExtensionsPanelActions): ExtensionsPanel {
  const root = el("div", "ext-panel");
  const render = (state: ExtensionsPanelState): void => {
    const top = el("div", "ext-top",
      el("p", "ext-intro", state.hasProject
        ? "The extensions this project uses, and the ones installed on this machine."
        : "The extensions installed on this machine. Open a project to add or remove extensions."),
      button("Add extension…", "btn primary", () => act.add(), !state.hasProject),
    );
    const rows = state.rows.map((r) => rowOf(r, state, act));
    const body = rows.length > 0 ? rows : [el("p", "ext-empty", state.hasProject
      ? "This project uses no extensions, and none are installed on this machine."
      : "No extensions are installed on this machine.")];
    root.replaceChildren(top, ...body);
    const focused = root.querySelector<HTMLElement>(".ext-focus");
    focused?.scrollIntoView?.({ block: "nearest" });
  };
  return { el: root, render };
}
