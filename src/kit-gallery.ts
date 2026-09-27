// ---------------------------------------------------------------------------
// The kit gallery: pick a starting point by what you want to make.
//
// The new-thing moment for the family (New Project, New Box, New Scene), drawn
// once. Adobe's New Document is the shape: tiles on the left, a details panel
// on the right, one screen. Not a wizard: a wizard asks for settings before
// anything has been chosen, and the choice is the part that teaches.
//
// Storyletter grew this as `kit-picker.ts` (one component at two scales on
// <dialog>, "a shell candidate, held back until it had been used in earnest")
// and the kit gallery brief moved it here, 2026-09-27
// (storylet-studio/design/kit-gallery.md). What a kit IS made of stays in
// each app: this file knows names, words and pictures, never boxes or scenes.
//
// Sections are shelves ("Start from a kit", "Learn from a finished project"),
// and each says what its button does, because opening a copy of an example
// and creating from a kit are different acts behind the same kind of tile.
// The app's own fields (a project name, version control, a build path) sit in
// the details panel, shown only for the sections that use them.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { dialogFrame } from "./dialog.js";

export interface KitGalleryItem<T extends string> {
  id: T;
  /** What you are making, in the author's terms, not the model's. */
  name: string;
  /** What it is FOR: the panel's first line, and the tile's unless `tile` says otherwise. */
  blurb: string;
  /** The tile's line, when the blurb is longer than a tile holds (three
   *  lines). A whole short sentence reads better than a long one cut off. */
  tile?: string;
  /** More, for the panel only. */
  detail?: string;
  /** What pressing Play (or Run) shows, said as a promise. */
  play?: string;
  /** What it has, in a word or two each ("Drawn map", "Copies"): pills on the tile and in the
   *  panel, so kits compare at a glance before any is chosen. The author's ask, 2026-09-27, in
   *  place of pictures, which were ruled out the same day. */
  features?: string[];
  /** What lands, in the concrete, as a short list in the panel. */
  lands?: string[];
  /** A word or two on the tile ("Start here"). */
  badge?: string;
}

export interface KitGallerySection<T extends string> {
  /** Sentence-case label text ("Start from a kit"). Absent: no caption. */
  caption?: string;
  /** The consequence of a click, said before the click. */
  note?: string;
  items: KitGalleryItem<T>[];
  /** The primary button's label while an item here is chosen. Default "Create". */
  action?: string;
  /** Show the app's detail fields (and ask for the name) for this section.
   *  Default true. An example is opened, not named, so its shelf says false. */
  usesDetails?: boolean;
}

export interface KitGalleryChoice {
  /** Present when a name was asked for and the chosen section uses details. */
  name?: string;
}

export interface KitGalleryOptions<T extends string> {
  /** The dialog's heading: "New project", "New box", "New scene". */
  title: string;
  /** What the thing being made IS, in concrete terms. */
  what?: string;
  sections: KitGallerySection<T>[];
  /** Ask for a name in the details panel, with this placeholder. Required
   *  when asked: making a thing without one would have to invent a folder. */
  namePlaceholder?: string;
  /** The name field's label. Default "Name". */
  nameLabel?: string;
  /** The app's own fields, below the name (version control, a build path). */
  details?: HTMLElement;
  /** Runs whenever an item is chosen, the opening one included, so the app can show or hide its
   *  own fields for it (New Scene's Speaker, for a kit with lines). */
  onChoose?: (id: T) => void;
  /** Checked before `onPick`, after the name: return the app's field that still needs filling (it
   *  is focused and marked, and nothing is made), or null when all is well. */
  validate?: (id: T) => HTMLElement | null;
  /** Runs as the name is typed (and once on open, with ""), so the app's own
   *  fields can follow it: Patterpad's folder preview and default publish path. */
  onNameInput?: (name: string) => void;
  /** The item chosen when the gallery opens. Default: the first. */
  initial?: T;
  onPick: (id: T, choice: KitGalleryChoice) => void;
  /** Runs once the gallery has closed, whichever way. */
  onClose?: () => void;
}

export interface KitGallery {
  readonly dialog: HTMLDialogElement;
  close(): void;
}

/** A kit's features as pills, or null when it lists none. */
function featurePills(features: string[] | undefined): HTMLElement | null {
  if (!features || features.length === 0) return null;
  return el("span", "kit-gallery-features", ...features.map((f) => el("span", "kit-gallery-feature", f)));
}

/** One tile: the name with its badge, the blurb, the feature pills. The gallery's
 *  own, and the welcome screen's, so a kit looks the same wherever it is met
 *  (welcome.ts draws a tiled group with it; import kit-gallery.css there too). */
export function kitTile(item: { name: string; blurb: string; badge?: string; features?: string[] }, onClick: () => void): HTMLButtonElement {
  const tile = el("button", { className: "kit-gallery-tile", onClick },
    el("span", "kit-gallery-tile-head",
      el("span", "kit-gallery-tile-name", item.name),
      item.badge !== undefined ? el("span", "kit-gallery-badge", item.badge) : null),
    el("span", "kit-gallery-tile-blurb", item.blurb),
    featurePills(item.features)) as HTMLButtonElement;
  tile.type = "button";
  return tile;
}

/** Open the gallery as a modal dialog on the family's frame. */
export function openKitGallery<T extends string>(opts: KitGalleryOptions<T>): KitGallery {
  const frame = dialogFrame({ title: opts.title, ...(opts.what !== undefined ? { sub: opts.what } : {}), className: "kit-gallery", ...(opts.onClose ? { onClose: opts.onClose } : {}) });
  const { dialog } = frame;

  const entries = opts.sections.flatMap((section, s) => section.items.map((item) => ({ item, section, s })));
  if (entries.length === 0) throw new Error("openKitGallery: no items to choose from");
  let chosen = entries.find((e) => e.item.id === opts.initial) ?? entries[0]!;

  // --- the details panel ----------------------------------------------------
  const nameInput = opts.namePlaceholder === undefined ? undefined : el("input", { className: "field kit-gallery-name" }) as HTMLInputElement;
  if (nameInput) {
    nameInput.placeholder = opts.namePlaceholder!;
    nameInput.setAttribute("aria-label", opts.nameLabel ?? "Name");
  }
  const fields = el("div", "kit-gallery-fields",
    ...(nameInput ? [el("label", "kit-gallery-label", opts.nameLabel ?? "Name"), nameInput] : []),
    ...(opts.details ? [opts.details] : []));

  const panelName = el("h3", "kit-gallery-panel-name");
  const panelBlurb = el("p", "kit-gallery-panel-blurb");
  const panelDetail = el("p", "kit-gallery-panel-detail");
  const panelPlay = el("p", "kit-gallery-play");
  const panelFeatures = el("div", "kit-gallery-panel-features");
  const panelLands = el("ul", "kit-gallery-lands");
  const panelLandsCaption = el("p", "kit-gallery-lands-caption", "What you get");
  const panelNote = el("p", "kit-gallery-note");
  const panel = el("div", "kit-gallery-panel",
    panelName, panelFeatures, panelBlurb, panelDetail, panelPlay, panelLandsCaption, panelLands, panelNote, fields);

  const primary = el("button", { className: "btn primary", onClick: () => commit() }) as HTMLButtonElement;
  primary.type = "button";
  const cancel = el("button", { className: "btn", text: "Cancel", onClick: () => frame.close() }) as HTMLButtonElement;
  cancel.type = "button";

  const setText = (node: HTMLElement, text: string | undefined): void => {
    node.textContent = text ?? "";
    node.hidden = text === undefined || text === "";
  };

  // --- the tiles --------------------------------------------------------------
  const tiles = new Map<T, HTMLButtonElement>();
  const shelves = opts.sections.map((section) => {
    const grid = el("div", "kit-gallery-grid", ...section.items.map((item) => {
      const tile = kitTile({ ...item, blurb: item.tile ?? item.blurb }, () => choose(item.id));
      tile.dataset.kit = item.id;
      // Double-click is the desktop's "choose and go"; a single click only chooses,
      // so a tile can be read in the panel before anything is made.
      tile.addEventListener("dblclick", () => { choose(item.id); commit(); });
      tiles.set(item.id, tile);
      return tile;
    }));
    return el("section", "kit-gallery-shelf",
      section.caption !== undefined ? el("h3", "kit-gallery-caption", section.caption) : null,
      section.note !== undefined ? el("p", "kit-gallery-shelf-note", section.note) : null,
      grid);
  });

  const choose = (id: T): void => {
    const next = entries.find((e) => e.item.id === id);
    if (!next) return;
    chosen = next;
    for (const [tid, tile] of tiles) tile.setAttribute("aria-pressed", String(tid === id));
    const { item, section } = chosen;
    panelName.textContent = item.name;
    setText(panelBlurb, item.blurb);
    setText(panelDetail, item.detail);
    setText(panelPlay, item.play);
    const pills = featurePills(item.features);
    panelFeatures.replaceChildren(...(pills ? [pills] : []));
    panelFeatures.hidden = pills === null;
    panelLands.replaceChildren(...(item.lands ?? []).map((l) => el("li", undefined, l)));
    panelLands.hidden = (item.lands ?? []).length === 0;
    panelLandsCaption.hidden = panelLands.hidden;
    const details = section.usesDetails !== false;
    fields.hidden = !details || (nameInput === undefined && opts.details === undefined);
    // Without the fields, the shelf's note is what the click will do next
    // ("a folder you choose"), so the panel repeats it beside the button.
    setText(panelNote, details ? undefined : section.note);
    primary.textContent = section.action ?? "Create";
    opts.onChoose?.(item.id);
  };

  const commit = (): void => {
    const { item, section } = chosen;
    const details = section.usesDetails !== false;
    let name: string | undefined;
    if (details && nameInput) {
      name = nameInput.value.trim();
      if (name === "") { nameInput.focus(); nameInput.classList.add("kit-gallery-missing"); return; }
    }
    const missing = opts.validate?.(item.id) ?? null;
    if (missing) {
      missing.classList.add("kit-gallery-missing");
      missing.addEventListener("input", () => missing.classList.remove("kit-gallery-missing"), { once: true });
      missing.focus();
      return;
    }
    frame.close();
    opts.onPick(item.id, name !== undefined ? { name } : {});
  };

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      nameInput.classList.remove("kit-gallery-missing");
      opts.onNameInput?.(nameInput.value);
    });
    opts.onNameInput?.("");
    // Enter creates with what is chosen: the author has said what it should be
    // called, and the tile they are looking at is the one they meant.
    nameInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key !== "Enter") return;
      e.preventDefault();
      commit();
    });
  }

  frame.body.append(el("div", "kit-gallery-layout", el("div", "kit-gallery-shelves", ...shelves), panel));
  frame.actions.append(cancel, primary);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) frame.close(); });

  choose(chosen.item.id);
  frame.open();
  // Focus where the next keystroke is wanted: the name when one is asked for
  // and the opening shelf uses it, otherwise the chosen tile.
  if (nameInput && chosen.section.usesDetails !== false) nameInput.focus();
  else tiles.get(chosen.item.id)?.focus();

  return { dialog, close: () => frame.close() };
}
