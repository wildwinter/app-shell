// ---------------------------------------------------------------------------
// Typed value controls: how both apps show and set a value of a declared type.
//
// The first is the quality's. A quality is a step on a ladder, so its value is
// shown as the LADDER, with the current rung marked, rather than a dropdown that
// shows one name and hides where it stands (patterkit design/proposals/
// patter-qualities.md section 4). Storyletter's Board drew it this way first;
// it lives here so Storyletter's Fields tab, Patterpad's play panel and Game
// Data rows, and the play inspectors all draw the same strip.
//
// An UNSET value (a field or game-data value the node leaves out) names what it
// falls back to, "default (x)", by the family's one rule: the declaration's own
// default, else the type's (a quality's first stage). A value that is no longer
// a stage (a deleted one) is shown as such, so it can be put back on the ladder.
//
// No Electron, no app state: this module is DOM only, and is its own entry point
// (`@wildwinter/app-shell/value-control`) so a play inspector outside the apps
// can take it.
// ---------------------------------------------------------------------------

import { el, tagChips } from "./dom.js";

/** A declaration as these controls read it: a property's, a field's or a game-data field's. */
export interface ValueDeclLike {
  type: string;
  default?: unknown;
  /** enum / flags */
  values?: readonly string[];
  /** quality: the ladder, in order */
  stages?: readonly string[];
}

/**
 * What an unset value of `decl` falls back to, as the words a control shows: its own default where it has
 * one, else its type's (False, 0, the first value, no flags, the first stage, empty text). The kernel's
 * `defaultFor`, in words; a host reads the same value from the bundle.
 */
export function fallbackText(decl: ValueDeclLike): string {
  const d = decl.default;
  if (d !== undefined && d !== null) {
    if (typeof d === "boolean") return d ? "True" : "False";
    if (Array.isArray(d)) return d.length === 0 ? "none" : d.join(", ");
    return d === "" ? "none" : String(d);
  }
  switch (decl.type) {
    case "boolean": return "False";
    case "number": return "0";
    case "enum": return decl.values?.[0] ?? "none";
    case "quality": return decl.stages?.[0] ?? "first stage";
    case "flags": return "none";
    default: return "empty";
  }
}

/** The label an unset value shows: "default (x)", naming what it falls back to. */
export const defaultLabel = (decl: ValueDeclLike): string => `default (${fallbackText(decl)})`;

/**
 * The quiet line under a ladder that has just been reordered: how many gates order against it. A reorder
 * changes no value, and is the one edit that changes what a gate MEANS without saying so (patter-qualities.md
 * section 2), so the editor says so. Empty when no gate orders the quality.
 */
export function stageGateNote(gates: number): string {
  if (gates <= 0) return "";
  return gates === 1
    ? "1 gate compares against this ladder, and it now reads the new order."
    : `${gates} gates compare against this ladder, and each now reads the new order.`;
}

export interface RungStripOptions {
  /** The ladder, in order. */
  stages: readonly string[];
  /** The value held, or undefined when unset: a field or game-data value the node leaves out. */
  value: string | undefined;
  /** The declaration, for what an unset value falls back to (its default, else the first stage). */
  decl?: ValueDeclLike;
  /** Pick a stage. Absent: the strip is read-only. */
  onPick?: (stage: string) => void;
  /** Clear back to unset. With it, the strip leads with "default (x)", which clears the value. */
  onClear?: () => void;
  /** The rollover on a rung that is not the current one (default: `Set to "x"`). */
  pickTip?: (stage: string) => string;
  /**
   * The document to build in, for a host outside the apps (a play inspector in a page or a frame of its
   * own). Given, rollovers are plain `title`s and the family's themed tooltips are not mounted; the host
   * styles `.seg`, `.seg-opt` and `.shell-rung` itself. Absent: the apps' document and themed rollovers.
   */
  doc?: Document;
}

/**
 * A quality's value as its ladder: one rung per stage, in order, the current one marked (`on`). Unset, the
 * rung it falls back to is marked as the fallback (`fallback`), and with `onClear` a leading "default (x)"
 * option is the current choice. A value that is not a stage (a deleted one) is shown after the ladder,
 * marked `stray`, until a rung is picked.
 */
export function rungStrip(opts: RungStripOptions): HTMLElement {
  const make = opts.doc === undefined ? el : (tag: "span" | "button", props: { className: string; text?: string; tip?: string; onClick?: () => void }) => {
    const node = opts.doc!.createElement(tag);
    node.className = props.className;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.tip !== undefined) { node.title = props.tip; node.setAttribute("aria-label", props.tip); }
    if (props.onClick) node.addEventListener("click", props.onClick);
    if (tag === "button") (node as HTMLButtonElement).type = "button";
    return node;
  };
  const strip = make("span", { className: "seg shell-rungs" });
  const decl: ValueDeclLike = opts.decl ?? { type: "quality", stages: opts.stages };
  const unset = opts.value === undefined;
  const fallback = typeof decl.default === "string" && opts.stages.includes(decl.default) ? decl.default : opts.stages[0];
  const readOnly = opts.onPick === undefined;
  if (opts.onClear) {
    strip.append(make("button", {
      className: `seg-opt shell-rung shell-rung-default${unset ? " on" : ""}`, text: defaultLabel(decl),
      tip: unset ? "Not set here: the declared default holds" : "Clear the value, back to the default",
      onClick: () => { if (!unset) opts.onClear!(); },
    }));
  }
  for (const stage of opts.stages) {
    const current = opts.value === stage;
    const falls = unset && stage === fallback;
    const rung = make(readOnly ? "span" : "button", {
      className: `seg-opt shell-rung${current ? " on" : ""}${falls ? " fallback" : ""}`, text: stage,
      tip: current ? "The current stage" : falls ? "The stage it falls back to" : readOnly ? stage : (opts.pickTip?.(stage) ?? `Set to "${stage}"`),
      ...(readOnly ? {} : { onClick: () => { if (!current) opts.onPick!(stage); } }),
    });
    strip.append(rung);
  }
  if (!unset && !opts.stages.includes(opts.value!)) {
    strip.append(make("span", {
      className: "seg-opt shell-rung stray on", text: opts.value!,
      tip: `"${opts.value}" is not one of the stages: pick the one it belongs at now`,
    }));
  }
  return strip;
}

// ---------------------------------------------------------------------------
// The field row: ONE control for a node's value of a declared field, driven by
// the declared type, for the family's seven types (text, multiline, number,
// boolean, enum, flags, quality). Storyletter's card and outcome Fields and
// Patterpad's Game Data rows both draw it, which settles the disagreements the
// parity review found (patterkit design/family-parity-2026-10.md item 10):
//
// - the declared purpose is shown, under the control, not hidden in a rollover;
// - unset says what it falls back to, "default (x)", by `defaultLabel`;
// - flags are a picker of the declared values, not comma-separated text;
// - multiline is a text area;
// - a value the declaration refuses (not a number, not one of the values, not
//   a stage) is said under the control, and the app may add its own message;
// - text commits as typed, and Escape puts back what the field held when it
//   took focus (the family's field rule).
//
// Committing as typed means a host that redraws on every change (Patterpad's
// inspector rebuilds its whole stack) would drop the focus at every keystroke.
// `fieldRows()` is the answer: it hands back the SAME element for the same key
// across a redraw, updated in place, and gives the focus (and the caret) back
// to it once the redraw has put it in the page again.
// ---------------------------------------------------------------------------

/** A value a field row commits: a flags value is the list of names set. */
export type FieldValue = string | number | boolean | string[];

/** A field's declaration as the row reads it: a card field's, an outcome field's or a game-data field's. */
export interface FieldDeclLike extends ValueDeclLike {
  name: string;
  /** What the field is for, shown under the control. */
  purpose?: string;
}

export interface FieldRowOptions {
  decl: FieldDeclLike;
  /** The node's own value, typed (a flags value is a string list), or undefined where the node sets none. */
  value: unknown;
  /** Commit a value; `undefined` clears it, back to the default. Absent: the row is read-only. */
  onCommit?: (value: FieldValue | undefined) => void;
  /** Drawn but not editable, as when there is no node to write to. */
  disabled?: boolean;
  /** A message of the app's own about this value (a check the row cannot make), shown under the control. */
  problem?: string;
  /** The caption; default the field's name. */
  label?: string | Node;
  /** Added to the row and its caption, so a row sits in its app's layout. */
  className?: string;
  labelClassName?: string;
  /** The app's class for a text field or select, used instead of the shell's `.field`. */
  controlClassName?: string;
}

export interface FieldRowHandle {
  /** The row: its caption, then the control with the purpose and any message under it. */
  readonly el: HTMLElement;
  /** Redraw for a new value, declaration or message, keeping the element. A field being typed in keeps its
   *  text: what the author is typing is newer than what the app last stored. */
  update(opts: FieldRowOptions): void;
}

/** The type's fallback as a value, for a flags picker to start from when the node sets none. */
const fallbackFlags = (decl: ValueDeclLike): string[] => (Array.isArray(decl.default) ? decl.default.filter((v): v is string => typeof v === "string") : []);

/** What the row says about a value the declaration refuses, or "" when it fits. */
export function fieldValueProblem(decl: ValueDeclLike, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  switch (decl.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? "" : "Not a number.";
    case "boolean":
      return typeof value === "boolean" ? "" : "Not True or False.";
    case "enum":
      return decl.values && !decl.values.includes(String(value)) ? `"${String(value)}" is not one of the values.` : "";
    case "quality":
      return decl.stages && !decl.stages.includes(String(value)) ? `"${String(value)}" is not one of the stages.` : "";
    case "flags": {
      if (!Array.isArray(value)) return "Not a list of flags.";
      const strays = decl.values ? value.filter((v) => !decl.values!.includes(String(v))) : [];
      if (strays.length === 0) return "";
      return strays.length === 1 ? `"${String(strays[0])}" is not one of the values.` : `${strays.map((s) => `"${String(s)}"`).join(", ")} are not among the values.`;
    }
    default:
      return "";
  }
}

const isTextual = (type: string): boolean => type !== "boolean" && type !== "enum" && type !== "flags" && type !== "quality";

/** Everything that decides which control is drawn: a change here rebuilds it, anything else updates it. */
const controlShape = (o: FieldRowOptions): string => JSON.stringify([
  o.decl.type, o.decl.values ?? null, o.decl.stages ?? null, o.decl.default ?? null,
  o.onCommit === undefined, o.disabled === true, o.controlClassName ?? "",
  o.decl.type === "quality" && (o.decl.stages?.length ?? 0) === 0,
]);

/**
 * One declared field's value as a row: the caption, then the control the declared type calls for, with the
 * purpose and any message under it. See the section comment above for the rules it carries.
 */
export function fieldRow(initial: FieldRowOptions): FieldRowHandle {
  let opts = initial;
  const row = el("div", `shell-fieldrow${opts.className ? ` ${opts.className}` : ""}`);
  const caption = el("span", `shell-fieldrow-label${opts.labelClassName ? ` ${opts.labelClassName}` : ""}`);
  caption.id = `shell-fr-${Math.random().toString(36).slice(2, 9)}`;
  const body = el("div", "shell-fieldrow-body");
  const purpose = el("p", "shell-fieldrow-purpose");
  const problem = el("p", "shell-fieldrow-problem");
  problem.setAttribute("role", "status");
  row.append(caption, body);

  let shape = "";
  /** Redraw the control for the current value; set by whichever control is built. */
  let show: (value: unknown) => void = () => {};
  /** A local problem the control found while typing (a number that is not one yet). */
  let typing = "";

  const commit = (v: FieldValue | undefined): void => { opts.onCommit?.(v); };
  const editable = (): boolean => opts.onCommit !== undefined && opts.disabled !== true;
  // An app's own field class replaces the shell's `.field`, so its controls look like its other fields.
  const ctl = (base: string): string => (opts.controlClassName ? `${base.replace(/^field /, "")} ${opts.controlClassName}` : base);
  const labelledBy = (node: HTMLElement): void => {
    node.setAttribute("aria-labelledby", caption.id);
    const described = [purpose.id, problem.id].filter(Boolean).join(" ");
    if (described) node.setAttribute("aria-describedby", described);
  };
  purpose.id = `${caption.id}-p`; problem.id = `${caption.id}-m`;

  const sayProblem = (): void => {
    const words = [typing || fieldValueProblem(opts.decl, opts.value), opts.problem ?? ""].filter((w) => w !== "");
    problem.textContent = words.join(" ");
    problem.hidden = words.length === 0;
    row.classList.toggle("has-problem", words.length > 0);
    row.classList.toggle("shell-fieldrow-textual", isTextual(opts.decl.type));
  };

  const build = (): HTMLElement => {
    const decl = opts.decl;
    typing = "";
    if (decl.type === "quality" && (decl.stages?.length ?? 0) > 0) {
      const holder = el("span", "shell-fieldrow-rungs");
      show = (value) => {
        holder.replaceChildren(rungStrip({
          stages: decl.stages!, value: typeof value === "string" && value !== "" ? value : undefined, decl,
          ...(editable() ? { onPick: (stage: string) => { opts = { ...opts, value: stage }; show(stage); sayProblem(); commit(stage); }, onClear: () => { opts = { ...opts, value: undefined }; show(undefined); sayProblem(); commit(undefined); } } : {}),
        }));
        const strip = holder.firstElementChild as HTMLElement | null;
        if (strip) { strip.setAttribute("role", "group"); labelledBy(strip); }
      };
      return holder;
    }
    if (decl.type === "boolean" || decl.type === "enum") {
      const sel = el("select", ctl("field shell-fieldrow-select"));
      labelledBy(sel);
      sel.disabled = !editable();
      const choices: Array<[string, string]> = decl.type === "boolean"
        ? [["true", "True"], ["false", "False"]]
        : (decl.values ?? []).map((v): [string, string] => [v, v]);
      show = (value) => {
        const current = value === undefined || value === null || value === "" ? "" : String(value);
        sel.replaceChildren();
        const add = (v: string, label: string): void => { const o = el("option", undefined, label); o.value = v; sel.append(o); };
        add("", defaultLabel(decl));
        for (const [v, label] of choices) add(v, label);
        // A value the declaration no longer offers stays visible, so the author sees what is held.
        if (current !== "" && !choices.some(([v]) => v === current)) add(current, current);
        sel.value = current;
      };
      sel.addEventListener("change", () => {
        const raw = sel.value;
        const v: FieldValue | undefined = raw === "" ? undefined : decl.type === "boolean" ? raw === "true" : raw;
        opts = { ...opts, value: v }; sayProblem(); commit(v);
      });
      return sel;
    }
    if (decl.type === "flags" && (decl.values?.length ?? 0) > 0) {
      const holder = el("span", "shell-flags");
      holder.setAttribute("role", "group");
      labelledBy(holder);
      show = (value) => {
        const unset = !Array.isArray(value);
        const held = unset ? fallbackFlags(decl) : (value as unknown[]).map(String);
        holder.replaceChildren();
        const chip = (text: string, cls: string, pressed: boolean | undefined, tip: string, onClick?: () => void): void => {
          const b = el(onClick && editable() ? "button" : "span", { className: `shell-flag${cls}`, text, tip });
          b.setAttribute("aria-label", `${text}: ${tip}`);   // the tip alone would hide the value's name
          if (b instanceof HTMLButtonElement) { b.type = "button"; b.addEventListener("click", onClick!); }
          if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
          holder.append(b);
        };
        const set = (next: string[] | undefined): void => { opts = { ...opts, value: next }; show(next); sayProblem(); commit(next); };
        chip(defaultLabel(decl), ` shell-flag-default${unset ? " on" : ""}`, undefined,
          unset ? "Not set here: the declared default holds" : "Clear the value, back to the default",
          unset ? undefined : () => set(undefined));
        for (const v of decl.values!) {
          const on = held.includes(v);
          chip(v, `${on ? " on" : ""}${on && unset ? " fallback" : ""}`, on, on ? `Unset ${v}` : `Set ${v}`,
            () => set(on ? held.filter((x) => x !== v) : decl.values!.filter((x) => x === v || held.includes(x)).concat(held.filter((x) => !decl.values!.includes(x)))));
        }
        // A held value the declaration does not offer: shown, struck, and a click drops it.
        for (const v of held.filter((x) => !decl.values!.includes(x))) {
          chip(v, " stray on", true, `"${v}" is not one of the values: click to drop it`, () => set(held.filter((x) => x !== v)));
        }
      };
      return holder;
    }
    if (decl.type === "flags") {
      // No values declared to pick from: the shell's chip editor, each name typed.
      const holder = el("span", "shell-fieldrow-chips");
      show = (value) => {
        const box = { values: Array.isArray(value) ? (value as unknown[]).map(String) : [] };
        const chips = tagChips(box, () => {
          const next = box.values.length > 0 ? [...box.values] : undefined;
          opts = { ...opts, value: next }; sayProblem(); commit(next);
        });
        const input = chips.querySelector("input");
        if (input) { labelledBy(input); input.placeholder = Array.isArray(value) ? "Add value" : defaultLabel(decl); input.disabled = !editable(); }
        chips.querySelectorAll("button").forEach((b) => { (b as HTMLButtonElement).disabled = !editable(); });
        holder.replaceChildren(chips);
      };
      return holder;
    }
    // text, multiline, number, and any type the row does not know: typed, committed as typed.
    const multiline = decl.type === "multiline";
    const field = multiline ? el("textarea", ctl("field shell-fieldrow-text")) : el("input", ctl("field shell-fieldrow-text"));
    if (field instanceof HTMLInputElement) {
      field.type = "text";
      if (decl.type === "number") field.inputMode = "decimal";
    } else field.rows = 3;
    labelledBy(field);
    field.placeholder = defaultLabel(decl);
    field.disabled = !editable();
    const asText = (value: unknown): string =>
      value === undefined || value === null ? "" : Array.isArray(value) ? value.join(", ") : String(value);
    const read = (raw: string): { value?: FieldValue; bad?: string } => {
      if (raw.trim() === "") return {};
      if (decl.type !== "number") return { value: raw };
      const n = Number(raw.trim());
      return Number.isFinite(n) ? { value: n } : { bad: "Not a number." };
    };
    let atFocus = "";
    show = (value) => {
      // What the author is typing is newer than the stored value, so a focused field keeps its text.
      // So does one the author was in when a redraw took the row out of the page, until they leave it.
      if (field.ownerDocument.activeElement === field || keeper.restoring(field) || keeper.holds(row)) return;
      field.value = asText(value);
    };
    const take = (): void => {
      const r = read(field.value);
      typing = r.bad ?? "";
      if (r.bad === undefined) opts = { ...opts, value: r.value };
      sayProblem();
      if (r.bad === undefined) commit(r.value);
    };
    field.addEventListener("focus", () => { if (!keeper.restoring(field)) atFocus = field.value; });
    field.addEventListener("input", take);
    field.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key !== "Escape" || field.value === atFocus) return;
      field.value = atFocus;
      take();
    });
    return field;
  };

  const draw = (next: FieldRowOptions): void => {
    const decl = next.decl;
    const label = next.label ?? decl.name;
    if (typeof label === "string") caption.textContent = label; else caption.replaceChildren(label);
    caption.className = `shell-fieldrow-label${next.labelClassName ? ` ${next.labelClassName}` : ""}`;
    row.className = `shell-fieldrow${next.className ? ` ${next.className}` : ""}`;
    const nextShape = controlShape(next);
    opts = next;
    if (nextShape !== shape) {
      shape = nextShape;
      body.replaceChildren(build());
    }
    show(next.value);
    purpose.textContent = decl.purpose ?? "";
    if (decl.purpose) body.append(purpose); else purpose.remove();
    body.append(problem);
    sayProblem();
  };

  draw(initial);
  keeper.watch(row);
  return { el: row, update: draw };
}

// --- keeping the focus across a redraw -------------------------------------
//
// A host that rebuilds its view takes the row out of the page and puts it back.
// Taking a focused element out drops its focus, which is the same thing as
// the author losing their place mid-word. So a row remembers whether the
// author was in it, and where the caret was, and the cache gives both back
// once the row is in the page again (a microtask: after the host's redraw).

interface FocusMemo { field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; start: number | null; end: number | null }

const keeper = (() => {
  const memos = new WeakMap<HTMLElement, FocusMemo>();
  const restoringNow = new WeakSet<Element>();
  /** When each row was last handed back by the cache, to tell a move's late blur from the author's. */
  const redrawn = new WeakMap<HTMLElement, number>();
  const put = (row: HTMLElement): void => {
    const memo = memos.get(row);
    if (!memo) return;
    const doc = row.ownerDocument;
    const active = doc.activeElement;
    if (!row.isConnected || !memo.field.isConnected || !row.contains(memo.field)) return;
    if (active && active !== doc.body && !row.contains(active)) { memos.delete(row); return; }
    if (active === memo.field && memo.field.matches(":focus")) return;
    restoringNow.add(memo.field);
    try {
      memo.field.focus({ preventScroll: true });
      if (!(memo.field instanceof HTMLSelectElement) && memo.start !== null) memo.field.setSelectionRange(memo.start, memo.end ?? memo.start);
    } finally { restoringNow.delete(memo.field); }
  };
  return {
    watch(row: HTMLElement): void {
      const note = (e: Event): void => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)) return;
        const text = !(t instanceof HTMLSelectElement);
        memos.set(row, { field: t, start: text ? (t as HTMLInputElement).selectionStart : null, end: text ? (t as HTMLInputElement).selectionEnd : null });
      };
      row.addEventListener("focusin", note);
      row.addEventListener("input", note);
      row.addEventListener("keyup", note);
      row.addEventListener("mouseup", note);
      // A blur the author made (the row still in the page) forgets; one caused by the row leaving the page
      // does not, and is what the cache puts back. Chromium drops the focus of a moved element LATE: the
      // blur arrives after the redraw, the row already back in the page, so a blur to nowhere just after a
      // redraw is the move's, and the focus goes straight back.
      // Chromium may also fire that blur synchronously, as the host clears its view and before the cache
      // has handed the row back: so the decision waits for the microtask, by which time a row the redraw
      // asked for again is marked as redrawn since the blur.
      row.addEventListener("focusout", (e) => {
        const at = performance.now();
        const late = (e as FocusEvent).relatedTarget === null && at - (redrawn.get(row) ?? -Infinity) < 250;
        if (late && memos.has(row)) { queueMicrotask(() => put(row)); return; }
        queueMicrotask(() => {
          if ((redrawn.get(row) ?? -Infinity) >= at) { put(row); return; }
          if (row.isConnected && !row.contains(row.ownerDocument.activeElement)) memos.delete(row);
        });
      });
    },
    /** Give the focus back to the row, if the author was in it and has not gone anywhere else since. */
    restore(row: HTMLElement): void {
      if (!memos.has(row)) return;
      redrawn.set(row, performance.now());
      // At the microtask, not now: the event that caused the redraw may still note the caret.
      queueMicrotask(() => put(row));
    },
    restoring: (field: Element): boolean => restoringNow.has(field),
    /** Forget the row's focus if the author has since gone somewhere else (before the row is redrawn). */
    settle(row: HTMLElement): void {
      const active = row.ownerDocument.activeElement;
      if (active && active !== row.ownerDocument.body && !row.contains(active)) memos.delete(row);
    },
    /** The row the author is in (before a redraw takes it out). */
    holds: (row: HTMLElement): boolean => memos.has(row),
  };
})();

/**
 * The focus keeping `fieldRows` does, for a host (or a structured row) that keeps row elements itself: call
 * `settle` before it updates a row and `restore` once the row is back in the page.
 */
export const fieldRowFocus = {
  settle: (row: HTMLElement): void => keeper.settle(row),
  restore: (row: HTMLElement): void => keeper.restore(row),
};

export interface FieldRows {
  /**
   * The row for `key` (a node and a field, say `${nodeId}:${field}`): the same element as last time when
   * there was one, updated for these options, else a new one. A row the author was typing in gets its focus
   * and caret back once the redraw has put it in the page.
   */
  row(key: string, opts: FieldRowOptions): HTMLElement;
  /** Forget every row not asked for since the last sweep (call at the end of a redraw). */
  sweep(): void;
}

/** A cache of field rows for a host that redraws its whole view on every change. */
export function fieldRows(): FieldRows {
  const rows = new Map<string, { handle: FieldRowHandle; used: boolean }>();
  return {
    row(key, opts) {
      const had = rows.get(key);
      if (had) {
        had.used = true;
        keeper.settle(had.handle.el);
        had.handle.update(opts);
        keeper.restore(had.handle.el);
        return had.handle.el;
      }
      const handle = fieldRow(opts);
      rows.set(key, { handle, used: true });
      return handle.el;
    },
    sweep() {
      for (const [key, entry] of rows) { if (!entry.used) rows.delete(key); else entry.used = false; }
    },
  };
}
