// The kit gallery (kit-gallery.ts): shelves of tiles, a details panel that
// says the chosen kit in full, the app's fields only for the shelves that use
// them, a required name, and each shelf's own button label.
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openKitGallery } from "../src/kit-gallery.js";
import type { KitGalleryOptions } from "../src/kit-gallery.js";

beforeAll(() => {
  // jsdom's <dialog> lacks showModal/close; a minimal shim is enough here.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false; this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => { document.body.replaceChildren(); });

type Id = "starter" | "paired" | "hamlet";
const project = (over: Partial<KitGalleryOptions<Id>> = {}): KitGalleryOptions<Id> => ({
  title: "New project",
  what: "A project is one game's worth of storylets.",
  namePlaceholder: "The Village",
  sections: [
    { caption: "Start from a kit", items: [
      { id: "starter", name: "Starter project", blurb: "Two cards that work together.", play: "Press Play: one card opens the next.", shows: "boxes and hands.", lands: ["One box", "Two cards"] },
      { id: "paired", name: "Starter with Patter", blurb: "The starter, paired, with a scene for each card.", tile: "The starter, paired.", image: "art/paired.png" },
    ] },
    { caption: "Learn from a finished project", note: "Each opens as your own copy, in a folder you choose.", action: "Open a copy", usesDetails: false,
      items: [{ id: "hamlet", name: "The Hamlet", blurb: "Small.", badge: "Start here" }] },
  ],
  onPick: () => {},
  ...over,
});
const q = <E extends Element = HTMLElement>(sel: string): E => document.querySelector<E>(sel)!;
const tile = (id: string): HTMLButtonElement => q<HTMLButtonElement>(`.kit-gallery-tile[data-kit="${id}"]`);
const primary = (): HTMLButtonElement => q<HTMLButtonElement>(".shell-dialog-actions .btn.primary");

describe("openKitGallery", () => {
  it("draws captioned shelves of tiles on the dialog frame, the first chosen", () => {
    const g = openKitGallery(project());
    expect(g.dialog.open).toBe(true);
    expect(g.dialog.classList.contains("kit-gallery")).toBe(true);
    expect(q(".shell-dialog-title").textContent).toBe("New project");
    expect(q(".shell-dialog-sub").textContent).toBe("A project is one game's worth of storylets.");
    expect([...document.querySelectorAll(".kit-gallery-caption")].map((c) => c.textContent))
      .toEqual(["Start from a kit", "Learn from a finished project"]);
    expect(q(".kit-gallery-shelf-note").textContent).toBe("Each opens as your own copy, in a folder you choose.");
    expect([...document.querySelectorAll(".kit-gallery-tile-name")].map((n) => n.textContent))
      .toEqual(["Starter project", "Starter with Patter", "The Hamlet"]);
    expect(tile("hamlet").querySelector(".kit-gallery-badge")?.textContent).toBe("Start here");
    expect(tile("starter").getAttribute("aria-pressed")).toBe("true");
    expect(tile("paired").getAttribute("aria-pressed")).toBe("false");
  });

  it("says the chosen kit in full in the panel, and hides what it does not have", () => {
    openKitGallery(project());
    expect(q(".kit-gallery-panel-name").textContent).toBe("Starter project");
    expect(q(".kit-gallery-panel-blurb").textContent).toBe("Two cards that work together.");
    expect(q(".kit-gallery-play").textContent).toBe("Press Play: one card opens the next.");
    expect(q(".kit-gallery-shows").textContent).toBe("Shows: boxes and hands.");
    expect(q(".kit-gallery-lands-caption").textContent).toBe("What you get");
    expect([...document.querySelectorAll(".kit-gallery-lands li")].map((l) => l.textContent)).toEqual(["One box", "Two cards"]);
    expect(q(".kit-gallery-panel-detail").hidden).toBe(true);
    expect(tile("paired").querySelector(".kit-gallery-tile-blurb")?.textContent).toBe("The starter, paired.");
    tile("paired").click();
    expect(q(".kit-gallery-panel-name").textContent).toBe("Starter with Patter");
    expect(q(".kit-gallery-panel-blurb").textContent).toBe("The starter, paired, with a scene for each card.");
    expect(q(".kit-gallery-play").hidden).toBe(true);
    expect(q(".kit-gallery-shows").hidden).toBe(true);
    expect(q(".kit-gallery-lands").hidden).toBe(true);
    expect(q(".kit-gallery-lands-caption").hidden).toBe(true);
  });

  it("draws a picture as a mask variable, and no art box without one", () => {
    openKitGallery(project());
    expect(tile("starter").querySelector<HTMLElement>(".kit-gallery-art")!.hidden).toBe(true);
    const ink = tile("paired").querySelector<HTMLElement>(".kit-gallery-ink")!;
    expect(ink.style.getPropertyValue("--kit-art")).toBe('url("art/paired.png")');
  });

  it("requires the name, then hands back the choice and the trimmed name", () => {
    const onPick = vi.fn();
    const g = openKitGallery(project({ onPick }));
    expect(primary().textContent).toBe("Create");
    const name = q<HTMLInputElement>(".kit-gallery-name");
    expect(document.activeElement).toBe(name);
    primary().click();
    expect(onPick).not.toHaveBeenCalled();
    expect(name.classList.contains("kit-gallery-missing")).toBe(true);
    expect(g.dialog.open).toBe(true);
    name.value = "  Tavern  ";
    name.dispatchEvent(new Event("input"));
    expect(name.classList.contains("kit-gallery-missing")).toBe(false);
    tile("paired").click();
    primary().click();
    expect(onPick).toHaveBeenCalledWith("paired", { name: "Tavern" });
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("creates on Enter in the name field with the chosen kit", () => {
    const onPick = vi.fn();
    openKitGallery(project({ onPick }));
    const name = q<HTMLInputElement>(".kit-gallery-name");
    name.value = "Tavern";
    name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onPick).toHaveBeenCalledWith("starter", { name: "Tavern" });
  });

  it("gives a shelf without details its own button, its note, and no name", () => {
    const onPick = vi.fn();
    openKitGallery(project({ onPick }));
    tile("hamlet").click();
    expect(primary().textContent).toBe("Open a copy");
    expect(q(".kit-gallery-fields").hidden).toBe(true);
    expect(q(".kit-gallery-note").textContent).toBe("Each opens as your own copy, in a folder you choose.");
    primary().click();
    expect(onPick).toHaveBeenCalledWith("hamlet", {});
  });

  it("chooses and goes on a double-click", () => {
    const onPick = vi.fn();
    openKitGallery(project({ onPick }));
    tile("hamlet").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith("hamlet", {});
  });

  it("opens on the initial item and focuses its tile when no name is wanted there", () => {
    openKitGallery(project({ initial: "hamlet" }));
    expect(tile("hamlet").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(tile("hamlet"));
  });

  it("with no name asked, picks with an empty choice (New Box)", () => {
    const onPick = vi.fn();
    openKitGallery<"blank" | "rpg">({
      title: "New box", sections: [{ items: [
        { id: "blank", name: "Blank", blurb: "An empty box." },
        { id: "rpg", name: "Encounters on a map", blurb: "Things that can happen." },
      ] }], onPick,
    });
    expect(document.querySelector(".kit-gallery-caption")).toBeNull();
    expect(document.querySelector(".kit-gallery-name")).toBeNull();
    expect(q(".kit-gallery-fields").hidden).toBe(true);
    tile("rpg").click();
    primary().click();
    expect(onPick).toHaveBeenCalledWith("rpg", {});
  });

  it("puts the app's own fields in the panel, under the name", () => {
    const vcs = document.createElement("select");
    vcs.className = "vcs";
    openKitGallery(project({ details: vcs }));
    const fields = q(".kit-gallery-fields");
    expect(fields.lastElementChild).toBe(vcs);
    expect(fields.querySelector(".kit-gallery-name")).not.toBeNull();
  });

  it("tells the app as the name is typed, so its own fields can follow", () => {
    const onNameInput = vi.fn();
    openKitGallery(project({ onNameInput }));
    expect(onNameInput).toHaveBeenLastCalledWith("");
    const name = q<HTMLInputElement>(".kit-gallery-name");
    name.value = "The Docks";
    name.dispatchEvent(new Event("input"));
    expect(onNameInput).toHaveBeenLastCalledWith("The Docks");
  });

  it("tells the app what is chosen, the opening item included", () => {
    const onChoose = vi.fn();
    openKitGallery(project({ onChoose }));
    expect(onChoose).toHaveBeenLastCalledWith("starter");
    tile("hamlet").click();
    expect(onChoose).toHaveBeenLastCalledWith("hamlet");
  });

  it("lets the app hold the pick until its own field is filled", () => {
    const onPick = vi.fn();
    const speaker = document.createElement("input");
    openKitGallery(project({ onPick, details: speaker, validate: () => (speaker.value === "" ? speaker : null) }));
    q<HTMLInputElement>(".kit-gallery-name").value = "Tavern";
    primary().click();
    expect(onPick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(speaker);
    expect(speaker.classList.contains("kit-gallery-missing")).toBe(true);
    speaker.value = "Gareth";
    speaker.dispatchEvent(new Event("input"));
    expect(speaker.classList.contains("kit-gallery-missing")).toBe(false);
    primary().click();
    expect(onPick).toHaveBeenCalledWith("starter", { name: "Tavern" });
  });

  it("cancels without picking, and runs onClose", () => {
    const onPick = vi.fn(), onClose = vi.fn();
    openKitGallery(project({ onPick, onClose }));
    [...document.querySelectorAll<HTMLButtonElement>(".shell-dialog-actions .btn")].find((b) => b.textContent === "Cancel")!.click();
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("refuses an empty gallery", () => {
    expect(() => openKitGallery({ title: "T", sections: [{ items: [] }], onPick: () => {} })).toThrow(/no items/);
  });

  it("styles: the picture is a mask over a plate the app can set, and the panel folds under on narrow windows", () => {
    const css = readFileSync(join(process.cwd(), "src/kit-gallery.css"), "utf8");
    expect(css).toMatch(/--kit-art-ink:/);
    expect(css).toMatch(/--kit-art-plate:/);
    expect(css).toMatch(/mask: var\(--kit-art\)/);
    expect(css).toMatch(/@media \(max-width: 760px\)/);
  });
});
