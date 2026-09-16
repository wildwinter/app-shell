// The welcome (welcome.ts): actions, the tour line, groups as rows, recents,
// and the drag region with its opt-outs in welcome.css.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mountWelcome } from "../src/welcome.js";

afterEach(() => document.body.replaceChildren());

describe("mountWelcome", () => {
  it("renders title, sub, actions (one primary), recents with name and path", () => {
    const open = vi.fn(), recent = vi.fn();
    const host = document.createElement("div");
    const w = mountWelcome(host, {
      title: "Patterpad", sub: "Write the script.",
      actions: [{ label: "Open a project…", onClick: open, primary: true }, { label: "New project…", onClick: () => {} }],
      recents: [{ name: "Tavern", path: "/home/me/tavern.patter", onOpen: recent }],
    });
    expect(host.firstElementChild).toBe(w.el);
    expect(w.el.classList.contains("welcome")).toBe(true);
    expect(w.el.querySelector(".welcome-title")?.textContent).toBe("Patterpad");
    expect(w.el.querySelector(".welcome-sub")?.textContent).toBe("Write the script.");
    const btns = [...w.el.querySelectorAll<HTMLButtonElement>(".welcome-actions .btn")];
    expect(btns.map((b) => b.textContent)).toEqual(["Open a project…", "New project…"]);
    expect(btns[0]?.classList.contains("primary")).toBe(true);
    expect(btns[1]?.classList.contains("primary")).toBe(false);
    btns[0]!.click();
    expect(open).toHaveBeenCalledOnce();
    expect(w.el.querySelector(".welcome-caption")?.textContent).toBe("Recent");
    const row = w.el.querySelector<HTMLButtonElement>(".welcome-recent")!;
    expect(row.querySelector(".welcome-recent-name")?.textContent).toBe("Tavern");
    expect(row.querySelector(".welcome-recent-path")?.textContent).toBe("/home/me/tavern.patter");
    row.click();
    expect(recent).toHaveBeenCalledOnce();
    expect(w.el.querySelector(".welcome-line")).toBeNull();
    expect(w.el.querySelector<HTMLElement>(".welcome-error")?.hidden).toBe(true);
  });

  it("hides the recents caption with no recents, and setRecents redraws", () => {
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", actions: [], recents: [] });
    expect(w.el.querySelector(".welcome-recents")).toBeNull();
    w.setRecents([{ name: "A", path: "/a", onOpen: () => {} }, { name: "B", path: "/b", onOpen: () => {} }]);
    expect(w.el.querySelectorAll(".welcome-recent").length).toBe(2);
    w.setRecents([]);
    expect(w.el.querySelector(".welcome-recents")).toBeNull();
  });

  it("caps the recents at five by default", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, path: `/p${i}`, onOpen: () => {} }));
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", actions: [], recents: many });
    expect(w.el.querySelectorAll(".welcome-recent").length).toBe(5);
  });

  it("draws groups as captioned lists of rows (name + hint), with the note, and the tour line", () => {
    const pick = vi.fn();
    const tour = document.createElement("p");
    tour.textContent = "New to Patter?";
    const w = mountWelcome(document.createElement("div"), {
      title: "T", sub: "S", actions: [], recents: [], tourLine: tour,
      groups: [{ caption: "Learn from a finished project", note: "Each opens as your own copy.",
        items: [{ name: "The Hamlet", hint: "Start here.", onOpen: pick }, { name: "The Village", onOpen: () => {} }] }],
    });
    expect(w.el.querySelector(".welcome-line")?.firstElementChild).toBe(tour);
    const group = w.el.querySelector(".welcome-group")!;
    const cap = group.querySelector(".welcome-caption")!;
    expect(cap.textContent).toBe("Learn from a finished project");
    expect(cap.classList.contains("overline")).toBe(false);
    expect(group.querySelector(".welcome-note")?.textContent).toBe("Each opens as your own copy.");
    const rows = [...group.querySelectorAll<HTMLButtonElement>(".welcome-item")];
    expect(rows.map((r) => r.querySelector(".welcome-item-name")?.textContent)).toEqual(["The Hamlet", "The Village"]);
    expect(rows[0]?.querySelector(".welcome-item-hint")?.textContent).toBe("Start here.");
    expect(rows[1]?.querySelector(".welcome-item-hint")).toBeNull();
    rows[0]!.click();
    expect(pick).toHaveBeenCalledOnce();
  });

  it("shows and clears the error line", () => {
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", actions: [], recents: [], error: "It moved." });
    const err = w.el.querySelector<HTMLElement>(".welcome-error")!;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe("It moved.");
    w.setError(undefined);
    expect(err.hidden).toBe(true);
  });

  it("is a drag region, with every control opted out, and no overline caption", () => {
    const css = readFileSync(join(process.cwd(), "src/welcome.css"), "utf8");
    expect(css).toMatch(/\.welcome\s*\{[^}]*-webkit-app-region:\s*drag/);
    expect(css).toMatch(/\.welcome :is\(button, input, select, a, \.no-drag\)\s*\{\s*-webkit-app-region:\s*no-drag/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
