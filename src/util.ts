// ---------------------------------------------------------------------------
// The small idioms both apps wrote by hand and never gave a name: the plural
// suffix (about forty sites), the debounce (eight copies), "is the focus in a
// field" (four copies that disagreed about <select>), the count with grouping
// separators, clipboard copy with the `.copied` revert (three timings), and
// relative time (two wordings). One answer each, here.
//
// DOM-free except where the idiom is about the DOM (isEditableTarget,
// copyWithFeedback), so main-process code can import the rest.
// ---------------------------------------------------------------------------

/** "1 link" / "3 links". The plural form defaults to `noun + "s"`; pass the
 *  irregular one ("entry", "entries") when that is wrong. */
export function plural(n: number, noun: string, pluralForm = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : pluralForm}`;
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drop the pending call. */
  cancel(): void;
  /** Run the pending call now, if there is one. */
  flush(): void;
}

/** Trailing-edge debounce: the call runs `ms` after the LAST call. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const run = (): void => {
    timer = undefined;
    if (pending === undefined) return;
    const args = pending;
    pending = undefined;
    fn(...args);
  };
  const debounced = ((...args: A): void => {
    pending = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, ms);
  }) as Debounced<A>;
  debounced.cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; pending = undefined; };
  debounced.flush = () => { if (timer !== undefined) clearTimeout(timer); run(); };
  return debounced;
}

/**
 * Is the keyboard's focus in a field? The one agreed answer: an input, a
 * textarea, a select, or anything contenteditable (the attribute is read as
 * well as `isContentEditable`, which jsdom does not implement). A window-level
 * shortcut checks this before acting, so a bare letter typed into a field
 * stays a letter.
 */
export function isEditableTarget(t: EventTarget | null | undefined): boolean {
  if (!(t instanceof Element)) return false;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLElement && t.isContentEditable === true) return true;
  const attr = t.getAttribute("contenteditable");
  return attr !== null && attr !== "false";
}

/** A count for reading: grouping separators in the user's locale. */
export function formatCount(n: number): string {
  return n.toLocaleString();
}

const copyTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/**
 * Copy `text` to the clipboard and light `el` with `.copied` for `ms` (the
 * family's 1000). A second click restarts the timer rather than stacking a
 * second revert under the first. Resolves when the clipboard write has.
 */
export function copyWithFeedback(el: Element, text: string, ms = 1000): Promise<void> {
  const write = typeof navigator !== "undefined" && navigator.clipboard
    ? navigator.clipboard.writeText(text).catch(() => {})
    : Promise.resolve();
  el.classList.add("copied");
  const prior = copyTimers.get(el);
  if (prior !== undefined) clearTimeout(prior);
  copyTimers.set(el, setTimeout(() => { el.classList.remove("copied"); copyTimers.delete(el); }, ms));
  return write;
}

/**
 * How long ago, in one wording: "just now", "4 minutes ago", "an hour ago",
 * "3 hours ago", "yesterday", "5 days ago", and past a week the date itself.
 * Coarse on purpose: the question a reader has is whether the thing is from
 * this sitting, not how many seconds ago it was. A future date is "just now".
 */
export function relativeTime(date: Date | number | string, now: number = Date.now()): string {
  const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${plural(mins, "minute")} ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "an hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
