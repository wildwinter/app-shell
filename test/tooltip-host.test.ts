// Who MOUNTS the tooltip, and who gets the last word on its options.
//
// `data-tip` with nothing listening draws nothing at all - not the themed bubble, not the platform one -
// so a component that writes one mounts the renderer itself. The ordering that creates is the whole
// reason this file exists: a host's own `initTooltips({ suppressed })` may now land AFTER an implicit
// mount, and an early return would drop its options in silence.
//
// ONE module instance for the file, deliberately. `vi.resetModules()` gives a fresh module but does NOT
// remove the previous instance's listeners from the document, so two controllers end up live and the
// stale one paints a bubble the current one suppressed. The first test below therefore runs while
// nothing has mounted yet, and the rest build on it.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { el } from "../src/dom.js";
import { hideTip, initTooltips } from "../src/tooltip.js";

const SHOW_DELAY = 600; // longer than the module's own wait; the exact value is its business
const hover = (n: HTMLElement): void => { n.dispatchEvent(new Event("pointerover", { bubbles: true })); };
const shown = (): boolean => { const t = document.querySelector<HTMLElement>(".tooltip"); return !!t && !t.hidden; };
const tipButton = (): HTMLElement => {
  const b = el("button", { text: "Pin", tip: "Keep on top" });
  document.body.append(b);
  return b;
};

afterEach(() => { hideTip(); vi.useRealTimers(); document.body.querySelectorAll("button").forEach((n) => n.remove()); });

describe("a component that writes a tip mounts the renderer", () => {
  it("shows a tip although nothing has called initTooltips", () => {
    // FIRST in the file on purpose: this is the only moment nothing has mounted. The failure it
    // prevents is silent - before self-mounting, a window whose host forgot initTooltips had every
    // shell tip dead and nothing said so.
    vi.useFakeTimers();
    const b = tipButton();
    hover(b);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBe(true);
  });
});

describe("an explicit call is authoritative about options, whenever it lands", () => {
  it("suppression applies even though a component mounted first", () => {
    // THE BUG Storyletter caught before it shipped. `initTooltips` returned early once mounted, so a
    // host calling it second - which self-mounting makes the normal case - had its `suppressed` dropped.
    // In Patterpad that is "no tooltips in Writing View" quietly ceasing to hold.
    vi.useFakeTimers();
    initTooltips({ suppressed: () => true }); // the host, arriving after the component
    const b = tipButton();
    hover(b);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBe(false);
  });

  it("and a later call can lift it again", () => {
    vi.useFakeTimers();
    initTooltips({ suppressed: () => false });
    const b = tipButton();
    hover(b);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBe(true);
  });

  it("a component's bare mount does not clear a suppression the host set", () => {
    // Components call `initTooltips()` with no arguments precisely so they cannot claim the options.
    vi.useFakeTimers();
    initTooltips({ suppressed: () => true });
    const b = tipButton(); // the component mounts again, bare
    hover(b);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(shown()).toBe(false);
  });
});
