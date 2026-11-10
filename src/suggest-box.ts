// ---------------------------------------------------------------------------
// A text box with suggestions (patterkit design/proposals/free-text-picks.md): any text may be typed, and a list
// under the box offers choices, filtered as the author types (anywhere in the name, case ignored). A choice has a
// value and the name it's shown by: a cast member is shown by name and held by id. Keyboard first: the arrows
// move through the list, Enter takes the highlighted choice (or the text as typed), Escape closes the list and
// puts the text back, and leaving the box keeps what's typed. A combobox to a screen reader.
//
// The list floats, as a menu does, in the box's dialog when it's in one (a body-level node sits behind a modal's
// scrim), so a scrolling panel never clips it.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

/** One suggestion: the value it holds, the name it's shown by, and the heading it sits under (none for the first). */
export interface Suggestion {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
}

export interface SuggestBoxOptions {
  /** The input's class (the app's field class). */
  readonly className?: string;
  /** Shown while the box is empty. */
  readonly placeholder?: string;
  /** The suggestions, asked for each time the list opens or the text changes. */
  readonly suggestions: () => readonly Suggestion[];
  /** The text typed, trimmed, became a value: the suggestion's value where the text names one, else the text.
   *  Empty when the box is cleared. Called only when it changes. */
  readonly onCommit: (value: string) => void;
}

export interface SuggestBox {
  /** The box: the input, which the caller labels and describes. */
  readonly input: HTMLInputElement;
  /** Show a held value: its suggestion's name where one holds it, else the value itself. */
  set(value: string): void;
  setDisabled(disabled: boolean): void;
}

let boxes = 0;

export function suggestBox(opts: SuggestBoxOptions): SuggestBox {
  const id = `shell-suggest-${++boxes}`;
  const input = el("input", opts.className ?? "field");
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", `${id}-list`);
  const list = el("div", "shell-suggest-list");
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");

  let held = "";
  let shown: Suggestion[] = [];
  let active = -1;

  const nameOf = (value: string): string => opts.suggestions().find((s) => s.value === value)?.label ?? value;
  /** What the text means: the suggestion it names (by its name or its value), else the text itself. */
  const valueOf = (text: string): string => {
    const t = text.trim();
    if (t === "") return "";
    const all = opts.suggestions();
    return (all.find((s) => s.label === t) ?? all.find((s) => s.value === t))?.value ?? t;
  };

  const isOpen = (): boolean => list.isConnected;
  const close = (): void => {
    list.remove();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const highlight = (i: number): void => {
    active = i;
    list.querySelectorAll<HTMLElement>(".shell-suggest-item").forEach((item, j) => {
      const on = j === i;
      item.classList.toggle("is-active", on);
      item.setAttribute("aria-selected", on ? "true" : "false");
      if (on) { input.setAttribute("aria-activedescendant", item.id); item.scrollIntoView?.({ block: "nearest" }); }
    });
    if (i < 0) input.removeAttribute("aria-activedescendant");
  };
  const place = (): void => {
    const r = input.getBoundingClientRect();
    list.style.left = `${r.left}px`;
    list.style.top = `${r.bottom + 2}px`;
    list.style.minWidth = `${r.width}px`;
    const l = list.getBoundingClientRect();
    if (l.bottom > window.innerHeight && r.top - l.height - 2 > 0) list.style.top = `${r.top - l.height - 2}px`;
  };
  /** Open the list on what matches `query` ("" for every suggestion). Nothing to offer, it stays closed. */
  const open = (query: string): void => {
    const q = query.trim().toLowerCase();
    shown = opts.suggestions().filter((s) => q === "" || s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q));
    if (shown.length === 0) { close(); return; }
    const parts: HTMLElement[] = [];
    let group: string | undefined;
    shown.forEach((s, i) => {
      if (s.group !== undefined && s.group !== group) parts.push(el("div", "shell-suggest-group", s.group));
      group = s.group;
      const item = el("div", "shell-suggest-item", s.label);
      item.id = `${id}-${i}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      // Pressed, not clicked: the box keeps the focus, so leaving it doesn't commit the text first.
      item.addEventListener("mousedown", (e) => { e.preventDefault(); choose(s.value); });
      parts.push(item);
    });
    list.replaceChildren(...parts);
    if (!isOpen()) (input.closest("dialog") ?? document.body).append(list);
    input.setAttribute("aria-expanded", "true");
    place();
    highlight(-1);
  };
  const commit = (value: string): void => {
    if (value === held) { input.value = nameOf(held); return; }
    held = value;
    input.value = nameOf(value);
    opts.onCommit(value);
  };
  const choose = (value: string): void => { close(); commit(value); };

  input.addEventListener("focus", () => open(""));
  input.addEventListener("input", () => open(input.value));
  input.addEventListener("blur", () => { close(); commit(valueOf(input.value)); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen()) { open(""); if (!isOpen()) return; }
      const n = shown.length;
      highlight(e.key === "ArrowDown" ? (active + 1) % n : (active <= 0 ? n - 1 : active - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active >= 0 && isOpen() ? shown[active]!.value : valueOf(input.value));
    } else if (e.key === "Escape" && isOpen()) {
      // Closes the list only: a dialog the box is in stays open.
      e.preventDefault();
      e.stopPropagation();
      close();
      input.value = nameOf(held);
    }
  });

  return {
    input,
    set: (value) => { held = value; if (document.activeElement !== input) input.value = nameOf(value); },
    setDisabled: (disabled) => { input.disabled = disabled; if (disabled) close(); },
  };
}
