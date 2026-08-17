// The version-control view's pure half: folding a snapshot over the keys an item
// stands for, the one badge it flies, and turning a locked document's controls
// off. Untested until now, which is how three of the five badge states went
// missing between the app that wrote them and the shell.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { foldVc, vcBadgeFor, paintVcBadges, lockControls, lockNotice, type ShardVc } from "../src/vc-view.js";

afterEach(() => document.body.replaceChildren());

const map = (...s: ShardVc[]): Map<string, ShardVc> => new Map(s.map((x) => [x.key, x]));

describe("foldVc", () => {
  it("folds several shards onto one row, most actionable winning", () => {
    const out = foldVc(map(
      { key: "a", writable: true, dirty: true },
      { key: "b", writable: false, lockedBy: ["bo"] },
      { key: "c", writable: true, outOfDate: true, untracked: true },
    ), "a b c");
    expect(out).toMatchObject({ writable: false, dirty: true, lockedBy: ["bo"], outOfDate: true, untracked: true });
  });

  it("merges holders across shards without repeating one", () => {
    const out = foldVc(map(
      { key: "a", writable: true, lockedBy: ["bo"] },
      { key: "b", writable: true, lockedBy: ["bo", "ada"] },
    ), "a b");
    expect(out?.lockedBy).toEqual(["bo", "ada"]);
  });

  it("is undefined for no keys and for keys nothing knows about", () => {
    expect(foldVc(map(), undefined)).toBeUndefined();
    expect(foldVc(map({ key: "a", writable: true }), "zzz")).toBeUndefined();
  });
});

describe("vcBadgeFor priority", () => {
  // The order is the point: the badge answers "what would I do about this?", so
  // a holder outranks staleness, which outranks anything about your own copy.
  it("prefers a lock over everything else", () => {
    expect(vcBadgeFor({ key: "a", writable: false, lockedBy: ["bo"], outOfDate: true, dirty: true })?.cls).toBe("vc-locked");
  });

  it("prefers out-of-date over your own states", () => {
    expect(vcBadgeFor({ key: "a", writable: true, outOfDate: true, checkedOutByMe: true })?.cls).toBe("vc-stale");
  });

  it("shows checked-out-by-you above modified", () => {
    expect(vcBadgeFor({ key: "a", writable: true, checkedOutByMe: true, dirty: true })?.cls).toBe("vc-mine");
  });

  it("shows modified above untracked", () => {
    expect(vcBadgeFor({ key: "a", writable: true, dirty: true, untracked: true })?.cls).toBe("vc-dirty");
  });

  it("shows untracked above merely read-only", () => {
    expect(vcBadgeFor({ key: "a", writable: false, untracked: true })?.cls).toBe("vc-new");
  });

  it("read-only with no other holder is last, and still a badge", () => {
    expect(vcBadgeFor({ key: "a", writable: false })?.cls).toBe("vc-frozen");
  });

  it("says nothing about a clean shard, or about no shard at all", () => {
    expect(vcBadgeFor({ key: "a", writable: true })).toBeNull();
    expect(vcBadgeFor(undefined)).toBeNull();
  });
});

describe("paintVcBadges", () => {
  it("badges the rows that name a shard and leaves the rest alone", () => {
    document.body.innerHTML = `<div id="r"><i data-vc="a"></i><i data-vc="b"></i><i></i></div>`;
    paintVcBadges(document.getElementById("r")!, map(
      { key: "a", writable: true, lockedBy: ["bo"] },
      { key: "b", writable: true },
    ));
    const badges = document.querySelectorAll(".vc-badge");
    expect(badges.length).toBe(1);
    expect(badges[0]!.classList.contains("vc-locked")).toBe(true);
  });

  it("repaints in place rather than stacking badges on a poll", () => {
    // The module is render-free on purpose: a poll must not disturb a mid-edit
    // document, and must not leave two badges behind either.
    document.body.innerHTML = `<div id="r"><i data-vc="a"></i></div>`;
    const root = document.getElementById("r")!;
    paintVcBadges(root, map({ key: "a", writable: true, dirty: true }));
    paintVcBadges(root, map({ key: "a", writable: true, lockedBy: ["bo"] }));
    expect(root.querySelectorAll(".vc-badge").length).toBe(1);
    expect(root.querySelector(".vc-badge")!.classList.contains("vc-locked")).toBe(true);
  });

  it("clears a badge once the shard comes clean", () => {
    document.body.innerHTML = `<div id="r"><i data-vc="a"></i></div>`;
    const root = document.getElementById("r")!;
    paintVcBadges(root, map({ key: "a", writable: true, dirty: true }));
    paintVcBadges(root, map({ key: "a", writable: true }));
    expect(root.querySelectorAll(".vc-badge").length).toBe(0);
  });
});

describe("lockControls", () => {
  it("disables the controls it locked and restores only those", () => {
    // A control disabled for its OWN reasons must stay disabled when the lock
    // lifts, which is why the module marks what it turned off.
    document.body.innerHTML = `<div id="h"><button id="a"></button><button id="b" disabled></button></div>`;
    const host = document.getElementById("h")!;
    const a = document.getElementById("a") as HTMLButtonElement;
    const b = document.getElementById("b") as HTMLButtonElement;

    lockControls(host, true, "");
    expect([a.disabled, b.disabled]).toEqual([true, true]);
    expect(host.classList.contains("vc-readonly")).toBe(true);

    lockControls(host, false, "");
    expect(a.disabled).toBe(false);
    expect(b.disabled).toBe(true); // was already disabled: not ours to re-enable
    expect(host.classList.contains("vc-readonly")).toBe(false);
  });

  it("leaves the controls an app declares must stay live", () => {
    // Reading a shard somebody else holds has to stay fully possible.
    document.body.innerHTML = `<div id="h"><button id="nav" class="stay"></button><button id="edit"></button></div>`;
    lockControls(document.getElementById("h")!, true, ".stay");
    expect((document.getElementById("nav") as HTMLButtonElement).disabled).toBe(false);
    expect((document.getElementById("edit") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("lockNotice", () => {
  it("names every holder", () => {
    expect(lockNotice(["bo", "ada"]).textContent).toContain("bo, ada");
  });
});
