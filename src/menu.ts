// ---------------------------------------------------------------------------
// Shell-owned menu naming: the labels + accelerators for the pane-frame menu
// items, single-sourced so every app in the family names them identically
// (and a rename here flows to all of them). Pure data - no electron, no DOM -
// so a main-process menu builder can import it. Each app builds its own
// MenuItem from these and wires the click to its shell controller.
// ---------------------------------------------------------------------------

import type { RecentProject } from "./app-store.js";

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
  /** Replace is Find's second tab, on the platform's key for it. */
  replace: { label: string; acceleratorMac: string; acceleratorOther: string };
} = {
  undo: { label: "Undo", accelerator: "CmdOrCtrl+Z" },
  redo: { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z" },
  duplicate: { label: "Duplicate", accelerator: "CmdOrCtrl+D" },
  find: { label: "Find…", accelerator: "CmdOrCtrl+F" },
  replace: { label: "Replace…", acceleratorMac: "Cmd+Alt+F", acceleratorOther: "Ctrl+H" },
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

// --- the rest of the spine (ui-review-2026-09, finding 12) -----------------------
// Each app used roughly half of what is above and hand-typed the other half,
// and the copies had already drifted (Review Feedback's accelerator spelled
// two ways; "No Recent Projects" vs "No recent projects"). Labels are Title
// Case, as the platform's menus are; an item that opens something ends in the
// command ellipsis.

/** The File menu items the family shares. */
export const FILE_MENU: {
  newProject: MenuLabel;
  openProject: MenuLabel;
  openRecent: MenuLabel;
  /** The empty Open Recent submenu's one disabled item. */
  noRecents: MenuLabel;
  clearRecents: MenuLabel;
  closeProject: MenuLabel;
  save: MenuLabel;
  saveAs: MenuLabel;
  projectSettings: MenuLabel;
} = {
  newProject: { label: "New Project…", accelerator: "CmdOrCtrl+N" },
  openProject: { label: "Open Project…", accelerator: "CmdOrCtrl+O" },
  openRecent: { label: "Open Recent" },
  noRecents: { label: "No Recent Projects" },
  clearRecents: { label: "Clear Recents" },
  closeProject: { label: "Close Project" },
  save: { label: "Save", accelerator: "CmdOrCtrl+S" },
  saveAs: { label: "Save As…", accelerator: "Shift+CmdOrCtrl+S" },
  projectSettings: { label: "Project Settings…", accelerator: "CmdOrCtrl+," },
};

/**
 * The Play menu's shared items. The play SURFACE is app-NAMED (Patterpad's
 * "Play Scene", Storyletter's "The Board": the two are not the same act), but
 * the family KEYS it the same in both, Cmd+P (ruling O, 2026-10), so `play`
 * carries the accelerator and no label: spread it beside the app's own,
 * `{ label: "Play Scene", ...PLAY_MENU.play }`.
 */
export const PLAY_MENU: {
  play: { accelerator: string };
  liveLink: MenuLabel;
} = {
  play: { accelerator: "CmdOrCtrl+P" },
  liveLink: { label: "Live Link" },
};

/** The Review menu: examining what you have built rather than building or
 *  playing it. Review Feedback's accelerator is spelled ONCE, here. */
export const REVIEW_MENU: {
  reviewFeedback: MenuLabel;
  nextFeedback: MenuLabel;
  previousFeedback: MenuLabel;
  coverageTest: MenuLabel;
  findPropertyUsage: MenuLabel;
  showResolvedComments: MenuLabel;
} = {
  reviewFeedback: { label: "Review Feedback", accelerator: "CmdOrCtrl+Shift+R" },
  nextFeedback: { label: "Next Feedback", accelerator: "F8" },
  previousFeedback: { label: "Previous Feedback", accelerator: "Shift+F8" },
  coverageTest: { label: "Coverage Test…", accelerator: "Shift+CmdOrCtrl+C" },
  findPropertyUsage: { label: "Find Property Usage…" },
  showResolvedComments: { label: "Show Resolved Comments" },
};

/** The Publish menu: everything that turns the project into something you
 *  hand to others ("Publish", never "Export"). */
export const PUBLISH_MENU: {
  playableHtml: MenuLabel;
  bundle: MenuLabel;
  autoRebuild: MenuLabel;
} = {
  playableHtml: { label: "Publish Playable HTML…" },
  bundle: { label: "Publish Bundle", accelerator: "Shift+CmdOrCtrl+B" },
  autoRebuild: { label: "Auto Rebuild" },
};

/** The View menu items beyond the pane toggles (PANE_MENU) and history
 *  (GO_MENU). Cmd+[ is family-reserved for Up a Level, which is why Back
 *  takes Xcode's pair on the mac. */
export const VIEW_MENU: {
  projectOverview: MenuLabel;
  upALevel: MenuLabel;
  colourTheme: MenuLabel;
  commandPalette: MenuLabel;
} = {
  projectOverview: { label: "Project Overview" },
  upALevel: { label: "Up a Level", accelerator: "CmdOrCtrl+[" },
  colourTheme: { label: "Colour Theme" },
  /** Every command by name, and quick open (command-palette.ts). */
  commandPalette: { label: "Command Palette\u2026", accelerator: "CmdOrCtrl+K" },
};

// --- the command palette's view of the menu ---------------------------------
//
// The palette lists the app's own menu, read live, so it can never disagree
// with it (the October 2026 review): no second registry to keep in step. These
// read anything shaped like Electron's Menu, so this file stays electron-free;
// palette-main.ts hands them the real one.

/** The palette's channels. `open` is main -> renderer (the menu item); the
 *  other two are renderer -> main. */
export const PALETTE_CHANNELS = {
  open: "palette:open",
  commands: "palette:commands",
  run: "palette:run",
} as const;

/** What the palette reads of a menu item: Electron's MenuItem fits it. */
export interface MenuItemLike {
  label?: string;
  type?: string;
  role?: string | null;
  accelerator?: string | null;
  enabled?: boolean;
  visible?: boolean;
  submenu?: MenuLike | null;
}
export interface MenuLike { items: MenuItemLike[] }

/** One runnable menu item, as the palette lists it. */
export interface MenuCommand {
  /** The item's path and label, joined: what `findMenuItem` takes back. */
  id: string;
  /** The submenus above it ("File", "Export"). */
  path: string[];
  label: string;
  /** Electron's accelerator, when it has one ("CmdOrCtrl+K"). */
  accelerator?: string;
  enabled: boolean;
}

// The system's own items, which aren't the app's commands: the Services menu,
// Hide and Show All, the window list, the recent-documents list the OS keeps.
const SYSTEM_ROLES = new Set([
  "services", "hide", "hideothers", "unhide", "front", "recentdocuments", "clearrecentdocuments",
  "startspeaking", "stopspeaking",
]);
const ID_SEP = "\u001f";

/** Every runnable item of `menu`, in menu order: separators, hidden items and
 *  the system's own are left out, and the palette's own item too. */
export function flattenMenu(menu: MenuLike | null | undefined, path: string[] = []): MenuCommand[] {
  const out: MenuCommand[] = [];
  for (const item of menu?.items ?? []) {
    if (item.type === "separator" || item.visible === false) continue;
    if (item.role && SYSTEM_ROLES.has(item.role.toLowerCase())) continue;
    const label = (item.label ?? "").trim();
    if (item.submenu) {
      if (label && item.role?.toLowerCase() !== "windowmenu") out.push(...flattenMenu(item.submenu, [...path, label]));
      continue;
    }
    if (!label || label === VIEW_MENU.commandPalette.label) continue;
    out.push({
      id: [...path, label].join(ID_SEP), path, label,
      ...(item.accelerator ? { accelerator: item.accelerator } : {}),
      enabled: item.enabled !== false,
    });
  }
  return out;
}

/** The item a palette `id` names, or undefined when the menu has changed
 *  under it. */
export function findMenuItem<T extends MenuItemLike>(menu: { items: T[] } | null | undefined, id: string): T | undefined {
  const parts = id.split(ID_SEP);
  let items: MenuItemLike[] | undefined = menu?.items;
  for (let i = 0; i < parts.length; i++) {
    const hit = items?.find((it) => it.type !== "separator" && (it.label ?? "").trim() === parts[i]);
    if (!hit) return undefined;
    if (i === parts.length - 1) return hit.submenu ? undefined : hit as T;
    items = hit.submenu?.items;
  }
  return undefined;
}

/** A path with the home directory as `~`, so a recents entry stays readable
 *  at menu width. `home` is `app.getPath("home")`; this file stays
 *  electron-free. */
export function tildePath(path: string, home: string): string {
  if (path === home) return "~";
  const sep = home.includes("\\") ? "\\" : "/";
  return path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

/** As much of Electron's MenuItemConstructorOptions as a recents entry needs;
 *  structurally assignable to it. */
export interface RecentsMenuItem {
  label?: string;
  sublabel?: string;
  toolTip?: string;
  enabled?: boolean;
  type?: "separator";
  click?: () => void;
}

export interface RecentsSubmenuOptions {
  onOpen: (path: string) => void;
  /** Offered after a separator when there is anything to clear. */
  onClear?: () => void;
  /** `app.getPath("home")`, for the `~` abbreviation. */
  home: string;
  /** Defaults to process.platform; a seam for the tests. */
  platform?: string;
}

/**
 * The Open Recent submenu: the fifteen lines both apps had.
 *
 * Shows WHERE each recent lives. macOS renders `sublabel` as a dimmed second
 * line and `toolTip` on hover; native menus elsewhere render neither, so
 * there the path is folded into the label itself. Empty, it is the one
 * disabled "No Recent Projects" item.
 */
export function recentsSubmenu(recents: RecentProject[], opts: RecentsSubmenuOptions): RecentsMenuItem[] {
  const isMac = (opts.platform ?? process.platform) === "darwin";
  if (recents.length === 0) return [{ label: FILE_MENU.noRecents.label, enabled: false }];
  const items: RecentsMenuItem[] = recents.map((r) => {
    const shown = tildePath(r.path, opts.home);
    const name = r.name ?? r.path.split(/[\\/]/).filter(Boolean).pop() ?? r.path;
    return {
      label: isMac ? name : `${name}  (${shown})`,
      sublabel: shown,
      toolTip: r.path,
      click: () => opts.onOpen(r.path),
    };
  });
  if (opts.onClear) items.push({ type: "separator" }, { label: FILE_MENU.clearRecents.label, click: opts.onClear });
  return items;
}
