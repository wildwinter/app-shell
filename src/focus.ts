// ---------------------------------------------------------------------------
// Where keyboard focus can go. Two questions the frame keeps asking: "what is
// the first thing in here a Tab would reach?" (a pane being moved into) and
// "can this element take focus at all, even by script?" (somewhere to give
// focus back to when the thing that had it has gone).
//
// Read from the DOM alone, with no layout, so it answers the same in jsdom as
// in a window: an element under `inert` or `hidden`, or disabled, takes no
// focus; one with `tabindex="-1"` takes it from script but not from Tab.
// ---------------------------------------------------------------------------

const NATIVE = [
  "a[href]", "area[href]", "button", "input:not([type=hidden])", "select", "textarea", "iframe", "summary",
  "[contenteditable]:not([contenteditable=false])",
].join(", ");
const CANDIDATES = `${NATIVE}, [tabindex]`;

const blocked = (n: Element): boolean =>
  !n.isConnected
  || (n as HTMLButtonElement).disabled === true
  || n.closest("[inert], [hidden]") !== null;

/** Whether `n` can take focus, from script at least: natively focusable or
 *  given a `tabindex` (including -1), connected, and not disabled, inert or
 *  hidden. */
export function canTakeFocus(n: Element | null | undefined): n is HTMLElement {
  if (!(n instanceof HTMLElement) || blocked(n)) return false;
  return n.matches(CANDIDATES);
}

/** The first element inside `root` (never `root` itself) that Tab would
 *  reach, in document order: focusable and not `tabindex="-1"`. */
export function firstFocusable(root: ParentNode): HTMLElement | null {
  for (const n of root.querySelectorAll<HTMLElement>(CANDIDATES)) {
    if (n.tabIndex >= 0 && canTakeFocus(n)) return n;
  }
  return null;
}
