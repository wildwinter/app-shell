// The floating-layer lifecycle (floating.ts): where the element lands.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createFloating } from "../src/floating.js";

afterEach(() => { document.body.replaceChildren(); });

describe("createFloating", () => {
  it("appends to <body> by default, hidden", () => {
    const f = createFloating("popup");
    expect(f.el.parentElement).toBe(document.body);
    expect(f.el.style.display).toBe("none");
    expect(f.isOpen()).toBe(false);
  });

  it("appends to the host given, so a popup inside a modal dialog is not inert under it", () => {
    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    const f = createFloating("popup", { host: dialog });
    expect(f.el.parentElement).toBe(dialog);
    f.show(() => {});
    expect(f.isOpen()).toBe(true);
    expect(dialog.contains(f.el)).toBe(true);
  });
});
