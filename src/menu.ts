// ---------------------------------------------------------------------------
// Shell-owned menu naming: the labels + accelerators for the pane-frame menu
// items, single-sourced so every app in the family names them identically
// (and a rename here flows to all of them). Pure data - no electron, no DOM -
// so a main-process menu builder can import it. Each app builds its own
// MenuItem from these and wires the click to its shell controller.
// ---------------------------------------------------------------------------

export interface MenuLabel {
  label: string;
  /** Electron accelerator string, when the item has one. */
  accelerator?: string;
}

/**
 * The Edit menu items the family shares.
 *
 * Undo and Redo are here and the MECHANISM is not, which is the whole finding
 * about undo: Patterpad's is ProseMirror's document history, Storyletter's is a
 * replay of file bytes, and those have nothing in common but this. See
 * `design/shared-shell.md`.
 *
 * The rule both apps discovered separately, and the reason these are spelled
 * out rather than left as Electron's `role: "undo"`: the native role runs a DOM
 * text-field undo, which knows nothing about either app's model and will
 * silently undo the wrong thing.
 */
export const EDIT_MENU: {
  undo: MenuLabel;
  redo: MenuLabel;
  duplicate: MenuLabel;
  find: MenuLabel;
} = {
  undo: { label: "Undo", accelerator: "CmdOrCtrl+Z" },
  redo: { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z" },
  duplicate: { label: "Duplicate", accelerator: "CmdOrCtrl+D" },
  find: { label: "Find…", accelerator: "CmdOrCtrl+F" },
};

/** The pane-frame menu items (a View menu, conventionally). */
export const PANE_MENU: {
  showNav: MenuLabel;
  showInspector: MenuLabel;
  resetView: MenuLabel;
} = {
  showNav: { label: "Show Navigator", accelerator: "CmdOrCtrl+1" },
  showInspector: { label: "Show Inspector", accelerator: "CmdOrCtrl+2" },
  resetView: { label: "Reset View" },
};
