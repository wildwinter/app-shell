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
import { icon } from "./icons.js";

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

/** A small square glyph button (the move/delete controls list editors share).
 *  Its rollover is the THEMED one (`data-tip`), so an app that has called
 *  `initTooltips()` gets our bubble rather than the platform's. */
export function iconBtn(glyph: string, title: string, onClick: () => void, disabled = false, danger = false): HTMLButtonElement {
  const b = el("button", `shell-icon${danger ? " danger" : ""}`);
  b.type = "button"; b.textContent = glyph; b.dataset["tip"] = title; b.setAttribute("aria-label", title);
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

/**
 * A captioned field: `<label class="shell-labelled"><span class="shell-fieldcap">…</span>control</label>`.
 *
 * The label is pointed at the field it captions, EXPLICITLY, and never at a button. A `<label>` with no
 * `for` forwards a click to its first labelable descendant, and buttons are labelable - so a caption
 * wrapped around a control containing buttons (`tagChips`, whose every chip carries a remove button)
 * turns every click on the row's dead space into a press of the FIRST button in it. That shipped:
 * patterkit/patter#44, where clicking a Game Data list value anywhere but its ✕ deleted the first value
 * in the list. Reported as "clicking a value removes the wrong one", which is not a wrong-index bug at
 * all - the click never reached the chip.
 *
 * When the control holds no labelable field (a chips editor with the add input removed, say), this is a
 * plain `<div>`: no caption behaviour is better than a caption that presses something.
 */
export function labelled(label: string, control: HTMLElement): HTMLElement {
  const target = control.matches("input, select, textarea")
    ? control
    : control.querySelector<HTMLElement>("input:not([type=button]):not([type=submit]), select, textarea");
  const w = el(target ? "label" : "div", "shell-labelled");
  w.append(el("span", "shell-fieldcap", label), control);
  if (target) {
    if (!target.id) target.id = `shell-f-${Math.random().toString(36).slice(2, 9)}`;
    (w as HTMLLabelElement).htmlFor = target.id;
  }
  return w;
}

/** Swap item `i` with its neighbour `i + delta` IN PLACE (the up/down reorder list editors share);
 *  a no-op when the target is out of range. Returns whether anything moved. */
export function moveItem<T>(arr: T[], i: number, delta: number): boolean {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  return true;
}

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
    const x = el("button", "shell-tag-x", icon.close);
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
  const control = (glyph: string, tip: string, disabled: boolean, onClick: () => void): HTMLButtonElement => {
    const b = el("button", "shell-tag-x shell-tag-move", glyph);
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
        control(icon.back, `Move ${v} earlier`, i === 0,
          () => { if (moveItem(stages, i, -1)) { rebuild(); onChange?.(); } }),
        control(icon.forward, `Move ${v} later`, i === stages.length - 1,
          () => { if (moveItem(stages, i, 1)) { rebuild(); onChange?.(); } }),
      );
      const x = el("button", "shell-tag-x", icon.close);
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
