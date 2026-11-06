// The window prompt's channels and its shape, shared by its halves: prompt-main.ts
// (main asks), prompt.ts (the window draws it on the family's dialog frame), and
// the app's preload, which wires the two with `onPromptRequest`. Kept apart from
// both so main imports no DOM code and the renderer no electron.
//
// It's how a flow running in main (between its file pickers, say) asks the writer
// a question in the app's own chrome, never a system message box. Patterpad had
// it alone; Storyletter's main could only ask in a native box, or hand the
// question back to its renderer and wait to be called again.

/** A question main asks the window to show, answered with the index of the button chosen. Buttons are in
 *  display order, the way out first, as the shell's confirm draws them. */
export interface AppPrompt {
  title: string;
  /** One plain sentence under the title. */
  sub?: string;
  /** Paragraphs of body copy. */
  body?: string[];
  buttons: string[];
  /** The button that wears the accent and takes the focus. */
  defaultId: number;
  /** What Esc and the backdrop answer. */
  cancelId: number;
}

/** The channels between the halves (Patterpad's names, which it had first). */
export const PROMPT_CHANNELS = {
  /** main -> window (send): `(id, prompt)`. */
  ask: "app:prompt",
  /** window -> main (invoke): `(id, index)`. */
  reply: "app:promptReply",
} as const;

/** The two calls of `ipcRenderer` the preload's half uses. */
export interface PromptIpc {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

/** In the preload: hand each of main's prompts to `handler` (the window's `promptDialog`, through the
 *  app's bridge) and send its answer back. A sandboxed preload can import this only when its build bundles
 *  app-shell (electron-vite externalizes dependencies by default); otherwise wire the two channels by name
 *  and pin them to `PROMPT_CHANNELS` in a test. */
export function onPromptRequest(ipc: PromptIpc, handler: (prompt: AppPrompt) => Promise<number>): void {
  ipc.on(PROMPT_CHANNELS.ask, (_e, id, prompt) => {
    void handler(prompt as AppPrompt).then((i) => ipc.invoke(PROMPT_CHANNELS.reply, id, i));
  });
}
