// The window prompt, its three halves: the dialog (the default takes the accent and the focus, Esc and
// the backdrop answer cancelId), main's ask (a reply resolves it, a nonsense or missing one is cancelId,
// no window is cancelId, a notice is "OK"), and the preload's wiring between them.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...a: unknown[]) => unknown>();
vi.mock("electron", () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => { handlers.set(ch, fn); },
    removeHandler: (ch: string) => { handlers.delete(ch); },
  },
}));

const { promptDialog } = await import("../src/prompt.js");
const { createWindowPrompt } = await import("../src/prompt-main.js");
const { PROMPT_CHANNELS, onPromptRequest } = await import("../src/prompt-channels.js");

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
  }
});
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

const prompt = { title: "Patterpad can't find Storyletter", sub: "Point to it once.", buttons: ["Cancel", "Locate Storyletter…"], defaultId: 1, cancelId: 0 };

describe("promptDialog", () => {
  it("draws the buttons in order, the default primary and focused, and answers with the one clicked", async () => {
    const p = promptDialog(prompt);
    const dlg = document.querySelector("dialog.confirm-dialog") as HTMLDialogElement;
    const buttons = [...dlg.querySelectorAll("button.confirm-btn")] as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(["Cancel", "Locate Storyletter…"]);
    expect(buttons[1]!.classList.contains("primary")).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1]!.click();
    await expect(p).resolves.toBe(1);
  });

  it("answers cancelId on Esc and on the backdrop", async () => {
    const a = promptDialog(prompt);
    (document.querySelector("dialog.confirm-dialog") as HTMLDialogElement).dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(a).resolves.toBe(0);
    document.body.replaceChildren();
    const b = promptDialog(prompt);
    (document.querySelector("dialog.confirm-dialog") as HTMLDialogElement).dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await expect(b).resolves.toBe(0);
  });

  it("draws body paragraphs, and a notice's one button isn't primary", async () => {
    const p = promptDialog({ title: "Done", body: ["One.", "Two."], buttons: ["OK"], defaultId: 0, cancelId: 0 });
    const dlg = document.querySelector("dialog.confirm-dialog") as HTMLDialogElement;
    expect([...dlg.querySelectorAll("p.confirm-body")].map((n) => n.textContent)).toEqual(["One.", "Two."]);
    const ok = dlg.querySelector("button.confirm-btn") as HTMLButtonElement;
    expect(ok.classList.contains("primary")).toBe(false);
    ok.click();
    await expect(p).resolves.toBe(0);
  });
});

/** A window whose renderer, through the preload's wiring, answers with `answer`. */
function windowAnswering(answer: (p: { buttons: string[] }) => unknown) {
  const listeners = new Map<string, (e: unknown, ...a: unknown[]) => void>();
  const ipc = {
    on: (ch: string, fn: (e: unknown, ...a: unknown[]) => void) => { listeners.set(ch, fn); },
    invoke: async (ch: string, ...a: unknown[]) => handlers.get(ch)?.({}, ...a),
  };
  onPromptRequest(ipc, async (p) => answer(p) as number);
  const sent: unknown[][] = [];
  return {
    sent,
    win: {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: (ch: string, ...a: unknown[]) => { sent.push([ch, ...a]); listeners.get(ch)?.({}, ...a); } },
    },
  };
}

describe("createWindowPrompt", () => {
  it("asks the window over the prompt channel and resolves with its answer", async () => {
    const w = windowAnswering(() => 1);
    const { ask } = createWindowPrompt({ window: () => w.win as never });
    await expect(ask(prompt)).resolves.toBe(1);
    expect(w.sent[0]![0]).toBe(PROMPT_CHANNELS.ask);
    expect(w.sent[0]![2]).toEqual(prompt);
  });

  it("takes cancelId for an answer that isn't one of the buttons", async () => {
    const w = windowAnswering(() => 7);
    await expect(createWindowPrompt({ window: () => w.win as never }).ask(prompt)).resolves.toBe(0);
  });

  it("takes cancelId with no window, and when none answers in time", async () => {
    await expect(createWindowPrompt({ window: () => null }).ask(prompt)).resolves.toBe(0);
    vi.useFakeTimers();
    const silent = { isDestroyed: () => false, webContents: { isDestroyed: () => false, send: () => {} } };
    const p = createWindowPrompt({ window: () => silent as never, timeoutMs: 1000 }).ask(prompt);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBe(0);
  });

  it("tells a notice with one OK button", async () => {
    let seen: { buttons: string[] } | undefined;
    const w = windowAnswering((p) => { seen = p; return 0; });
    await createWindowPrompt({ window: () => w.win as never }).tell("Saved", "All of it.");
    expect(seen).toMatchObject({ title: "Saved", sub: "All of it.", buttons: ["OK"], defaultId: 0, cancelId: 0 });
  });
});
