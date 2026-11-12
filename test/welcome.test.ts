// The welcome (welcome.ts): its two states (a first run, and with recents),
// and the drag region with its opt-outs in welcome.css.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mountWelcome } from "../src/welcome.js";

afterEach(() => document.body.replaceChildren());

describe("mountWelcome", () => {
  const acts = (open = vi.fn(), create = vi.fn()) => ({ open: { label: "Open a project…", onClick: open }, create: { label: "New project…", onClick: create } });
  const tour = (onClick = vi.fn()) => ({ label: "Take the tour", prompt: "New to Patter?", onClick });
  const buttons = (root: HTMLElement): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>(".welcome-actions .btn")];
  const primary = (root: HTMLElement): string[] => buttons(root).filter((b) => b.classList.contains("primary")).map((b) => b.textContent!);

  it("on a first run: the mark, the title and its line, then the tour (the accent), New, and Open, and nothing else", () => {
    const go = vi.fn();
    const mark = document.createElement("svg-mark");
    const host = document.createElement("div");
    const w = mountWelcome(host, { title: "Patterpad", sub: "Write the script.", ...acts(), tour: tour(go), mark, recents: [] });
    expect(host.firstElementChild).toBe(w.el);
    expect(w.el.classList.contains("first-run")).toBe(true);
    expect(w.el.querySelector(".welcome-mark")?.firstElementChild).toBe(mark);
    expect(w.el.querySelector(".welcome-title")?.textContent).toBe("Patterpad");
    expect(w.el.querySelector(".welcome-sub")?.textContent).toBe("Write the script.");
    expect(buttons(w.el).map((b) => b.textContent)).toEqual(["Take the tour", "New project…", "Open a project…"]);
    expect(primary(w.el)).toEqual(["Take the tour"]);
    buttons(w.el)[0]!.click();
    expect(go).toHaveBeenCalledOnce();
    expect(w.el.querySelector(".welcome-recents")).toBeNull();
    expect(w.el.querySelector(".welcome-line")).toBeNull();
    expect(w.el.querySelector<HTMLElement>(".welcome-error")?.hidden).toBe(true);
  });

  it("on a first run with no tour, New is the accent", () => {
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", ...acts(), recents: [] });
    expect(buttons(w.el).map((b) => b.textContent)).toEqual(["New project…", "Open a project…"]);
    expect(primary(w.el)).toEqual(["New project…"]);
  });

  it("with recents: Open (the accent) and New, the names with the folder as rollover, and the tour as a line", () => {
    const recent = vi.fn(), go = vi.fn();
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", ...acts(), tour: tour(go),
      recents: [{ name: "Tavern", path: "/home/me/tavern.patter", onOpen: recent }] });
    expect(w.el.classList.contains("first-run")).toBe(false);
    expect(buttons(w.el).map((b) => b.textContent)).toEqual(["Open a project…", "New project…"]);
    expect(primary(w.el)).toEqual(["Open a project…"]);
    const list = w.el.querySelector(".welcome-recents")!;
    expect(list.getAttribute("aria-label")).toBe("Recent projects");
    expect(w.el.querySelector(".welcome-caption")).toBeNull();
    const row = list.querySelector<HTMLButtonElement>(".welcome-recent")!;
    expect(row.textContent).toBe("Tavern");
    expect(row.dataset["tip"]).toBe("/home/me/tavern.patter");
    row.click();
    expect(recent).toHaveBeenCalledOnce();
    const line = w.el.querySelector(".welcome-line")!;
    expect(line.textContent).toBe("New to Patter? Take the tour");
    line.querySelector("button")!.click();
    expect(go).toHaveBeenCalledOnce();
  });

  it("shows the folder under a name only when two names in the list match", () => {
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", ...acts(), recents: [
      { name: "Tavern", path: "/a/tavern.patter", onOpen: () => {} },
      { name: "Heist", path: "/heist.patter", onOpen: () => {} },
      { name: "Tavern", path: "/b/tavern.patter", onOpen: () => {} }] });
    const rows = [...w.el.querySelectorAll<HTMLElement>(".welcome-recent")];
    expect(rows.map((r) => r.querySelector(".welcome-recent-path")?.textContent ?? null)).toEqual(["/a/tavern.patter", null, "/b/tavern.patter"]);
    expect(rows[1]!.dataset["tip"]).toBe("/heist.patter");
  });

  it("setRecents moves between the two states", () => {
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", ...acts(), tour: tour(), recents: [] });
    w.setRecents([{ name: "A", path: "/a", onOpen: () => {} }, { name: "B", path: "/b", onOpen: () => {} }]);
    expect(w.el.querySelectorAll(".welcome-recent").length).toBe(2);
    expect(primary(w.el)).toEqual(["Open a project…"]);
    w.setRecents([]);
    expect(w.el.querySelector(".welcome-recents")).toBeNull();
    expect(primary(w.el)).toEqual(["Take the tour"]);
  });

  it("caps the recents at five by default", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, path: `/p${i}`, onOpen: () => {} }));
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", ...acts(), recents: many });
    expect(w.el.querySelectorAll(".welcome-recent").length).toBe(5);
  });

  it("shows and clears the error line", () => {
    const w = mountWelcome(document.createElement("div"), { title: "T", sub: "S", ...acts(), recents: [], error: "It moved." });
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
