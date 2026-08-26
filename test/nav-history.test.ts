// Navigation history (nav-history.ts). The promises pinned here are the
// browser model the family agreed to: visit records what you LEAVE, going
// back then navigating anew abandons the forward branch, same-document
// visits coalesce, and a stale entry is discarded on the way past rather
// than restored or smuggled to the other side.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createNavHistory, historyNav } from "../src/nav-history.js";
import { GO_MENU } from "../src/menu.js";

interface P { doc: string; tab?: string }
const h = (usable?: (p: P) => boolean) =>
  createNavHistory<P>({ same: (a, b) => a.doc === b.doc, ...(usable ? { usable } : {}) });

describe("the stack", () => {
  it("goes back through what was visited, newest first", () => {
    const nav = h();
    nav.visit({ doc: "a" });
    nav.visit({ doc: "b" });
    expect(nav.back({ doc: "c" })).toEqual({ doc: "b" });
    expect(nav.back({ doc: "b" })).toEqual({ doc: "a" });
    expect(nav.back({ doc: "a" })).toBeUndefined();
  });

  it("forward retraces a back, and the exchange loses nothing", () => {
    const nav = h();
    nav.visit({ doc: "a" });
    const there = nav.back({ doc: "b" })!;
    expect(there).toEqual({ doc: "a" });
    expect(nav.canForward()).toBe(true);
    expect(nav.forward(there)).toEqual({ doc: "b" });
    expect(nav.canForward()).toBe(false);
    expect(nav.canBack()).toBe(true);
  });

  it("navigating anew after going back abandons the forward branch", () => {
    const nav = h();
    nav.visit({ doc: "a" });
    nav.back({ doc: "b" });
    nav.visit({ doc: "a" });     // leaving a for somewhere new
    expect(nav.canForward()).toBe(false);
  });

  it("coalesces same-document visits, keeping the freshest", () => {
    const nav = h();
    nav.visit({ doc: "a", tab: "cards" });
    nav.visit({ doc: "a", tab: "dealing" });   // a tab switch is not a journey
    expect(nav.back({ doc: "b" })).toEqual({ doc: "a", tab: "dealing" });
    expect(nav.canBack()).toBe(false);
  });

  it("discards a stale entry on the way past, without restoring it", () => {
    const nav = h((p) => p.doc !== "gone");
    nav.visit({ doc: "a" });
    nav.visit({ doc: "gone" });
    expect(nav.back({ doc: "c" })).toEqual({ doc: "a" });
    // and the discard did not leak onto the forward side
    expect(nav.forward({ doc: "a" })).toEqual({ doc: "c" });
    expect(nav.forward({ doc: "c" })).toBeUndefined();
  });

  it("caps the past instead of growing forever", () => {
    const nav = createNavHistory<P>({ same: (a, b) => a.doc === b.doc, cap: 3 });
    for (const d of ["a", "b", "c", "d", "e"]) nav.visit({ doc: d });
    expect(nav.back({ doc: "f" })).toEqual({ doc: "e" });
    expect(nav.back({ doc: "e" })).toEqual({ doc: "d" });
    expect(nav.back({ doc: "d" })).toEqual({ doc: "c" });
    expect(nav.back({ doc: "c" })).toBeUndefined();   // a and b aged off
  });
});

describe("the arrows", () => {
  it("greys each side by what set() says, and clicks call through", () => {
    let went = "";
    const pair = historyNav(() => { went = "back"; }, () => { went = "forward"; });
    const [back, forward] = [...pair.el.querySelectorAll("button")];
    pair.set(true, false);
    expect(back!.disabled).toBe(false);
    expect(forward!.disabled).toBe(true);
    back!.click();
    expect(went).toBe("back");
    pair.set(false, true);
    forward!.click();
    expect(went).toBe("forward");
  });
});

describe("the shared labels", () => {
  it("spells Back and Forward one way, split by platform", () => {
    expect(GO_MENU.back).toEqual({ label: "Back", acceleratorMac: "Ctrl+Cmd+Left", acceleratorOther: "Alt+Left" });
    expect(GO_MENU.forward).toEqual({ label: "Forward", acceleratorMac: "Ctrl+Cmd+Right", acceleratorOther: "Alt+Right" });
  });
});
