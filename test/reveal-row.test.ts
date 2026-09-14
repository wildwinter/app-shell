// @vitest-environment jsdom
// "Go to definition" lands on the ROW, not only on the page: expandableRow
// stamps the name it was given, revealRow opens that row, centres it and
// lights it. Reported from Storyletter (2026-09-14); Patterpad's property
// lists are built from the same row.
import { afterEach, describe, expect, it, vi } from "vitest";
import { expandableRow, revealRow } from "../src/index.js";

const span = (): HTMLElement => document.createElement("span");

const list = (): HTMLElement => {
  const host = document.createElement("div");
  host.append(
    expandableRow({ line: [span()], details: [span()], name: "gold" }),
    expandableRow({ line: [span()], details: [span()], name: "mood" }),
    expandableRow({ line: [span()], name: "plain" }),
  );
  document.body.append(host);
  return host;
};

const rowNamed = (host: HTMLElement, name: string): HTMLElement =>
  [...host.querySelectorAll<HTMLElement>(".set-row")].find((r) => r.dataset.name === name)!;

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("expandableRow's name", () => {
  it("is stamped on the row when given, and absent when not", () => {
    expect(expandableRow({ line: [span()], name: "gold" }).dataset.name).toBe("gold");
    expect("name" in expandableRow({ line: [span()] }).dataset).toBe(false);
  });
});

describe("revealRow", () => {
  it("opens the named row, centres it and lights it, and leaves the others alone", () => {
    const host = list();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    expect(revealRow(host, "mood")).toBe(true);
    const mood = rowNamed(host, "mood");
    expect(mood.querySelector(".set-expand")?.getAttribute("aria-expanded")).toBe("true");
    expect(mood.querySelector<HTMLElement>(".set-details")?.hidden).toBe(false);
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.calls[0]?.[0]).toMatchObject({ block: "center" });
    expect(mood.classList.contains("landed")).toBe(true);
    const gold = rowNamed(host, "gold");
    expect(gold.classList.contains("landed")).toBe(false);
    expect(gold.querySelector(".set-expand")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not close a row that is already open", () => {
    const host = list();
    Element.prototype.scrollIntoView = vi.fn();
    revealRow(host, "mood");
    revealRow(host, "mood");
    expect(rowNamed(host, "mood").querySelector(".set-expand")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("lands on a row with no details without complaint", () => {
    const host = list();
    Element.prototype.scrollIntoView = vi.fn();
    expect(revealRow(host, "plain")).toBe(true);
    expect(rowNamed(host, "plain").classList.contains("landed")).toBe(true);
  });

  it("returns false when no row carries the name, so a host can ask again later", () => {
    const host = list();
    Element.prototype.scrollIntoView = vi.fn();
    expect(revealRow(host, "nosuch")).toBe(false);
    expect(host.querySelector(".landed")).toBeNull();
  });

  it("needs no escaping: a name with quotes and brackets is found by its stamp", () => {
    const host = document.createElement("div");
    host.append(expandableRow({ line: [span()], name: 'odd"[name]' }));
    document.body.append(host);
    Element.prototype.scrollIntoView = vi.fn();
    expect(revealRow(host, 'odd"[name]')).toBe(true);
  });
});
