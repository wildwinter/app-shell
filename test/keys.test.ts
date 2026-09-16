// Keyboard hints from one helper: the platform spelling of a combo, the
// keycap DOM, the hint bar with nothing typed between its items, and the
// bracketed tooltip key.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { keyLabel, keyLegends, keyHint, hintBar, tipWithKey, isKeyCombo, keyPlatform, setKeyPlatform } from "../src/keys.js";

afterEach(() => { setKeyPlatform(undefined); document.body.replaceChildren(); });

describe("keyLabel", () => {
  it("writes Apple's glyphs, in Apple's order, with no joiner on a Mac", () => {
    expect(keyLabel("Mod+1", "mac")).toBe("⌘1");
    expect(keyLabel("Mod+Shift+M", "mac")).toBe("⇧⌘M");
    expect(keyLabel("Shift+Mod+m", "mac")).toBe("⇧⌘M");
    expect(keyLabel("Ctrl+Alt+Shift+Mod+K", "mac")).toBe("⌃⌥⇧⌘K");
    expect(keyLabel("Enter", "mac")).toBe("↩");
    expect(keyLabel("Esc", "mac")).toBe("esc");
    expect(keyLabel("Up", "mac")).toBe("↑");
    expect(keyLabel("Backspace", "mac")).toBe("⌫");
    expect(keyLabel("Mod+[", "mac")).toBe("⌘[");
    expect(keyLabel("Mod+Alt+F", "mac")).toBe("⌥⌘F");
  });

  it("spells the words out with + elsewhere, and says Ctrl once", () => {
    expect(keyLabel("Mod+1", "win")).toBe("Ctrl+1");
    expect(keyLabel("Mod+Shift+M", "linux")).toBe("Ctrl+Shift+M");
    expect(keyLabel("Mod+Ctrl+S", "win")).toBe("Ctrl+S");
    expect(keyLabel("Enter", "win")).toBe("Enter");
    expect(keyLabel("Esc", "linux")).toBe("Esc");
    expect(keyLabel("Up", "win")).toBe("Up");
    expect(keyLabel("Backspace", "win")).toBe("Backspace");
    expect(keyLabel("Tab", "win")).toBe("Tab");
    expect(keyLabel("Mod+[", "win")).toBe("Ctrl+[");
  });

  it("takes the platform from the override when one is set, else detects one", () => {
    setKeyPlatform("mac");
    expect(keyPlatform()).toBe("mac");
    expect(keyLabel("Mod+F")).toBe("⌘F");
    setKeyPlatform("win");
    expect(keyLabel("Mod+F")).toBe("Ctrl+F");
    setKeyPlatform(undefined);
    expect(["mac", "win", "linux"]).toContain(keyPlatform());
  });

  it("lists one legend on a Mac and one per key elsewhere", () => {
    expect(keyLegends("Mod+Shift+M", "mac")).toEqual(["⇧⌘M"]);
    expect(keyLegends("Mod+Shift+M", "win")).toEqual(["Ctrl", "Shift", "M"]);
    expect(keyLegends("Esc", "win")).toEqual(["Esc"]);
  });
});

describe("keyHint", () => {
  it("is one keycap holding the glyph string on a Mac", () => {
    const k = keyHint("Mod+Shift+M", { platform: "mac" });
    expect(k.tagName).toBe("KBD");
    expect(k.className).toBe("shell-kbd");
    expect(k.textContent).toBe("⇧⌘M");
  });

  it("is one keycap per key elsewhere, side by side, with no typed joiner", () => {
    const k = keyHint("Mod+Shift+M", { platform: "win" });
    expect(k.className).toBe("shell-keys");
    const caps = [...k.querySelectorAll("kbd.shell-kbd")].map((c) => c.textContent);
    expect(caps).toEqual(["Ctrl", "Shift", "M"]);
    expect(k.textContent).not.toContain("+");
    expect(keyHint("Esc", { platform: "win" }).tagName).toBe("KBD");
  });

  it("draws space-separated alternatives as their own keycaps", () => {
    const k = keyHint("Up Down", { platform: "mac" });
    expect([...k.querySelectorAll("kbd")].map((c) => c.textContent)).toEqual(["↑", "↓"]);
  });
});

describe("hintBar", () => {
  it("builds the bar as keycaps and labels, nothing typed between items", () => {
    const bar = hintBar([
      { keys: "Up Down", label: "Move" },
      { keys: "Enter", label: "Jump" },
      { keys: "Esc", label: "Close" },
    ], { platform: "mac" });
    expect(bar.className).toBe("shell-hintbar");
    const items = [...bar.querySelectorAll(".shell-hint")];
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.querySelector(".shell-hint-label")?.textContent)).toEqual(["Move", "Jump", "Close"]);
    expect(items[1]?.querySelector("kbd")?.textContent).toBe("↩");
    expect(bar.textContent).not.toMatch(/[·|]/);
    // The keys only ever live inside keycaps.
    for (const glyph of ["↑", "↓", "↩", "esc"]) {
      expect(bar.querySelector(`kbd`)?.closest(".shell-hintbar")).toBe(bar);
      expect([...bar.querySelectorAll("kbd")].some((k) => k.textContent === glyph)).toBe(true);
    }
    expect(bar.querySelector("[title]")).toBeNull();
  });
});

describe("tipWithKey", () => {
  it("brackets the platform's spelling of the key", () => {
    expect(tipWithKey("Show scenes", "Mod+1", "mac")).toBe("Show scenes (⌘1)");
    expect(tipWithKey("Show scenes", "Mod+1", "win")).toBe("Show scenes (Ctrl+1)");
    expect(tipWithKey("Exit writing view", "Mod+Shift+M", "linux")).toBe("Exit writing view (Ctrl+Shift+M)");
  });
});

describe("isKeyCombo", () => {
  it("recognises the portable spelling, in any case", () => {
    for (const combo of ["Mod+1", "mod+1", "Mod+Shift+M", "Ctrl+Alt+Shift+K", "Shift+Enter", "Enter", "Esc", "Up", "Mod+[", "Mod++"]) {
      expect(isKeyCombo(combo), combo).toBe(true);
    }
  });

  it("leaves a literal hint alone, so a string that drew verbatim still does", () => {
    // "Cmd" and "Option" are aliases keyLabel tolerates, not the portable words:
    // a caller who wrote "Cmd+1" for 0.39.0 wrote a literal and gets it back.
    for (const literal of ["Cmd+1", "⌘1", "Ctrl+1 twice", "F1", "", "+", "Mod", "Mod+Shift", "Mod+1+2", "Option+Up"]) {
      expect(isKeyCombo(literal), literal || "(empty)").toBe(false);
    }
  });
});
