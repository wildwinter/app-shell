// ---------------------------------------------------------------------------
// The command palette's main-process half: hand the renderer the live menu,
// and run the item it picks, exactly as clicking it would (a role runs its
// role, a checkbox toggles, an app item gets its own click). The palette's
// list is the menu itself, so the two can never drift apart.
// ---------------------------------------------------------------------------

import { BrowserWindow, ipcMain, Menu } from "electron";
import type { MenuItem, KeyboardEvent } from "electron";
import { PALETTE_CHANNELS, findMenuItem, flattenMenu } from "./menu.js";

/** Answer the palette's two requests. Call once, at startup. */
export function registerCommandPalette(): void {
  ipcMain.removeHandler(PALETTE_CHANNELS.commands);
  ipcMain.handle(PALETTE_CHANNELS.commands, () => flattenMenu(Menu.getApplicationMenu()));
  ipcMain.removeAllListeners(PALETTE_CHANNELS.run);
  ipcMain.on(PALETTE_CHANNELS.run, (e, id: string) => {
    const item = findMenuItem<MenuItem>(Menu.getApplicationMenu(), id);
    if (!item || !item.enabled) return;
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    item.click({ triggeredByAccelerator: false } as KeyboardEvent, win, e.sender);
  });
}

/** The View menu item's click: open the palette in that window. */
export function openCommandPaletteIn(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send(PALETTE_CHANNELS.open);
}
