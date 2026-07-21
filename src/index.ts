// @wildwinter/app-shell - the shared shell for the editor family.
// v0.1: the drop-in grammar layer (tokens.css, imported separately), the
// per-entity colour hash, and the DOM primitive. Chrome + mechanisms follow in
// later slices (see design/shared-shell.md in the consuming apps).

export { el } from "./dom.js";
export type { Child, ElProps } from "./dom.js";
export { colourIndex, colourFor, PALETTE, PALETTE_SIZE } from "./colour.js";
export { mountPaneShell } from "./pane-shell.js";
export type { PaneShell, PaneShellOptions, PaneShellState, PaneSide, PaneSideConfig } from "./pane-shell.js";
