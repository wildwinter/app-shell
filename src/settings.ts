// ---------------------------------------------------------------------------
// The shared settings surface: a native <dialog> with a left-rail of grouped
// tabs and one panel per section (mountSettingsDialog), plus the list-editing
// core those sections lean on (expandableRow, focusNewRow, dupGuard). The app
// supplies the sections; each holds its own state and reports the first invalid
// control so the Save gate can block + jump. Framework here, content in the app.
//
// Lifted from Patterpad's Project Settings (settings-list.ts + the inlined
// dialog logic in its renderer), with neutral class names. Styling ships as
// settings.css.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";

// --- list-editing core --------------------------------------------------------

/** A compact list row: a single `.set-rowline` (inline controls) plus, when
 *  `details` are given, a disclosure that reveals a `.set-details` panel below,
 *  so a list scans like a table with secondary fields tucked away. */
export function expandableRow(opts: { line: HTMLElement[]; details?: HTMLElement[] }): HTMLElement {
  const row = el("div", "set-row");
  const line = el("div", "set-rowline");
  if (opts.details && opts.details.length) {
    const details = el("div", "set-details"); details.hidden = true;
    for (const d of opts.details) details.append(d);
    const toggle = el("button", "set-expand", "▸"); toggle.type = "button";
    toggle.title = "More"; toggle.setAttribute("aria-label", "More");
    toggle.addEventListener("click", () => {
      const open = details.hidden;
      details.hidden = !open;
      toggle.textContent = open ? "▾" : "▸";
      toggle.classList.toggle("open", open);
    });
    line.append(toggle);
    opts.line.forEach((c) => line.append(c));
    row.append(line, details);
  } else {
    opts.line.forEach((c) => line.append(c));
    row.append(line);
  }
  return row;
}

/** After a "+ Add" re-renders a list, bring the new (last) row into view and
 *  focus its name input (`.set-name`, else the first input). */
export function focusNewRow(listEl: HTMLElement | null | undefined): void {
  const last = listEl?.lastElementChild;
  if (!(last instanceof HTMLElement)) return;
  last.scrollIntoView({ block: "nearest" });
  const name = last.querySelector<HTMLInputElement>("input.set-name") ?? last.querySelector<HTMLInputElement>("input");
  name?.focus();
}

export interface DupGuard {
  /** Forget the previous render's inputs (call at the top of render). */
  reset(): void;
  /** Register a name input; `key` returns the comparison string (default the
   *  input's value). Re-checks live on input. `also` = extra inputs that change the key. */
  track(input: HTMLInputElement, key?: () => string, also?: HTMLInputElement[]): void;
  /** Re-paint duplicates; true if any two non-blank keys collide. */
  check(): boolean;
  /** The first input currently flagged (after a fresh check), or null. */
  firstDuplicate(): HTMLInputElement | null;
}

/** Case-insensitive duplicate-name detection: paints clashing inputs `.invalid`
 *  and lets a Save gate block + jump via `firstDuplicate()`. */
export function dupGuard(): DupGuard {
  const items: Array<{ input: HTMLInputElement; key: () => string }> = [];
  const check = (): boolean => {
    const counts = new Map<string, number>();
    for (const it of items) { const k = it.key().trim().toLowerCase(); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
    let any = false;
    for (const it of items) {
      const k = it.key().trim().toLowerCase();
      const dup = !!k && (counts.get(k) ?? 0) > 1;
      it.input.classList.toggle("invalid", dup);
      if (dup) { it.input.title = "Duplicate name. Names must be unique."; any = true; }
      else if (it.input.title === "Duplicate name. Names must be unique.") it.input.removeAttribute("title");
    }
    return any;
  };
  return {
    reset() { items.length = 0; },
    track(input, key = () => input.value, also) {
      items.push({ input, key });
      input.addEventListener("input", check);
      for (const a of also ?? []) a.addEventListener("input", check);
    },
    check,
    firstDuplicate() { check(); return items.find((it) => it.input.classList.contains("invalid"))?.input ?? null; },
  };
}

// --- the settings dialog ------------------------------------------------------

export interface SettingsSectionHandle {
  /** The first invalid control to jump to, blocking Save (e.g. a duplicate name). */
  firstInvalid?(): HTMLElement | null;
}

export interface SettingsSection {
  id: string;
  label: string;
  /** Optional left-rail group heading above this tab. */
  group?: string;
  /** Build the section body into `host`; called fresh on each open so it reads
   *  the current data. Return a handle (for the Save gate). */
  mount(host: HTMLElement): SettingsSectionHandle;
}

export interface SettingsDialogOptions {
  title: string;
  sections: SettingsSection[];
  /** Fired when Save is clicked and every section validates. The app reads its
   *  own section state and persists. May be async; the dialog stays open until
   *  it resolves, then closes. */
  onSave: () => void | Promise<void>;
}

export interface SettingsDialog {
  /** Open (optionally on a given tab id). Sections re-mount from current data. */
  open(tabId?: string): void;
  destroy(): void;
}

/** Build a settings dialog. The frame owns the modal, the tab rail, save-on-Save
 *  (with a validation gate), and Cancel; the sections own their content + state. */
export function mountSettingsDialog(opts: SettingsDialogOptions): SettingsDialog {
  const dialog = el("dialog", "settings-dialog");
  const form = el("form", "settings-form"); form.method = "dialog";
  const tabs = el("nav", "settings-tabs");
  const panels = el("div", "settings-panels");
  const error = el("p", "settings-error"); error.hidden = true;
  const cancel = el("button", "settings-cancel", "Cancel"); cancel.type = "button"; cancel.value = "cancel";
  const save = el("button", "settings-save primary", "Save"); save.value = "save";

  const panelFor = new Map<string, HTMLElement>();
  const tabFor = new Map<string, HTMLButtonElement>();
  const handles = new Map<string, SettingsSectionHandle>();
  let active = opts.sections[0]?.id ?? "";

  let lastGroup: string | undefined;
  for (const s of opts.sections) {
    if (s.group && s.group !== lastGroup) { tabs.append(el("div", "settings-group", s.group)); lastGroup = s.group; }
    const tab = el("button", "settings-tab", s.label); tab.type = "button"; tab.dataset["tab"] = s.id;
    tab.addEventListener("click", () => showTab(s.id));
    tabs.append(tab); tabFor.set(s.id, tab);
    const panel = el("section", "settings-panel"); panel.dataset["panel"] = s.id; panel.hidden = true;
    panels.append(panel); panelFor.set(s.id, panel);
  }

  function showTab(id: string): void {
    active = id;
    for (const [sid, t] of tabFor) t.classList.toggle("active", sid === id);
    for (const [sid, p] of panelFor) p.hidden = sid !== id;
  }

  form.append(
    el("h2", "settings-title", opts.title),
    el("div", "settings-body", tabs, panels),
    el("div", "settings-actions", error, cancel, save),
  );
  dialog.append(form);
  document.body.append(dialog);

  // Enter should not submit while editing a field; only the Save button does.
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.target as HTMLElement)?.tagName === "INPUT") e.preventDefault();
  });

  cancel.addEventListener("click", () => dialog.close("cancel"));
  save.addEventListener("click", (e) => {
    e.preventDefault();
    error.hidden = true;
    for (const s of opts.sections) {
      const bad = handles.get(s.id)?.firstInvalid?.();
      if (bad) { showTab(s.id); bad.focus(); error.textContent = "Fix the highlighted fields first."; error.hidden = false; return; }
    }
    void (async () => { await opts.onSave(); dialog.close("save"); })();
  });

  return {
    open(tabId) {
      handles.clear();
      for (const s of opts.sections) {
        const panel = panelFor.get(s.id)!;
        panel.replaceChildren();
        handles.set(s.id, s.mount(panel));
      }
      error.hidden = true;
      showTab(tabId ?? active ?? opts.sections[0]?.id ?? "");
      dialog.showModal();
    },
    destroy() { dialog.remove(); },
  };
}
