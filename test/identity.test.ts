// The identity ask (identity.ts): two occasions on one dialog. The title and
// the primary button say which; the fields carry captions, not placeholders
// alone; a skip resolves undefined unless the host asked to never ask again.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { askIdentity, type Identity, type IdentityOptions } from "../src/identity.js";

beforeAll(() => {
  // jsdom's <dialog> lacks showModal/close; a minimal shim is enough here.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false; this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => { document.body.replaceChildren(); });

const open = (opts?: IdentityOptions): { p: Promise<Identity | undefined>; dlg: HTMLDialogElement } => {
  const p = askIdentity(opts);
  const dlg = document.querySelector("dialog.shell-ident") as HTMLDialogElement;
  return { p, dlg };
};
const title = (dlg: HTMLDialogElement): string | undefined => dlg.querySelector(".shell-dialog-title")?.textContent ?? undefined;
const primary = (dlg: HTMLDialogElement): HTMLButtonElement => dlg.querySelector(".shell-ident-btn.primary") as HTMLButtonElement;
const skip = (dlg: HTMLDialogElement): HTMLButtonElement => [...dlg.querySelectorAll<HTMLButtonElement>(".shell-ident-btn")].find((b) => b.textContent === "Skip")!;
const captions = (dlg: HTMLDialogElement): string[] => [...dlg.querySelectorAll(".shell-fieldcap")].map((c) => c.textContent ?? "");

describe("askIdentity", () => {
  it("without a mode is the plain ask it always was: the shell's title, Save", async () => {
    const { p, dlg } = open();
    expect(title(dlg)).toBe("Who is working here?");
    expect(primary(dlg).textContent).toBe("Save");
    expect(skip(dlg)).toBeDefined();
    skip(dlg).click();
    await expect(p).resolves.toBeUndefined();
  });

  it("welcome mode names the app in the title and asks to Continue", async () => {
    const { p, dlg } = open({ mode: "welcome", appName: "Patterpad" });
    expect(title(dlg)).toBe("Welcome to Patterpad");
    expect(primary(dlg).textContent).toBe("Continue");
    expect(dlg.querySelector(".shell-dialog-sub")?.textContent).toMatch(/You can change it later\.$/);
    skip(dlg).click();
    await p;
  });

  it("welcome mode without an app name is plain Welcome", async () => {
    const { p, dlg } = open({ mode: "welcome" });
    expect(title(dlg)).toBe("Welcome");
    skip(dlg).click();
    await p;
  });

  it("edit mode is User information with Save, and drops the 'later' line", async () => {
    const { p, dlg } = open({ mode: "edit", current: { name: "Ada" } });
    expect(title(dlg)).toBe("User information");
    expect(primary(dlg).textContent).toBe("Save");
    expect(dlg.querySelector(".shell-dialog-sub")?.textContent).not.toMatch(/change it later/);
    skip(dlg).click();
    await p;
  });

  it("captions both fields above the inputs, in every mode", async () => {
    for (const mode of [undefined, "welcome", "edit"] as const) {
      const { p, dlg } = open(mode ? { mode } : {});
      expect(captions(dlg)).toEqual(["Name", "Email"]);
      // The caption points at ITS field (dom.ts `labelled`), so a click on it focuses the input.
      const rows = [...dlg.querySelectorAll<HTMLLabelElement>("label.shell-labelled")];
      expect(rows).toHaveLength(2);
      expect(rows[0]!.control).toBe(dlg.querySelector("input:not([type=email])"));
      expect(rows[1]!.control).toBe(dlg.querySelector("input[type=email]"));
      skip(dlg).click();
      await p;
    }
  });

  it("Save returns what was typed, with the email only when there is one", async () => {
    const { p, dlg } = open({ mode: "welcome", suggested: { name: "Ada" } });
    const inputs = dlg.querySelectorAll<HTMLInputElement>("input");
    expect(inputs[0]!.value).toBe("Ada");
    inputs[1]!.value = " ada@example.org ";
    primary(dlg).click();
    await expect(p).resolves.toEqual({ name: "Ada", email: "ada@example.org" });
  });

  it("a skip resolves undefined by default, so the app asks again next launch", async () => {
    const { p, dlg } = open({ mode: "welcome" });
    dlg.dispatchEvent(new Event("cancel", { cancelable: true }));   // Escape
    await expect(p).resolves.toBeUndefined();
  });

  it("neverAskAgainOnSkip: a skip resolves a blank identity for the app to store", async () => {
    const { p, dlg } = open({ mode: "welcome", neverAskAgainOnSkip: true });
    skip(dlg).click();
    await expect(p).resolves.toEqual({ name: "" });
  });

  it("neverAskAgainOnSkip: a Save with an empty name counts as a skip too", async () => {
    const { p, dlg } = open({ mode: "welcome", neverAskAgainOnSkip: true });
    primary(dlg).click();
    await expect(p).resolves.toEqual({ name: "" });
  });
});
