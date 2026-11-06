// ---------------------------------------------------------------------------
// The window prompt's main-process half: ask the app's window a question on the
// family's dialog frame (prompt.ts draws it), and wait for the answer. With no
// window to ask, or no answer in five minutes, the answer is `cancelId`.
// ---------------------------------------------------------------------------

import { ipcMain, type BrowserWindow } from "electron";
import { PROMPT_CHANNELS, type AppPrompt } from "./prompt-channels.js";

export { PROMPT_CHANNELS, type AppPrompt } from "./prompt-channels.js";

export interface WindowPromptOptions {
  /** The window to ask in: the app's main window, as it is now. */
  window: () => BrowserWindow | null | undefined;
  /** How long to wait for an answer before taking `cancelId` (ms). */
  timeoutMs?: number;
}

export interface WindowPrompt {
  /** Ask, and resolve with the index of the button chosen. */
  ask(prompt: AppPrompt): Promise<number>;
  /** A notice: one button, "OK". */
  tell(title: string, sub: string, body?: string[]): Promise<number>;
}

/** Make the app's prompt and answer its window's replies. Call once, at startup; the preload's half is
 *  `onPromptRequest`, and the window's is `promptDialog`. */
export function createWindowPrompt(opts: WindowPromptOptions): WindowPrompt {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  let seq = 0;
  const waiters = new Map<number, (i: unknown) => void>();
  ipcMain.removeHandler(PROMPT_CHANNELS.reply);
  ipcMain.handle(PROMPT_CHANNELS.reply, (_e, id: unknown, i: unknown) => { if (typeof id === "number") waiters.get(id)?.(i); });
  const ask = (prompt: AppPrompt): Promise<number> => new Promise((resolve) => {
    const w = opts.window();
    if (!w || w.isDestroyed() || w.webContents.isDestroyed()) { resolve(prompt.cancelId); return; }
    const id = ++seq;
    const timer = setTimeout(() => { waiters.delete(id); resolve(prompt.cancelId); }, timeoutMs);
    waiters.set(id, (i) => {
      clearTimeout(timer); waiters.delete(id);
      resolve(typeof i === "number" && Number.isInteger(i) && i >= 0 && i < prompt.buttons.length ? i : prompt.cancelId);
    });
    w.webContents.send(PROMPT_CHANNELS.ask, id, prompt);
  });
  return {
    ask,
    tell: (title, sub, body) => ask({ title, sub, ...(body ? { body } : {}), buttons: ["OK"], defaultId: 0, cancelId: 0 }),
  };
}
