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
