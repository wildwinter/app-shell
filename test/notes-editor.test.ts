// The documentation-notes editor (notes-editor.ts): one text area per class,
// commit once on close and only on a change, read-only inherited notes. And
// what Patterpad needs to move onto it (the 2026-10 review, ruling I): the
// "editor" class with its words, a plain "Notes" title, its sub line, no
// inherited block, and opening focused on a given class.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openNotesEditor, type DocLine } from "../src/notes-editor.js";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false; this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => { document.body.replaceChildren(); });

const PATTERPAD = ["everyone", "vo", "loc", "editor"];
const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>("dialog.shell-notes")!;
const blocks = (): { caption: string; area: HTMLTextAreaElement }[] =>
  [...dialog().querySelectorAll<HTMLElement>(".shell-notes-class")].map((b) => ({
    caption: b.querySelector(".shell-notes-caption")!.textContent ?? "",
    area: b.querySelector("textarea")!,
  }));
const done = (): void => dialog().querySelector<HTMLButtonElement>(".shell-notes-btn")!.click();
const escape = (): void => { dialog().dispatchEvent(new Event("cancel", { cancelable: true })); };

describe("the editor class", () => {
  it("is labelled Editors, with Patterpad's placeholder", () => {
    openNotesEditor({ notes: { own: [{ type: "editor", text: "Check the tense" }], classes: PATTERPAD }, save: () => {} });
    const [b] = blocks();
    expect(b!.caption).toBe("Editors");
    expect(b!.area.placeholder).toBe("Context for an outside editor");
    expect(b!.area.value).toBe("Check the tense");
  });

  it("is offered in the add menu by its label", () => {
    openNotesEditor({ notes: { own: [], classes: PATTERPAD }, save: () => {} });
    const options = [...dialog().querySelectorAll<HTMLOptionElement>(".shell-notes-add option")].map((o) => o.textContent);
    expect(options).toEqual(["Add a note for…", "Voice (VO)", "Localisers", "Editors", "Note (editor-only)"]);
  });
});

describe("the title, the sub line, and inherited notes", () => {
  it("is plain Notes with no subject, and carries the app's sub line", () => {
    openNotesEditor({ sub: "A VO note travels with the voice script.", notes: { own: [], classes: PATTERPAD }, save: () => {} });
    expect(dialog().querySelector(".shell-dialog-title")!.textContent).toBe("Notes");
    expect(dialog().querySelector(".shell-dialog-sub")!.textContent).toBe("A VO note travels with the voice script.");
  });

  it("names the subject when given one, as before", () => {
    openNotesEditor({ subject: "Arrive at the gate", notes: { own: [], inherited: [], classes: PATTERPAD }, save: () => {} });
    expect(dialog().querySelector(".shell-dialog-title")!.textContent).toBe("Notes: Arrive at the gate");
    expect(dialog().querySelector(".shell-dialog-sub")).toBeNull();
  });

  it("shows inherited notes read-only, and none when there are none to show", () => {
    openNotesEditor({
      notes: { own: [], classes: PATTERPAD, inherited: [{ id: "box", label: "The market", lines: [{ type: "vo", text: "Busy" }] }] },
      save: () => {},
    });
    const from = dialog().querySelector(".shell-notes-inherited")!;
    expect(from.textContent).toContain("The market");
    expect(from.textContent).toContain("Voice (VO)");
    expect(from.querySelector("textarea")).toBeNull();
    document.body.replaceChildren();
    openNotesEditor({ notes: { own: [], classes: PATTERPAD }, save: () => {} });
    expect(dialog().querySelector(".shell-notes-inherited")).toBeNull();
  });
});

describe("focus", () => {
  it("opens on the class asked for, shown though empty, with the caret in it", () => {
    // "Needs re-record": the reason for the retake is a VO note.
    openNotesEditor({ notes: { own: [], classes: PATTERPAD }, focus: "vo", save: () => {} });
    const shown = blocks();
    expect(shown.map((b) => b.caption)).toEqual(["Voice (VO)"]);
    expect(document.activeElement).toBe(shown[0]!.area);
  });

  it("adds it after the classes already written on, and focuses it rather than the first", () => {
    openNotesEditor({ notes: { own: [{ type: "everyone", text: "Why" }], classes: PATTERPAD }, focus: "vo", save: () => {} });
    const shown = blocks();
    expect(shown.map((b) => b.caption)).toEqual(["Everyone", "Voice (VO)"]);
    expect(document.activeElement).toBe(shown[1]!.area);
  });

  it("is ignored for a class the thing does not take", () => {
    // A prose beat offers no VO class; a prompt must not add one.
    openNotesEditor({ notes: { own: [], classes: ["everyone", "loc"] }, focus: "vo", save: () => {} });
    const shown = blocks();
    expect(shown.map((b) => b.caption)).toEqual(["Everyone"]);
    expect(document.activeElement).toBe(shown[0]!.area);
  });
});

describe("commit on close", () => {
  it("saves once, on Done, with one note per non-blank line", () => {
    const save = vi.fn<(lines: DocLine[]) => void>();
    openNotesEditor({ notes: { own: [], classes: PATTERPAD }, focus: "vo", save });
    const [b] = blocks();
    b!.area.value = "Breathier\n\n  Slower  ";
    b!.area.dispatchEvent(new Event("input"));
    expect(save).not.toHaveBeenCalled();     // not per keystroke
    done();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ type: "vo", text: "Breathier" }, { type: "vo", text: "Slower" }]);
  });

  it("Escape commits too: there is no Cancel", () => {
    const save = vi.fn();
    openNotesEditor({ notes: { own: [], classes: PATTERPAD }, save });
    blocks()[0]!.area.value = "Kept";
    escape();
    expect(save).toHaveBeenCalledWith([{ type: "everyone", text: "Kept" }]);
  });

  it("does not save what was only read", () => {
    const save = vi.fn();
    openNotesEditor({ notes: { own: [{ type: "loc", text: "A pun" }], classes: PATTERPAD }, save });
    done();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves an emptied note as an empty list, so the app can drop it", () => {
    const save = vi.fn();
    openNotesEditor({ notes: { own: [{ text: "Internal" }], classes: PATTERPAD }, save });
    const [b] = blocks();
    expect(b!.caption).toBe("Note (editor-only)");
    b!.area.value = "";
    done();
    expect(save).toHaveBeenCalledWith([]);
  });
});
