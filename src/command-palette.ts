// ---------------------------------------------------------------------------
// The command palette (Cmd+K): every menu command by name, and quick open for
// the project's own things (a scene, a deck, a card). The October 2026 review
// found design-language principle 1 promising one and neither app having it.
//
// The commands are the app's live menu (flattenMenu in menu.ts, served by
// palette-main.ts), so the palette and the menu can never disagree, and a
// command the menu has greyed out is greyed here too. Quick-open rows come from
// the app, which already holds that data in the renderer.
//
// One palette at a time; Cmd+K again closes it. It isn't modal: there's no
// scrim, a click outside closes it, and Esc gives focus back to where it was.
// A picked command runs after the palette has closed and focus is back, so a
// command that acts on the focused thing (Copy, Delete) acts on that thing.
// ---------------------------------------------------------------------------

import { el, metaLine } from "./dom.js";
import { isKeyCombo, keyLabel } from "./keys.js";
import type { MenuCommand } from "./menu.js";

/** A quick-open row: something in the project to go to. */
export interface PaletteItem {
  label: string;
  /** What and where it is ("Scene", "Block in Gate", "Card in Arrival"). */
  detail?: string;
  run(): void;
}

export interface CommandPaletteOptions {
  /** The app's menu, flattened (the preload's bridge to PALETTE_CHANNELS.commands). */
  commands: () => Promise<MenuCommand[]>;
  /** Run a menu command by id (the bridge to PALETTE_CHANNELS.run). */
  run: (id: string) => void;
  /** Quick open: the project's things, read when the palette opens. */
  items?: () => PaletteItem[];
  /** The field's placeholder. */
  placeholder?: string;
}

interface Row {
  label: string;
  /** Searchable words; `where` draws them. */
  detail: string;
  /** A menu command's path, drawn with the family's separators. */
  where?: string[];
  hint?: string;
  enabled: boolean;
  go(): void;
}

let open: { root: HTMLElement; close(restore: boolean): void } | null = null;

/** Electron's accelerator in the family's portable spelling, for keyLabel. */
export function accelToCombo(accel: string): string {
  return accel.split("+").map((p) => {
    const w = p.toLowerCase();
    if (w === "cmdorctrl" || w === "commandorcontrol" || w === "cmd" || w === "command") return "Mod";
    if (w === "control") return "Ctrl";
    if (w === "option") return "Alt";
    return p;
  }).join("+").replace(/\+$/, "++");
}

const hintOf = (accel: string | undefined): string | undefined => {
  if (!accel) return undefined;
  const combo = accelToCombo(accel);
  return isKeyCombo(combo) ? keyLabel(combo) : accel;
};

/**
 * How well `query` matches `text`, or -1 for no match. A match at the start of
 * the text beats one at the start of a word, which beats one inside a word,
 * which beats initials: letters that each start a word or follow the last one
 * ("nsc" finds "New Scene", "rs" finds "Review Suggestions"). Letters scattered
 * through the middle of words don't count, or every long label would match.
 */
export function matchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at === 0) return 1000 - t.length;
  if (at > 0) return (/[\s\-_/(]/.test(t[at - 1]!) ? 800 : 600) - at;
  // Initials: walk the text, taking a letter only where a word starts or the
  // previous letter was taken too.
  let i = 0, runs = 0, prev = false;
  for (let j = 0; j < t.length && i < q.length; j++) {
    const wordStart = j === 0 || /[\s\-_/(]/.test(t[j - 1]!);
    if (t[j] === q[i] && (wordStart || prev)) { if (!prev) runs++; i++; prev = true; }
    else prev = false;
  }
  return i === q.length ? 300 - runs * 10 - t.length : -1;
}

/** Close the palette if it's open. Focus goes back where it was. */
export function closeCommandPalette(): void { open?.close(true); }

/** Open the palette, or close it if it's already open (Cmd+K toggles). */
export function openCommandPalette(opts: CommandPaletteOptions): void {
  if (open) { open.close(true); return; }
  const previous = document.activeElement as HTMLElement | null;

  const input = el("input", "shell-palette-input");
  input.type = "text";
  input.placeholder = opts.placeholder ?? "Type a command, or the name of something to open";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Command or name");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  const list = el("div", "shell-palette-list");
  list.id = "shell-palette-list";
  list.setAttribute("role", "listbox");
  input.setAttribute("aria-controls", list.id);
  const root = el("div", "shell-palette", input, list);
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Command palette");

  let commands: Row[] = [];
  const items: Row[] = (opts.items?.() ?? []).map((it) => ({
    label: it.label, detail: it.detail ?? "", enabled: true, go: () => it.run(),
  }));
  let shown: Row[] = [];
  let active = 0;

  const close = (restore: boolean): void => {
    if (open?.root !== root) return;
    open = null;
    root.remove();
    document.removeEventListener("mousedown", outside, true);
    if (restore && previous?.isConnected) previous.focus({ preventScroll: true });
  };
  const outside = (e: MouseEvent): void => { if (!root.contains(e.target as Node)) close(false); };

  const pick = (row: Row | undefined): void => {
    if (!row || !row.enabled) return;
    close(true);
    row.go();
  };

  const paint = (): void => {
    const q = input.value;
    const all = [...commands, ...items];
    if (q.trim()) {
      shown = all
        .map((r) => ({ r, s: Math.max(matchScore(q, r.label), matchScore(q, `${r.detail} ${r.label}`) - 50) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s || Number(b.r.enabled) - Number(a.r.enabled))
        .map((x) => x.r);
    } else {
      shown = all;
    }
    active = Math.max(0, shown.findIndex((r) => r.enabled));
    list.replaceChildren(...shown.slice(0, 200).map((r, i) => {
      const row = el("div", `shell-palette-row${r.enabled ? "" : " disabled"}`,
        el("span", "shell-palette-label", r.label),
        el("span", "shell-palette-detail", r.where ? metaLine(r.where) : r.detail));
      if (r.hint) row.append(el("span", "shell-palette-key", r.hint));
      row.id = `shell-palette-row-${i}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-disabled", String(!r.enabled));
      row.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
      row.addEventListener("click", () => pick(r));
      row.addEventListener("mousemove", () => { if (active !== i && r.enabled) { active = i; mark(); } });
      return row;
    }));
    if (shown.length === 0) list.append(el("div", "shell-palette-empty", "Nothing matches."));
    mark();
  };
  const mark = (): void => {
    list.querySelectorAll(".shell-palette-row").forEach((n, i) => {
      n.classList.toggle("active", i === active);
      n.setAttribute("aria-selected", String(i === active));
    });
    const cur = list.querySelector<HTMLElement>(".shell-palette-row.active");
    if (cur) { input.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  };
  const step = (dir: 1 | -1): void => {
    if (shown.length === 0) return;
    let i = active;
    for (let n = 0; n < shown.length; n++) {
      i = (i + dir + shown.length) % shown.length;
      if (shown[i]!.enabled) { active = i; mark(); return; }
    }
  };

  input.addEventListener("input", paint);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
  });

  document.body.append(root);
  document.addEventListener("mousedown", outside, true);
  open = { root, close };
  paint();
  input.focus();

  void opts.commands().then((list) => {
    if (open?.root !== root) return;
    commands = list.map((c) => {
      const hint = hintOf(c.accelerator);
      return {
        label: c.label, detail: c.path.join(" "), where: c.path, enabled: c.enabled, go: () => opts.run(c.id),
        ...(hint ? { hint } : {}),
      };
    });
    paint();
  }).catch(() => { /* no menu to read: quick open still works */ });
}
