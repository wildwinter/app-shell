// ---------------------------------------------------------------------------
// `el`: the tiny tag-typed element factory both apps build their imperative,
// idempotent views with.
//
// A SUPERSET of the two apps' prior signatures, so neither rewrites call sites:
//   - Patterpad:       el(tag, cls?, text?)                       (positional)
//   - Storylet Studio: el(tag, { className, text, ... }, ...kids) (options bag)
// A string second argument is the className; an object is the props bag; string
// children become text nodes. So `el("div", "c", "t")` and
// `el("div", { className: "c" }, "t")` produce identical DOM.
// ---------------------------------------------------------------------------

import { ensureTooltipHost, checkTooltipHost } from "./tooltip.js";
import { iconNode, iconNameOfGlyph, isIconName, type IconName } from "./icons.js";

export type Child = Node | string | null | undefined;

export interface ElProps {
  className?: string;
  text?: string;
  /** A NATIVE rollover. Prefer `tip`: `title` is OS chrome on the platform's own
   *  slow delay, which is the seam the themed tooltip exists to close. */
  title?: string;
  /** A themed rollover (`data-tip`, picked up by the delegated controller that
   *  `initTooltips()` wires). Also the accessible name, since the elements that
   *  want one are usually icon buttons with no text of their own. */
  tip?: string;
  onClick?: (event: MouseEvent) => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classNameOrProps?: string | ElProps,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const props: ElProps = typeof classNameOrProps === "string"
    ? { className: classNameOrProps }
    : classNameOrProps ?? {};
  if (props.className) node.className = props.className;
  if (props.text !== undefined && props.text !== null) node.textContent = props.text;
  if (props.title !== undefined) node.title = props.title;
  if (props.tip !== undefined) {
    node.dataset["tip"] = props.tip;
    node.setAttribute("aria-label", props.tip);
    // Setting a tip mounts the renderer. Without this, `data-tip` draws nothing at all in a window whose
    // host never called `initTooltips()`, which is a silent failure rather than a degraded one. No
    // options passed: the host stays authoritative about behaviour (see tooltip.ts).
    ensureTooltipHost();
  }
  if (props.onClick) node.addEventListener("click", props.onClick as EventListener);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  checkTooltipHost(); // one-shot: warns if the APP wrote data-tip and nothing mounted a host
  return node;
}

/** A small square icon button (the move/delete controls list editors share).
 *  Its rollover is the THEMED one (`data-tip`), so an app that has called
 *  `initTooltips()` gets our bubble rather than the platform's.
 *
 *  `name` is a word from the vocabulary ("up", "close"), drawn at 14px. A
 *  typed glyph from the deprecated `icon` table ("↑", "✕") is accepted for
 *  now and drawn as the word it stood for, so an app that has not moved its
 *  call sites yet still gets the drawn set; any other string is set as text,
 *  which is the old behaviour and on its way out. */
export function iconBtn(name: IconName | (string & {}), title: string, onClick: () => void, disabled = false, danger = false): HTMLButtonElement {
  const b = el("button", `shell-icon${danger ? " danger" : ""}`);
  b.type = "button"; b.dataset["tip"] = title; b.setAttribute("aria-label", title);
  const word = isIconName(name) ? name : iconNameOfGlyph(name);
  if (word) b.append(iconNode(word)); else b.textContent = name;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

/** The sentence under a settings row: plain text, or nodes when it carries
 *  markup (a `code` for a file name, a `b` for an option's name). */
export type FieldHint = string | Node | Array<string | Node>;

/**
 * A captioned field, the family's settings row (the 2026-10 review, ruling C):
 * the caption on the left and the control inline beside it,
 * `<label class="shell-labelled"><span class="shell-fieldcap">…</span>control</label>`.
 *
 * The label is pointed at the field it captions, EXPLICITLY, and never at a button. A `<label>` with no
 * `for` forwards a click to its first labelable descendant, and buttons are labelable - so a caption
 * wrapped around a control containing buttons (`tagChips`, whose every chip carries a remove button)
 * turns every click on the row's dead space into a press of the FIRST button in it. That shipped:
 * patterkit/patter#44, where clicking a Game Data list value anywhere but its ✕ deleted the first value
 * in the list. Reported as "clicking a value removes the wrong one", which is not a wrong-index bug at
 * all - the click never reached the chip. The same rule makes a control GROUP safe to caption: a field
 * with its own Choose… or Import… button beside it (`.shell-inline`) captions the field, and the button
 * stays a button.
 *
 * When the control holds no labelable field (a chips editor with the add input removed, say), this is a
 * plain `<div>`: no caption behaviour is better than a caption that presses something.
 *
 * With a `hint`, the row and the sentence under it come back together in a `.shell-field`, the hint as
 * the field's description (`aria-describedby`) rather than inside the label, where it would become part
 * of the field's NAME and be read out every time it takes focus. Without one, the row is exactly what it
 * always was.
 */
export function labelled(label: string, control: HTMLElement, hint?: FieldHint): HTMLElement {
  const target = control.matches("input, select, textarea")
    ? control
    : control.querySelector<HTMLElement>("input:not([type=button]):not([type=submit]), select, textarea");
  const w = el(target ? "label" : "div", "shell-labelled");
  w.append(el("span", "shell-fieldcap", label), control);
  if (target) {
    if (!target.id) target.id = uid();
    (w as HTMLLabelElement).htmlFor = target.id;
  }
  if (hint === undefined) return w;
  const note = el("p", "shell-fieldhint");
  note.append(...(Array.isArray(hint) ? hint : [hint]));
  note.id = uid();
  if (target) {
    const by = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", by ? `${by} ${note.id}` : note.id);
  }
  return el("div", "shell-field", w, note);
}

const uid = (): string => `shell-f-${Math.random().toString(36).slice(2, 9)}`;

export interface LabelledToggleOptions {
  checked?: boolean;
  /** The sentence under the row: what turning it on does. */
  hint?: FieldHint;
  /** An option that only means something while the row above it is set (Patterpad's "Embed source
   *  language for debug" under an IDs-only build): indented under that row with a rule, so it reads as
   *  belonging to it rather than as a peer. */
  sub?: boolean;
  disabled?: boolean;
  /** Fired on every flip, with the new state. The input is handed back too, for a caller that reads it
   *  on Save instead. */
  onChange?: (checked: boolean) => void;
}

/**
 * The settings toggle, `labelled`'s partner (ruling C): the caption on the left, the checkbox beside it
 * where any other row has its control, and the optional hint under the row. One shape in both apps, so
 * a switch in one app's settings looks like a switch in the other's. Clicking the caption flips it, as
 * the label is the checkbox's.
 *
 * Returns the outermost row (to append, hide, or indent) and the input (to read or listen to).
 */
export function labelledToggle(label: string, opts: LabelledToggleOptions = {}): { row: HTMLElement; input: HTMLInputElement } {
  const input = el("input", "shell-toggle-input");
  input.type = "checkbox";
  input.checked = opts.checked ?? false;
  input.disabled = opts.disabled ?? false;
  const { onChange } = opts;
  if (onChange) input.addEventListener("change", () => onChange(input.checked));
  const row = labelled(label, input, opts.hint);
  // On the caption-and-box line itself, whether or not a hint wraps it.
  (row.matches(".shell-labelled") ? row : row.querySelector(".shell-labelled"))?.classList.add("shell-toggle");
  if (opts.sub) row.classList.add("shell-suboption");
  return { row, input };
}

/** Swap item `i` with its neighbour `i + delta` IN PLACE (the up/down reorder list editors share);
 *  a no-op when the target is out of range. Returns whether anything moved. */
export function moveItem<T>(arr: T[], i: number, delta: number): boolean {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  return true;
}

/** The icon size inside a chip's remove / move buttons: the chip is set at
 *  0.76rem, so its controls draw smaller than a toolbar button's 14px. */
const CHIP_ICON = 10;

/** A tag-style editor for a string-list field (an enum's allowed values / flags): removable chips + an
 *  add input (Enter or "," commits; blank / duplicate ignored). Mutates `holder.values` in place (read
 *  back on save). `onChange` fires after any add / remove so callers can refresh a dependent control. */
export function tagChips(holder: { values?: string[] }, onChange?: () => void): HTMLElement {
  const wrap = el("div", "shell-tags");
  const input = el("input", "shell-tag-input");
  // Sentence-cased like every other hint (the microcopy ruling, 2026-08-28):
  // lowercase fragments read as adrift, and a placeholder is a hint speaking.
  input.type = "text"; input.placeholder = "Add value"; input.spellcheck = false;
  const makeChip = (v: string): HTMLElement => {
    const chip = el("span", "shell-tag", v);
    const x = el("button", "shell-tag-x", iconNode("close", CHIP_ICON));
    x.type = "button"; x.dataset["tip"] = `Remove ${v}`; x.setAttribute("aria-label", `Remove ${v}`);
    x.addEventListener("click", () => { holder.values = (holder.values ?? []).filter((o) => o !== v); chip.remove(); onChange?.(); });
    chip.append(x);
    return chip;
  };
  const commit = (): void => {
    const v = input.value.trim();
    if (v && !(holder.values ?? []).includes(v)) { (holder.values ??= []).push(v); wrap.insertBefore(makeChip(v), input); onChange?.(); }
    input.value = "";
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } });
  input.addEventListener("blur", commit);
  for (const v of holder.values ?? []) wrap.append(makeChip(v));
  wrap.append(input);
  return wrap;
}

/**
 * An ORDERED chips editor for a string-list field whose order means something
 * (a quality's stages: `advance()` walks them, so 2 comes after 1): numbered
 * chips, each with move-earlier / move-later / remove, plus an add input
 * (Enter or "," commits; blank / duplicate ignored). Mutates `holder.stages`
 * in place; `onChange` fires after any add / move / remove.
 *
 * Patterpad's, lifted (ui-review-2026-09, finding 3); Storyletter had been
 * faking it with `tagChips` over a `values` holder, which loses the order
 * controls. Same class family as `tagChips` (`.shell-tags`), so it is styled by
 * settings.css already.
 */
export function stageChips(holder: { stages?: string[] }, onChange?: () => void): HTMLElement {
  const wrap = el("div", "shell-tags shell-stages");
  const input = el("input", "shell-tag-input");
  input.type = "text"; input.placeholder = "Add stage"; input.spellcheck = false;
  const control = (name: IconName, tip: string, disabled: boolean, onClick: () => void): HTMLButtonElement => {
    const b = el("button", "shell-tag-x shell-tag-move", iconNode(name, CHIP_ICON));
    b.type = "button"; b.dataset["tip"] = tip; b.setAttribute("aria-label", tip);
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    return b;
  };
  const rebuild = (): void => {
    for (const c of Array.from(wrap.children)) if (c !== input) c.remove();
    const stages = holder.stages ?? [];
    stages.forEach((v, i) => {
      const chip = el("span", "shell-tag", `${i + 1}. ${v}`);
      chip.dataset["stage"] = v;
      chip.append(
        control("back", `Move ${v} earlier`, i === 0,
          () => { if (moveItem(stages, i, -1)) { rebuild(); onChange?.(); } }),
        control("forward", `Move ${v} later`, i === stages.length - 1,
          () => { if (moveItem(stages, i, 1)) { rebuild(); onChange?.(); } }),
      );
      const x = el("button", "shell-tag-x", iconNode("close", CHIP_ICON));
      x.type = "button"; x.dataset["tip"] = `Remove ${v}`; x.setAttribute("aria-label", `Remove ${v}`);
      x.addEventListener("click", () => { holder.stages = (holder.stages ?? []).filter((o) => o !== v); rebuild(); onChange?.(); });
      chip.append(x);
      wrap.insertBefore(chip, input);
    });
  };
  const commit = (): void => {
    const v = input.value.trim();
    if (v && !(holder.stages ?? []).includes(v)) { (holder.stages ??= []).push(v); rebuild(); onChange?.(); }
    input.value = "";
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } });
  input.addEventListener("blur", commit);
  wrap.append(input);
  rebuild();
  return wrap;
}

// --- drag-to-reorder ---------------------------------------------------------
// One drag at a time per window, shared across every wired list, so the
// midpoint test knows what is being carried without a dataTransfer round trip.
let reorderDragId: string | null = null;
const clearDropMarks = (host: ParentNode): void =>
  host.querySelectorAll(".drop-before, .drop-after").forEach((e) => e.classList.remove("drop-before", "drop-after"));

/**
 * Make `el` a drag source and a drop target for HTML5 drag-to-reorder among
 * its siblings. While carried it wears `.dragging`; a hovered target wears
 * `.drop-before` or `.drop-after` by the midpoint test on `axis` ("y" for
 * rows, "x" for a wrapping grid); a drop calls `onMove(draggedId, before,
 * targetId)` and the caller reorders its model and re-renders.
 *
 * Storyletter's `wireCardDrag`, lifted (ui-review-2026-09, finding 30);
 * Patterpad's `wireSceneDrag` is the same idea fixed on "y". The marks are
 * classes only: the app draws them (Patterpad's `box-shadow: 0 -2px 0 0
 * var(--accent)` pair is the family's look).
 */
export function wireReorder(el: HTMLElement, id: string, axis: "x" | "y", onMove: (id: string, before: boolean, targetId: string) => void): void {
  el.draggable = true;
  el.dataset["reorderId"] = id;
  const host = (): ParentNode => el.parentElement ?? el;
  el.addEventListener("dragstart", (e) => {
    reorderDragId = id; el.classList.add("dragging");
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }
  });
  el.addEventListener("dragend", () => { reorderDragId = null; el.classList.remove("dragging"); clearDropMarks(host()); });
  el.addEventListener("dragover", (e) => {
    if (!reorderDragId || reorderDragId === id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const r = el.getBoundingClientRect();
    const before = axis === "y" ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
    clearDropMarks(host());
    el.classList.add(before ? "drop-before" : "drop-after");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-before", "drop-after"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const before = el.classList.contains("drop-before");
    clearDropMarks(host());
    if (reorderDragId && reorderDragId !== id) onMove(reorderDragId, before, id);
  });
}

// --- metadata and breadcrumbs ---------------------------------------------------
// "Icons are drawn, and so are separators" (design-language.md section 4,
// 2026-09-16): metadata is never joined with "·" and a breadcrumb is never a
// string with "›" in it. Both apps had been building exactly those strings
// (ui-review-2026-09, marker A); these two helpers make the same lines as DOM,
// with the separator drawn by CSS (controls.css) or by the icon vocabulary.

/**
 * A metadata line: `parts` as spans in a flex row, separated by a drawn
 * 3px disc (a `::before` on every part after the first, in controls.css),
 * so `metaLine(["6 runs", "200 max steps", "seed 4"])` is what
 * "6 runs · 200 max steps · seed 4" used to be, without the typed dot.
 * Empty, null and undefined parts are skipped, so a caller can pass an
 * optional segment without branching.
 */
export function metaLine(parts: (string | Node | null | undefined)[]): HTMLElement {
  const row = el("span", "shell-meta");
  for (const part of parts) {
    if (part === null || part === undefined || part === "") continue;
    const seg = el("span", "shell-meta-part");
    seg.append(part);
    row.append(seg);
  }
  return row;
}

export interface Crumb {
  label: string;
  /** Makes the crumb a button. Ignored on the last crumb, which is where the
   *  reader already is. */
  onClick?: (event: MouseEvent) => void;
}

/**
 * A breadcrumb trail: each crumb a span, or a button when it carries
 * `onClick` and is not the last, with `iconNode("forward", 12)` drawn between
 * them. `breadcrumb(["Box", "Deck", "Card"])` is what "Box › Deck › Card"
 * used to be; the chevrons are the family's own drawing, not a symbol-font
 * character.
 */
export function breadcrumb(parts: (string | Crumb)[]): HTMLElement {
  const trail = el("nav", "shell-crumbs");
  trail.setAttribute("aria-label", "Where this is");
  parts.forEach((part, i) => {
    const crumb: Crumb = typeof part === "string" ? { label: part } : part;
    const last = i === parts.length - 1;
    if (i > 0) {
      const sep = iconNode("forward", 12);
      sep.classList.add("shell-crumb-sep");
      trail.append(sep);
    }
    if (crumb.onClick && !last) {
      const b = el("button", { className: "shell-crumb shell-crumb-link", text: crumb.label, onClick: crumb.onClick });
      b.type = "button";
      trail.append(b);
    } else {
      const s = el("span", "shell-crumb", crumb.label);
      if (last) s.setAttribute("aria-current", "location");
      trail.append(s);
    }
  });
  return trail;
}
