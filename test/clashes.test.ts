// The clash resolver (clashes.ts): listing from the adapter, each decision through it, Edit then Mark
// resolved, an unsettable clash's buttons, the empty state, the keyboard, and where focus goes; the
// banner; and Project > Resolve Clashes….
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { clashBanner, clashCountText, clashKindLabel, openClashResolver } from "../src/clashes.js";
import type { Clash, ClashAdapter, ClashResolver, ClashSide } from "../src/clashes.js";
import { setDialogFocusFallback } from "../src/dialog.js";
import { PROJECT_MENU, resolveClashesMenuItem } from "../src/menu.js";

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
  }
});

let open: ClashResolver | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
  setDialogFocusFallback(null);
  document.body.replaceChildren();
});

let seq = 0;
/** Fresh ids per test: the resolver remembers Edit by id across openings. */
const clash = (over: Partial<Clash> = {}): Clash => ({
  id: `c${++seq}`, where: "Scene Tavern, Ann's line", path: "beats[b_1].text", kind: "both-changed",
  ours: "Hello there.", theirs: "Hi.", settable: true, ...over,
});

/** An adapter over an in-memory list, recording what it was asked. */
function fakeAdapter(start: Clash[]): ClashAdapter & { calls: string[]; items: Clash[] } {
  const items = [...start];
  const calls: string[] = [];
  const drop = (id: string): Clash[] => {
    const i = items.findIndex((c) => c.id === id);
    if (i >= 0) items.splice(i, 1);
    return [...items];
  };
  return {
    items, calls,
    list: () => Promise.resolve([...items]),
    resolve: (id: string, side: ClashSide) => { calls.push(`resolve ${id} ${side}`); return Promise.resolve(drop(id)); },
    edit: (id: string) => { calls.push(`edit ${id}`); },
    markResolved: (id: string) => { calls.push(`mark ${id}`); return Promise.resolve(drop(id)); },
  };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const dialog = (): HTMLDialogElement => document.querySelector("dialog.shell-clashes") as HTMLDialogElement;
const cards = (): HTMLElement[] => [...dialog().querySelectorAll<HTMLElement>(".shell-clash")];
const buttons = (card: HTMLElement): string[] =>
  [...card.querySelectorAll<HTMLButtonElement>(".shell-clash-actions button")].map((b) => b.textContent ?? "");
const press = (card: HTMLElement, label: string): void => {
  const b = [...card.querySelectorAll<HTMLButtonElement>("button")].find((x) => x.textContent === label);
  if (!b) throw new Error(`no ${label} button`);
  b.click();
};
const key = (target: Element, k: string): void => {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
};

async function openWith(items: Clash[], extra: Partial<Parameters<typeof openClashResolver>[0]> = {}) {
  const adapter = fakeAdapter(items);
  open = openClashResolver({ adapter, ...extra });
  await flush();
  return adapter;
}

describe("openClashResolver: listing", () => {
  it("lists every clash the adapter gives, with where, kind, path, and both sides", async () => {
    await openWith([clash({ where: "Card Ann", path: "cards[c_1].priority", ours: "3", theirs: "5" }), clash()]);
    expect(dialog().querySelector(".shell-dialog-title")?.textContent).toBe("Resolve clashes");
    expect(cards()).toHaveLength(2);
    const first = cards()[0]!;
    expect(first.querySelector(".shell-clash-where")?.textContent).toBe("Card Ann");
    expect(first.querySelector(".shell-clash-kind")?.textContent).toBe("Both sides changed it");
    expect(first.querySelector(".shell-clash-path")?.textContent).toBe("cards[c_1].priority");
    const sides = [...first.querySelectorAll(".shell-clash-side")].map((s) => [
      s.querySelector(".shell-clash-side-label")?.textContent, s.querySelector(".shell-clash-text")?.textContent]);
    expect(sides).toEqual([["Mine", "3"], ["Theirs", "5"]]);
    expect(dialog().querySelector(".shell-clash-status")?.textContent).toBe("2 unresolved clashes.");
  });

  it("says an absent side is absent, keeps long text whole, and shows the sidecar's detail and the base", async () => {
    const long = "A very long line. ".repeat(40);
    await openWith([clash({ kind: "delete-vs-edit", ours: undefined, theirs: long, base: "Old.", detail: "From the pull of 3 May." })]);
    const card = cards()[0]!;
    const texts = card.querySelectorAll(".shell-clash-text");
    expect(texts[0]?.classList.contains("absent")).toBe(true);
    expect(texts[0]?.textContent).toBe("Absent on this side");
    expect(texts[1]?.textContent).toBe(long);
    expect(card.querySelector(".shell-clash-detail")?.textContent).toBe("From the pull of 3 May.");
    expect(card.querySelector(".shell-clash-base")?.textContent).toBe("Before the merge: Old.");
    expect(card.querySelector(".shell-clash-kind")?.textContent).toBe("Deleted on one side, edited on the other");
  });

  it("takes a synchronous list too, and names a family's own kind by its label", async () => {
    const adapter = fakeAdapter([]);
    adapter.list = () => [clash({ kind: "moved", kindLabel: "Moved on both sides", settable: false })];
    open = openClashResolver({ adapter });
    await flush();
    expect(cards()[0]!.querySelector(".shell-clash-kind")?.textContent).toBe("Moved on both sides");
  });

  it("tells onChange every list it receives", async () => {
    const onChange = vi.fn();
    const a = clash();
    await openWith([a, clash()], { onChange });
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: a.id })]));
    press(cards()[0]!, "Keep mine");
    await flush();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]![0]).toHaveLength(1);
  });
});

describe("openClashResolver: decisions", () => {
  it("Keep mine asks the adapter for ours and shows what is left", async () => {
    const a = clash(), b = clash();
    const adapter = await openWith([a, b]);
    press(cards()[0]!, "Keep mine");
    await flush();
    expect(adapter.calls).toEqual([`resolve ${a.id} ours`]);
    expect(cards().map((c) => c.dataset.clashId)).toEqual([b.id]);
    expect(dialog().querySelector(".shell-clash-status")?.textContent).toBe("1 unresolved clash.");
  });

  it("Take theirs asks the adapter for theirs", async () => {
    const a = clash();
    const adapter = await openWith([a]);
    press(cards()[0]!, "Take theirs");
    await flush();
    expect(adapter.calls).toEqual([`resolve ${a.id} theirs`]);
  });

  it("shows exactly what the adapter answers, not its own guess", async () => {
    const a = clash(), b = clash(), c = clash();
    const adapter = fakeAdapter([a, b]);
    // The app's write also brought in a clash from elsewhere.
    adapter.resolve = () => Promise.resolve([b, c]);
    open = openClashResolver({ adapter });
    await flush();
    press(cards()[0]!, "Keep mine");
    await flush();
    expect(cards().map((x) => x.dataset.clashId)).toEqual([b.id, c.id]);
  });

  it("turns the buttons off while a decision is being written, and asks once", async () => {
    const a = clash();
    const adapter = fakeAdapter([a, clash()]);
    let land!: (v: Clash[]) => void;
    adapter.resolve = vi.fn(() => new Promise<Clash[]>((r) => { land = r; }));
    open = openClashResolver({ adapter });
    await flush();
    press(cards()[0]!, "Keep mine");
    press(cards()[0]!, "Keep mine");
    expect(adapter.resolve).toHaveBeenCalledTimes(1);
    expect([...dialog().querySelectorAll<HTMLButtonElement>(".shell-clash-actions button")].every((b) => b.disabled)).toBe(true);
    land([]);
    await flush();
    expect(cards()).toHaveLength(0);
  });

  it("says so in a toast when a write fails, and leaves the clash there to try again", async () => {
    const adapter = fakeAdapter([clash()]);
    adapter.resolve = () => Promise.reject(new Error("the file changed outside"));
    open = openClashResolver({ adapter });
    await flush();
    press(cards()[0]!, "Take theirs");
    await flush();
    expect(document.querySelector(".shell-toast")?.textContent).toContain("Couldn't resolve that clash: the file changed outside");
    expect(cards()).toHaveLength(1);
    expect(buttons(cards()[0]!).length).toBeGreaterThan(0);
    expect([...cards()[0]!.querySelectorAll("button")].some((b) => (b as HTMLButtonElement).disabled)).toBe(false);
  });
});

describe("openClashResolver: Edit, then Mark resolved", () => {
  it("Edit closes the resolver and then asks the app to go there", async () => {
    const a = clash();
    const adapter = await openWith([a]);
    const order: string[] = [];
    const onClose = vi.fn(() => order.push("closed"));
    adapter.edit = (id) => order.push(`edit ${id}`);
    open = openClashResolver({ adapter, onClose });
    await flush();
    // Two dialogs now (the first from openWith); act on the newest.
    const all = [...document.querySelectorAll<HTMLElement>("dialog.shell-clashes .shell-clash")];
    press(all[all.length - 1]!, "Edit");
    expect(order).toEqual(["closed", `edit ${a.id}`]);
  });

  it("shows Mark resolved on that clash when the resolver opens again, and it asks the adapter", async () => {
    const a = clash(), b = clash();
    const adapter = fakeAdapter([a, b]);
    open = openClashResolver({ adapter });
    await flush();
    expect(buttons(cards()[0]!)).toEqual(["Keep mine", "Take theirs", "Edit"]);
    press(cards()[0]!, "Edit");
    expect(adapter.calls).toEqual([`edit ${a.id}`]);
    expect(dialog()).toBeNull();

    open = openClashResolver({ adapter });
    await flush();
    expect(buttons(cards()[0]!)).toEqual(["Mark resolved", "Keep mine", "Take theirs", "Edit"]);
    expect(buttons(cards()[1]!)).toEqual(["Keep mine", "Take theirs", "Edit"]);
    press(cards()[0]!, "Mark resolved");
    await flush();
    expect(adapter.calls).toEqual([`edit ${a.id}`, `mark ${a.id}`]);
    expect(cards().map((c) => c.dataset.clashId)).toEqual([b.id]);
  });
});

describe("openClashResolver: a clash that can't be set as a value", () => {
  it("offers only Keep mine and Edit", async () => {
    await openWith([clash({ kind: "structural", settable: false })]);
    expect(buttons(cards()[0]!)).toEqual(["Keep mine", "Edit"]);
    expect(cards()[0]!.querySelector(".shell-clash-kind")?.textContent).toBe("The merged result doesn't hold together");
  });
});

describe("openClashResolver: the empty state", () => {
  it("says no clashes are left when there are none, and Close has focus", async () => {
    await openWith([]);
    expect(cards()).toHaveLength(0);
    expect(dialog().querySelector(".shell-clash-status")?.textContent).toBe("No clashes left.");
    expect(document.activeElement?.textContent).toBe("Close");
  });

  it("says so after the last decision, with focus on Close", async () => {
    await openWith([clash()]);
    press(cards()[0]!, "Keep mine");
    await flush();
    expect(dialog().querySelector(".shell-clash-status")?.textContent).toBe("No clashes left.");
    expect(document.activeElement?.textContent).toBe("Close");
  });
});

describe("openClashResolver: the keyboard", () => {
  it("focuses the first clash once the list arrives, and only it is in the Tab order", async () => {
    await openWith([clash(), clash(), clash()]);
    expect(document.activeElement).toBe(cards()[0]);
    expect(cards().map((c) => c.tabIndex)).toEqual([0, -1, -1]);
  });

  it("walks the clashes with the arrows, Home and End, from a clash or from one of its buttons", async () => {
    await openWith([clash(), clash(), clash()]);
    key(cards()[0]!, "ArrowDown");
    expect(document.activeElement).toBe(cards()[1]);
    expect(cards().map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
    const btn = cards()[1]!.querySelector("button")!;
    btn.focus();
    key(btn, "ArrowDown");
    expect(document.activeElement).toBe(cards()[2]);
    key(cards()[2]!, "ArrowDown");
    expect(document.activeElement).toBe(cards()[2]);
    key(cards()[2]!, "Home");
    expect(document.activeElement).toBe(cards()[0]);
    key(cards()[0]!, "ArrowUp");
    expect(document.activeElement).toBe(cards()[0]);
    key(cards()[0]!, "End");
    expect(document.activeElement).toBe(cards()[2]);
  });

  it("after a decision, focus goes to the clash that took its place", async () => {
    const b = clash(), c = clash();
    await openWith([clash(), b, c]);
    key(cards()[0]!, "ArrowDown");
    press(cards()[1]!, "Keep mine");
    await flush();
    expect((document.activeElement as HTMLElement).dataset.clashId).toBe(c.id);
    // The last one, decided: focus steps back to the one before it.
    press(cards()[1]!, "Take theirs");
    await flush();
    expect(cards()).toHaveLength(1);
    expect(document.activeElement).toBe(cards()[0]);
  });

  it("Close and Escape close it", async () => {
    await openWith([clash()]);
    dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(dialog()).toBeNull();
    await openWith([clash()]);
    (dialog().querySelector(".shell-dialog-actions button") as HTMLButtonElement).click();
    expect(dialog()).toBeNull();
  });
});

describe("openClashResolver: focus back", () => {
  it("gives focus back to the opener on Escape", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await openWith([clash()]);
    dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(document.activeElement).toBe(opener);
  });

  it("uses returnFocus ahead of the opener, and the host's fallback when the opener has gone", async () => {
    const opener = document.createElement("button");
    const target = document.createElement("button");
    const fallback = document.createElement("button");
    document.body.append(opener, target, fallback);
    opener.focus();
    await openWith([clash()], { returnFocus: target });
    dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(document.activeElement).toBe(target);

    setDialogFocusFallback(() => fallback);
    opener.focus();
    await openWith([clash()]);
    opener.remove();
    dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(document.activeElement).toBe(fallback);
  });

  it("lets the app take focus after Edit", async () => {
    const opener = document.createElement("button");
    const place = document.createElement("textarea");
    document.body.append(opener, place);
    opener.focus();
    const adapter = fakeAdapter([clash()]);
    adapter.edit = () => place.focus();
    open = openClashResolver({ adapter });
    await flush();
    press(cards()[0]!, "Edit");
    expect(document.activeElement).toBe(place);
  });
});

describe("openClashResolver: refresh", () => {
  it("asks the adapter again and redraws", async () => {
    const a = clash();
    const adapter = await openWith([a]);
    adapter.items.push(clash());
    await open!.refresh();
    expect(cards()).toHaveLength(2);
  });

  it("says when the list can't be read", async () => {
    const adapter = fakeAdapter([]);
    adapter.list = () => Promise.reject(new Error("no project"));
    open = openClashResolver({ adapter });
    await flush();
    expect(dialog().querySelector(".shell-clash-status")?.textContent).toBe("Couldn't read the clashes: no project");
  });
});

describe("clashBanner", () => {
  it("counts the clashes, hides at none, and opens the resolver", () => {
    const onResolve = vi.fn();
    const banner = clashBanner({ onResolve, count: 3 });
    document.body.append(banner.el);
    expect(banner.el.hidden).toBe(false);
    expect(banner.el.querySelector(".shell-clash-banner-msg")?.textContent)
      .toBe("This project has 3 unresolved clashes from a merge.");
    banner.update(1);
    expect(banner.el.textContent).toContain("This project has 1 unresolved clash from a merge.");
    (banner.el.querySelector("button") as HTMLButtonElement).click();
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(banner.el.querySelector("button")?.textContent).toBe("Resolve…");
    banner.update(0);
    expect(banner.el.hidden).toBe(true);
  });

  it("starts hidden with no count", () => {
    expect(clashBanner({ onResolve: () => {} }).el.hidden).toBe(true);
  });
});

describe("the words", () => {
  it("counts and names kinds", () => {
    expect(clashCountText(1)).toBe("1 unresolved clash");
    expect(clashCountText(2)).toBe("2 unresolved clashes");
    expect(clashKindLabel({ kind: "added-both" })).toBe("Added on both sides");
    expect(clashKindLabel({ kind: "no-timestamp" })).toBe("no-timestamp");
    expect(clashKindLabel({ kind: "moved", kindLabel: "Moved" })).toBe("Moved");
  });
});

describe("Project > Resolve Clashes…", () => {
  it("is spelled once, with the ellipsis, and enabled only when there are clashes", () => {
    expect(PROJECT_MENU.resolveClashes).toEqual({ label: "Resolve Clashes…" });
    expect(resolveClashesMenuItem(0)).toEqual({ label: "Resolve Clashes…", enabled: false });
    expect(resolveClashesMenuItem(2).enabled).toBe(true);
  });
});
