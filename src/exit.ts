// ---------------------------------------------------------------------------
// The exit half of the panel motion vocabulary.
//
// Enters are pure CSS: they run on insertion. Exits cannot be, because the node
// has to OUTLIVE the close for the animation to play and then be torn down. So
// every closing surface routes its teardown through here instead of removing
// itself directly.
//
// Patterpad's `closeWithExit`, lifted. It was already app-agnostic, and the
// shell had grown a second copy of the same twelve lines inside `confirm.ts`,
// which is the drift this package exists to stop: one motion vocabulary, drawn
// one way. `tokens.css` already carried the keyframes and the durations; this
// is the missing half that plays them.
// ---------------------------------------------------------------------------

/**
 * Play the close animation on `element`, then run `done` exactly once.
 *
 * `done` does the real teardown: remove the node, drop listeners, unmount
 * whatever was inside it. Under `prefers-reduced-motion` the duration reads 0
 * and `done` runs synchronously, so reduced motion means instant rather than
 * an invisible wait.
 */
export function closeWithExit(element: HTMLElement, done: () => void): void {
  element.classList.add("closing");
  // getComputedStyle flushes pending style, so this reflects the `.closing`
  // rule we just added rather than the state before it.
  const seconds = parseFloat(getComputedStyle(element).animationDuration) || 0;
  if (seconds === 0) { done(); return; }

  let fired = false;
  const finish = (): void => {
    if (fired) return;
    fired = true;
    element.removeEventListener("animationend", onEnd);
    clearTimeout(timer);
    done();
  };
  // Only OUR animation ending counts. Content inside the panel (rows, pills,
  // spinners) raises its own animationend, and an inner one firing first would
  // tear the panel down mid-fade.
  const onEnd = (e: AnimationEvent): void => { if (e.target === element) finish(); };
  element.addEventListener("animationend", onEnd);
  // Fallback: animationend is missed if the element is hidden or the animation
  // is interrupted, and a panel that never tears down is worse than an abrupt one.
  const timer = setTimeout(finish, seconds * 1000 + 120);
}
