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
export type { PinButtonOptions, PinButton } from "./tool-window-web.js";
export { confirmDialog } from "./confirm.js";
// The exit half of the panel motion vocabulary. Public because an app's own
// surfaces have to close the same way the shell's do, or the two halves of one
// window animate differently (exit.ts).
export { closeWithExit } from "./exit.js";
// Every app has an About, and none of them should be the grey OS panel.
export { showAbout } from "./about.js";
// One floating panel anchored to its subject: Patterpad's, generalised.
export { openAnchoredPanel, closeAnchoredPanel, placeAnchored } from "./anchored.js";
export { gameIdify, isValidGameId } from "./ids.js";
export { propertyNameify, isValidPropertyName, isCaseOnlyPropertyName,
  RESERVED_PROPERTY_NAMES, PROPERTY_NAME_HINT } from "./property-names.js";
export { bindPropertyName, propertyNameProblem, firstIllegalPropertyName } from "./property-name-field.js";
export { openGameIdEditor } from "./id-editor.js";
export type { GameIdEditorOptions } from "./id-editor.js";
export type { AnchoredPanel, AnchoredPanelOptions } from "./anchored.js";
// Version control, the renderer half: badges, the lock notice, and turning a
// held document's controls off. (The main half is @wildwinter/app-shell/vc-status.)
export { foldVc, vcBadgeFor, paintVcBadges, lockControls, lockNotice } from "./vc-view.js";
export type { ShardVc, VcMap } from "./vc-view.js";
// Who is at the keyboard: asked once, skippable, persisted by the app.
export { askIdentity } from "./identity.js";
export type { Identity, IdentityOptions } from "./identity.js";
// Documentation states the reason (notes); comments are the conversation. The
// shell owns both surfaces; the app owns what they are attached to.
export { openNotesEditor } from "./notes-editor.js";
export type { DocLine, Notes, NotesEditorOptions } from "./notes-editor.js";
export { openComments } from "./comments.js";
export type { Comment, CommentMessage, CommentsOptions } from "./comments.js";
export type { AboutOptions } from "./about.js";
export type { ConfirmOptions } from "./confirm.js";
export { mountJobProgress } from "./job-view.js";
export type { JobProgressView, JobProgressOptions } from "./job-view.js";
export { JOB_PROGRESS } from "./job.js";
export type { JobProgress } from "./job.js";
export { initTooltips, tipBold, tipAt, hideTip } from "./tooltip.js";
export type { TooltipOptions, TipRect } from "./tooltip.js";

// The session and the save controller: the shape's own lifecycle (0.14.0).
// `session.ts` is main-process code and has its own entry, like app-store.
export { createSaveController } from "./save.js";
export type { SaveController, SaveControllerOptions, SaveStatus } from "./save.js";
// ...and the six lines that draw what it computes, so the two apps cannot
// disagree about what "saved" looks like (save-view.ts).
export { saveIndicator } from "./save-view.js";
export type { SaveIndicator } from "./save-view.js";
// A running session that has fallen behind its source: both apps had one, in
// nearly the same words (stale.ts).
export { staleBar } from "./stale.js";
export type { StaleBarOptions } from "./stale.js";
// The bottom bar that walks a list of things to attend to: problems, comments,
// whatever the app has a queue of (stepper.ts).
export { renderStepperBar } from "./stepper.js";
export type { StepperBarOptions, StepperItem, StepperTone } from "./stepper.js";
export { EDIT_MENU } from "./menu.js";
