// @wildwinter/app-shell - the shared shell for the editor family.
// v0.1: the drop-in grammar layer (tokens.css, imported separately), the
// per-entity colour hash, and the DOM primitive. Chrome + mechanisms follow in
// later slices (see design/shared-shell.md in the consuming apps).

export { el } from "./dom.js";
export type { Child, ElProps } from "./dom.js";
export { colourIndex, colourFor, hashColour, isColourSlot, PALETTE, PALETTE_SIZE } from "./colour.js";
// The family's icon vocabulary: an icon is a word, and two apps must spell it
// the same way (icons.ts). Drawn (Lucide, vendored) since 0.39: `iconNode` is
// the way to draw one; `icon` is the deprecated glyph table.
export { icon, iconSvg, iconNode, iconHtml, iconNameOfGlyph, isIconName, ICON_NAMES, ICON_SIZE } from "./icons.js";
export type { IconName, IconSvgName } from "./icons.js";
export { mountPaneShell } from "./pane-shell.js";
export type { PaneShell, PaneShellOptions, PaneShellState, PaneSide, PaneSideConfig } from "./pane-shell.js";
export { PANE_MENU } from "./menu.js";
export type { MenuLabel, MenuCommand } from "./menu.js";
export { PALETTE_CHANNELS } from "./menu.js";
export { iconBtn, labelled, labelledToggle, moveItem, tagChips, stageChips, wireReorder } from "./dom.js";
export type { StageChipsOptions, ReorderOptions } from "./dom.js";
export type { FieldHint, LabelledToggleOptions } from "./dom.js";
// Separators are drawn: a metadata line and a breadcrumb as DOM, never a "·"
// or "›" in a string (dom.ts, controls.css).
export { metaLine, breadcrumb } from "./dom.js";
// The tree pattern's keys for a navigator drawn as a tree (tree-keys.ts).
export { rove, treeKey, treeRows, wireTreeKeys } from "./tree-keys.js";
export type { Crumb } from "./dom.js";
// Keyboard hints from one helper, "⌘" on a Mac and "Ctrl" elsewhere (keys.ts +
// keys.css). Also its own entry, @wildwinter/app-shell/keys.
export { keyLabel, keyLegends, keyHint, hintBar, tipWithKey, isKeyCombo, keyPlatform, setKeyPlatform } from "./keys.js";
export type { KeyPlatform, KeyHintOptions, HintBarItem } from "./keys.js";
// Problem copy through a table the app fills (problems.ts). Also its own
// entry, @wildwinter/app-shell/problems.
export { describeProblem, problemLine, problemName, defaultProblemCopy } from "./problems.js";
export type { ProblemLike, ProblemCopy, ProblemCopyEntry, ProblemCopyTable } from "./problems.js";
export { expandableRow, focusNewRow, revealRow, revealRowWhenReady, dupGuard, mountSettingsDialog } from "./settings.js";
export type { DupGuard, SettingsSection, SettingsSectionHandle, SettingsDialog, SettingsDialogOptions } from "./settings.js";
export { pinButton, toolWindowHead, followButton, selectionFollowButton } from "./tool-window-web.js";
export type { PinButtonOptions, PinButton, ToolWindowHeadOptions, FollowButtonOptions, FollowButton } from "./tool-window-web.js";
export { confirmDialog } from "./confirm.js";
// The one modal skeleton (title, sub, body, actions, scrim, motion, focus
// return) every dialog in the family sits on, the shell's own included.
export { dialogFrame, setDialogFocusFallback } from "./dialog.js";
export type { DialogFrame, DialogFrameOptions, ReturnFocus } from "./dialog.js";
// Where keyboard focus can go (for a pane's focusTarget, a dialog's returnFocus).
export { canTakeFocus, firstFocusable } from "./focus.js";
// The floating-layer lifecycle popups and menus share (floating.ts), and the
// right-click menu + anchored popover built on the same idea (context-menu.ts).
export { createFloating } from "./floating.js";
export type { Floating, FloatingOptions } from "./floating.js";
export { openContextMenu, openPopover } from "./context-menu.js";
export type { ContextItem, PopoverOptions } from "./context-menu.js";
// The exit half of the panel motion vocabulary. Public because an app's own
// surfaces have to close the same way the shell's do, or the two halves of one
// window animate differently (exit.ts).
export { closeWithExit } from "./exit.js";
// The family's colour themes (palette.css) as data: ids, menu labels, and the
// migration from each app's retired palettes. Also its own entry, ./theme.
export { THEME_CHOICES, DEFAULT_THEME, isThemeChoice, migrateTheme, themeAttribute } from "./theme.js";
export type { ThemeId, ThemeChoice } from "./theme.js";
// Every app has an About, and none of them should be the grey OS panel.
export { showAbout } from "./about.js";
// One floating panel anchored to its subject: Patterpad's, generalised.
export { openAnchoredPanel, closeAnchoredPanel, placeAnchored } from "./anchored.js";
export { gameIdify, isValidGameId } from "./ids.js";
export { propertyNameify, isValidPropertyName, isCaseOnlyPropertyName,
  RESERVED_PROPERTY_NAMES, PROPERTY_NAME_HINT } from "./property-names.js";
export { bindPropertyName, propertyNameProblem, firstIllegalPropertyName } from "./property-name-field.js";
export { bindPropertyRef, propertyRefProblem, revalidatePropertyRefs } from "./property-name-field.js";
export type { PropertyRefOptions } from "./property-name-field.js";
export { openGameIdEditor } from "./id-editor.js";
export type { GameIdEditorOptions } from "./id-editor.js";
export type { AnchoredPanel, AnchoredPanelOptions } from "./anchored.js";
// Version control, the renderer half: badges, the lock notice, and turning a
// held document's controls off. (The main half is @wildwinter/app-shell/vc-status.)
export { foldVc, vcBadgeFor, paintVcBadges, lockControls, lockNotice } from "./vc-view.js";
export type { ShardVc, VcMap, VcBadge } from "./vc-view.js";
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
export type { JobProgressView, JobProgressOptions, JobBeginOptions } from "./job-view.js";
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
export { toast, dismissToast } from "./toast.js";
export type { ToastKind, ToastOptions, ToastAction } from "./toast.js";
export type { StaleBarOptions } from "./stale.js";
// The bottom bar that walks a list of things to attend to: problems, comments,
// whatever the app has a queue of (stepper.ts).
export { renderStepperBar } from "./stepper.js";
export type { StepperBarOptions, StepperItem, StepperTone } from "./stepper.js";
export { EDIT_MENU, GO_MENU, FILE_MENU, PLAY_MENU, REVIEW_MENU, PUBLISH_MENU, VIEW_MENU, PROJECT_MENU, resolveClashesMenuItem } from "./menu.js";
// The updater's view, on the dialog frame: the renderer half the main-process
// updater (./updater) cannot run without (updater-view.ts).
export { showUpdaterDialog, feedUpdaterDownloadProgress, showUpdateReady } from "./updater-view.js";
// The command palette (Cmd+K): the live menu by name, and quick open (command-palette.ts); its
// main-process half is ./palette-main, and the menu readers are in ./menu.
export { openCommandPalette, closeCommandPalette, matchScore, accelToCombo } from "./command-palette.js";
export type { CommandPaletteOptions, PaletteItem } from "./command-palette.js";
// What's New after an update, and Help > What's New (whats-new.ts); its main half is ./whats-new-main, and
// the changelog reader (pure, for release scripts too) is ./changelog.
export { openWhatsNew, whatsNewAfterUpdate, WHATS_NEW_CHANNELS } from "./whats-new.js";
export type { WhatsNewOptions, WhatsNewState } from "./whats-new.js";
export { parseChangelog, versionsSince, latestVersions, compareVersions, entriesWithoutLead } from "./changelog.js";
export type { ChangelogVersion, ChangelogLead, ChangelogEntry } from "./changelog.js";
export type { UpdaterViewOptions, UpdaterLink, UpdateReadyOptions } from "./updater-view.js";
export type { UpdaterDownloadProgress, UpdaterPromptOptions, UpdaterReadyInfo } from "./updater.js";
// No project open: the welcome (welcome.ts + welcome.css).
export { mountWelcome } from "./welcome.js";
export type { Welcome, WelcomeOptions, WelcomeAction, WelcomeRecent, WelcomeGroup, WelcomeGroupItem } from "./welcome.js";
// The new-thing moment: pick a starting point by what you want to make (kit-gallery.ts + .css).
export { openKitGallery, kitTile } from "./kit-gallery.js";
export type { KitGallery, KitGalleryOptions, KitGallerySection, KitGalleryItem, KitGalleryChoice } from "./kit-gallery.js";
// The live-link chip (link-status.ts + link-status.css).
export { mountLinkStatus, linkStatusClass, linkStatusTip, linkAddress } from "./link-status.js";
export type { LinkStatus, LinkStatusClass, LinkStatusOptions, LinkStatusChip } from "./link-status.js";
// The property declaration list (property-list.ts), on the settings row kit.
export { mountPropertyList, defaultControl, PROPERTY_TYPES } from "./property-list.js";
export type { PropertyDeclLike, PropertyListType, PropertyListOptions, PropertyListHandle, DefaultControlOptions } from "./property-list.js";
// Typed value controls (value-control.ts): the quality's rung strip, the words an unset value shows, and the
// field row both apps draw a declared field's value with.
export { rungStrip, defaultLabel, fallbackText, stageGateNote, fieldRow, fieldRows, fieldValueProblem } from "./value-control.js";
export type { RungStripOptions, ValueDeclLike, FieldDeclLike, FieldValue, FieldRowOptions, FieldRowHandle, FieldRows } from "./value-control.js";
// The small idioms (util.ts).
export { plural, debounce, isEditableTarget, formatCount, copyWithFeedback, relativeTime, isLocalOrigin } from "./util.js";
export type { Debounced } from "./util.js";
export { createNavHistory, historyNav } from "./nav-history.js";
export type { NavHistory, NavHistoryOptions } from "./nav-history.js";
// Tier 2 view extensions, the editor renderer's half (view-host-web.ts): host a
// view over its port from the app's adapter. Also its own entry,
// @wildwinter/app-shell/view-host-web; the protocol is ./view-protocol.
export { hostView, hostViews, onViewPort, readTheme, VIEW_THEME_TOKENS } from "./view-host-web.js";
export type { HostViewOptions, HostViewsSetup, ViewHosts } from "./view-host-web.js";
export { VIEW_API, VIEW_PORT_CHANNEL, VIEW_PORT_MESSAGE } from "./view-protocol.js";
export type {
  ViewAdapter, ViewHandle, ViewNode, ViewSelection, ViewMediaLength, ViewTheme, ViewWritable, ViewEdit, ViewRefusal,
  ViewPortMeta, ViewHostName, ViewJson,
} from "./view-protocol.js";
// The Extensions window's panel (extensions-panel.ts; style: extensions-window.css): the rows main builds with
// `extensionRows` (./view-host), and what each button asks for.
export { extensionsPanel } from "./extensions-panel.js";
export type { ExtensionRow, ExtensionsPanel, ExtensionsPanelState, ExtensionsPanelActions } from "./extensions-panel.js";
// The clash resolver: what a merge couldn't settle, listed from the app's adapter and decided one undoable
// step at a time through the app's writer; and the banner that says the project has some (clashes.ts;
// style: clashes.css).
export { openClashResolver, clashBanner, clashKindLabel, clashCountText } from "./clashes.js";
export type { Clash, ClashSide, ClashAdapter, ClashesAfter, ClashResolver, ClashResolverOptions, ClashBanner, ClashBannerOptions } from "./clashes.js";
