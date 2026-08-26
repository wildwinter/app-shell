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

/**
 * Back / Forward: navigation HISTORY, the other axis from Up a Level's
 * hierarchy. One string cannot serve both platforms - the mac pair is Xcode's
 * (Cmd+[ is already Up a Level in this family, so the browser pair is taken),
 * and the Alt pair is what every Windows browser and Explorer trained - so the
 * menu builder picks by platform.
 */
export const GO_MENU: {
  back: { label: string; acceleratorMac: string; acceleratorOther: string };
  forward: { label: string; acceleratorMac: string; acceleratorOther: string };
} = {
  back: { label: "Back", acceleratorMac: "Ctrl+Cmd+Left", acceleratorOther: "Alt+Left" },
  forward: { label: "Forward", acceleratorMac: "Ctrl+Cmd+Right", acceleratorOther: "Alt+Right" },
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

/**
 * The Help menu items the family shares, and the one platform rule that goes
 * with them.
 *
 * Lifted from Patterpad, which is the only app that has ever had these: a
 * second app writing its own updater or About is pure waste (`design/
 * shared-shell.md`), and a suite is recognised by finding Check for Updates
 * where you left it. Storyletter will grow both; until it does, these labels
 * are the agreement rather than a description of two implementations.
 *
 * PLACEMENT, which differs by platform and is easy to get wrong:
 * - macOS keeps About in the APP menu (the one named after the product), and
 *   Help carries documentation + Check for Updates only.
 * - Windows and Linux have no app menu, so About goes at the foot of Help,
 *   after a separator. That is the conventional home there.
 */
export const HELP_MENU: {
  checkForUpdates: MenuLabel;
} = {
  checkForUpdates: { label: "Check for Updates\u2026" },
};

/** The app-menu items the family shares (macOS; the identity item also belongs in File elsewhere). */
export const APP_MENU: {
  userInfo: MenuLabel;
} = {
  /** Name + optional email, used to sign edits and comments. One label across the suite. */
  userInfo: { label: "User Information\u2026" },
};

/** What an app must tell the shell to build its named menu items. */
export interface MenuNaming {
  /** The product, as it appears in menus: "Patterpad", "Storyletter". */
  appName: string;
  /** The product's own documentation URL. Omit while an app has no docs yet and
   *  the item is rendered disabled rather than opening a broken link. */
  docsUrl?: string;
  /** The suite's documentation home, shared by every app in the family. */
  suiteDocsUrl?: string;
  /** The suite, as it appears in "<suite> Documentation Home". Defaults to "Patter". */
  suiteName?: string;
}

/** A named menu item: the label, plus the URL it opens (absent = nothing wired yet). */
export interface NamedMenuItem extends MenuLabel {
  url?: string;
  /** False when the app has not supplied a URL, so the builder can render it
   *  disabled instead of opening nothing. A placeholder, honestly labelled. */
  ready: boolean;
}

/**
 * The menu labels that carry a product or suite name, so no app spells its own
 * About or Documentation item differently from the rest of the family.
 *
 * An app with no documentation site yet still gets the ITEM, marked
 * `ready: false`, so the menu has its family shape from day one and wiring the
 * URL later is a one-line change rather than a menu redesign.
 */
export function namedMenuItems(naming: MenuNaming): {
  about: NamedMenuItem;
  docs: NamedMenuItem;
  suiteDocs: NamedMenuItem;
} {
  const suite = naming.suiteName ?? "Patter";
  return {
    about: { label: `About ${naming.appName}`, ready: true },
    docs: {
      label: `${naming.appName} Documentation`,
      ...(naming.docsUrl ? { url: naming.docsUrl } : {}),
      ready: naming.docsUrl !== undefined,
    },
    suiteDocs: {
      label: `${suite} Documentation Home`,
      ...(naming.suiteDocsUrl ? { url: naming.suiteDocsUrl } : {}),
      ready: naming.suiteDocsUrl !== undefined,
    },
  };
}
