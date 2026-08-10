// @wildwinter/app-shell - the shared shell for the editor family.
// v0.1: the drop-in grammar layer (tokens.css, imported separately), the
// per-entity colour hash, and the DOM primitive. Chrome + mechanisms follow in
// later slices (see design/shared-shell.md in the consuming apps).

export { el } from "./dom.js";
export type { Child, ElProps } from "./dom.js";
export { colourIndex, colourFor, PALETTE, PALETTE_SIZE } from "./colour.js";
// The family's icon vocabulary: an icon is a word, and two apps must spell it
// the same way (icons.ts).
export { icon, iconSvg } from "./icons.js";
export type { IconName, IconSvgName } from "./icons.js";
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
// Every app has an About, and none of them should be the grey OS panel.
export { showAbout } from "./about.js";
// One floating panel anchored to its subject: Patterpad's, generalised.
export { openAnchoredPanel, closeAnchoredPanel, placeAnchored } from "./anchored.js";
export type { AnchoredPanel, AnchoredPanelOptions } from "./anchored.js";
export type { AboutOptions } from "./about.js";
export type { ConfirmOptions } from "./confirm.js";
export { mountJobProgress } from "./job-view.js";
export type { JobProgressView, JobProgressOptions } from "./job-view.js";
export { JOB_PROGRESS } from "./job.js";
export type { JobProgress } from "./job.js";
export { initTooltips, tipBold, tipAt, hideTip } from "./tooltip.js";
export type { TooltipOptions, TipRect } from "./tooltip.js";
