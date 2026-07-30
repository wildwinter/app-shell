// @wildwinter/app-shell - the shared shell for the editor family.
// v0.1: the drop-in grammar layer (tokens.css, imported separately), the
// per-entity colour hash, and the DOM primitive. Chrome + mechanisms follow in
// later slices (see design/shared-shell.md in the consuming apps).

export { el } from "./dom.js";
export type { Child, ElProps } from "./dom.js";
export { colourIndex, colourFor, PALETTE, PALETTE_SIZE } from "./colour.js";
export { mountPaneShell } from "./pane-shell.js";
export type { PaneShell, PaneShellOptions, PaneShellState, PaneSide, PaneSideConfig } from "./pane-shell.js";
export { PANE_MENU } from "./menu.js";
export type { MenuLabel } from "./menu.js";
export { iconBtn, labelled, moveItem, tagChips } from "./dom.js";
export { expandableRow, focusNewRow, dupGuard, mountSettingsDialog } from "./settings.js";
export type { DupGuard, SettingsSection, SettingsSectionHandle, SettingsDialog, SettingsDialogOptions } from "./settings.js";
export { pinButton } from "./tool-window-web.js";
export type { PinButtonOptions } from "./tool-window-web.js";
export { confirmDialog } from "./confirm.js";
export type { ConfirmOptions } from "./confirm.js";
