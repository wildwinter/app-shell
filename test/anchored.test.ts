// The anchored panel (anchored.ts). The lifecycle rules here are all ones
// somebody hit as a bug, so they are pinned rather than left to a read-through.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { closeAnchoredPanel, openAnchoredPanel } from "../src/anchored.js";

const anchorEl = (): HTMLElement => {
  const a = document.createElement("button");
  document.body.append(a);
  return a;
};

afterEach(() => { closeAnchoredPanel(); document.body.replaceChildren(); });

describe("openAnchoredPanel", () => {
  it("re-opening on the SAME anchor toggles off and returns null", () => {
    const anchor = anchorEl();
    expect(openAnchoredPanel({ anchor, title: "One", width: 200 })).not.toBeNull();
    expect(openAnchoredPanel({ anchor, title: "One", width: 200 })).toBeNull();
    expect(document.querySelector(".shell-anchored")).toBeNull();
  });

  it("a DIFFERENT anchor swaps rather than stacking", () => {
    openAnchoredPanel({ anchor: anchorEl(), title: "One", width: 200 });
    openAnchoredPanel({ anchor: anchorEl(), title: "Two", width: 200 });
    // Only ever one on screen: that is what makes toggling meaningful.
    expect(document.querySelectorAll(".shell-anchored")).toHaveLength(1);
    expect(document.querySelector(".shell-anchored-title")?.textContent).toBe("Two");
  });

  it("runs onClose while the panel is STILL in the document", () => {
    // The ordering the exit motion exists for: onClose is where a caller
    // unmounts what it put in the body, so running it after removal (or before
    // the fade) leaves an empty panel animating out.
    let seenConnected = false;
    const panel = openAnchoredPanel({
      anchor: anchorEl(), title: "One", width: 200,
      onClose: () => { seenConnected = document.querySelector(".shell-anchored") !== null; },
    });
    panel?.close();
    expect(seenConnected).toBe(true);
    expect(document.querySelector(".shell-anchored")).toBeNull();
  });

  it("fires onClose exactly once however many times close is called", () => {
    let calls = 0;
    const panel = openAnchoredPanel({ anchor: anchorEl(), title: "One", width: 200, onClose: () => { calls += 1; } });
    panel?.close();
    panel?.close();
    closeAnchoredPanel();
    expect(calls).toBe(1);
  });

  it("closeAnchoredPanel closes whatever is open", () => {
    // The close-everything sweep a navigation or a re-render needs: a panel
    // anchored to an element that no longer exists would hang in the air.
    openAnchoredPanel({ anchor: anchorEl(), title: "One", width: 200 });
    closeAnchoredPanel();
    expect(document.querySelector(".shell-anchored")).toBeNull();
  });
});
