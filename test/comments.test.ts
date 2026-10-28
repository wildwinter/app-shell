// The comment popover (comments.ts), specifically the quoted anchor. Added with
// `quoteFor` because Patterpad pins threads to a span of prose and the shell had
// nowhere to show it: adopting the popover without this would have silently
// dropped the context from every range-anchored comment in that app.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { closeAnchoredPanel } from "../src/anchored.js";
import { openComments, type Comment } from "../src/comments.js";

const thread = (over: Partial<Comment> = {}): Comment => ({
  id: "t1", anchor: "beat-3", messages: [{ author: "Ian", ts: "2026-08-16T10:00:00Z", body: "Too long." }], ...over,
});

const show = (opts: Partial<Parameters<typeof openComments>[0]> = {}): void => {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  openComments({
    anchor, subject: "Line", threads: [thread()], showResolved: false,
    newThreadId: () => "t2", post: () => {}, setResolved: () => {}, ...opts,
  });
};

afterEach(() => { closeAnchoredPanel(); document.body.replaceChildren(); });

describe("the quoted anchor", () => {
  it("quotes the span a thread is pinned to when the app resolves one", () => {
    show({ quoteFor: () => "the dog barked twice" });
    expect(document.querySelector(".shell-cmt-quote")?.textContent).toBe("the dog barked twice");
  });

  it("shows nothing when the app has no quotable anchor", () => {
    // An app that pins threads to a whole card passes no quoteFor at all, and one
    // that pins to something unquotable returns undefined. Neither should leave
    // an empty rule floating above the thread.
    show();
    expect(document.querySelector(".shell-cmt-quote")).toBeNull();
    closeAnchoredPanel();
    document.body.replaceChildren();
    show({ quoteFor: () => undefined });
    expect(document.querySelector(".shell-cmt-quote")).toBeNull();
    closeAnchoredPanel();
    document.body.replaceChildren();
    show({ quoteFor: () => "" });
    expect(document.querySelector(".shell-cmt-quote")).toBeNull();
  });

  it("still renders the thread itself alongside the quote", () => {
    show({ quoteFor: () => "the dog barked twice" });
    expect(document.querySelector(".shell-cmt-body")?.textContent).toBe("Too long.");
    expect(document.querySelector(".shell-cmt-author")?.textContent).toBe("Ian");
  });
});

// The hands-on review of October 2026: a reply posted with the button didn't appear until the popover was
// reopened, a second post on a new thread started a second thread, and a host that hands the popover copies
// showed them stale after a resolve or a delete.
describe("what a change answers", () => {
  const ian = { author: "Ian", ts: "2026-10-28T10:00:00Z" };
  const button = (text: string): HTMLButtonElement =>
    [...document.querySelectorAll<HTMLButtonElement>(".shell-cmt-btn")].find((b) => b.textContent === text)!;
  const type = (text: string): void => { document.querySelector<HTMLTextAreaElement>(".shell-cmt-input")!.value = text; };
  const bodies = (): string[] => [...document.querySelectorAll(".shell-cmt-body")].map((b) => b.textContent ?? "");
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it("shows a reply posted with the button, under its thread, with the composer cleared", async () => {
    let stored = [thread()];
    show({
      threads: stored,
      post: (id, body) => { stored = stored.map((t) => (t.id === id ? { ...t, messages: [...t.messages, { ...ian, body }] } : t)); return stored; },
    });
    type("Cut it, then.");
    button("Reply").click();
    await settle();
    expect(bodies()).toEqual(["Too long.", "Cut it, then."]);
    expect(document.querySelector<HTMLTextAreaElement>(".shell-cmt-input")!.value).toBe("");
  });

  it("posts a new thread's second message to the same thread, once its write lands", async () => {
    let stored: Comment[] = [];
    const ids: string[] = [];
    let minted = 0;
    show({
      threads: [],
      newThreadId: () => `new-${++minted}`,
      post: async (id, body) => {
        ids.push(id);
        const t = stored.find((x) => x.id === id);
        stored = t ? stored.map((x) => (x === t ? { ...x, messages: [...x.messages, { ...ian, body }] } : x))
          : [...stored, { id, anchor: "beat-3", messages: [{ ...ian, body }] }];
        return stored;
      },
    });
    type("First.");
    button("Comment").click();
    type("Second.");
    // Clicked again before the first write has landed: still the same thread.
    (document.querySelector(".shell-cmt-btn.primary") as HTMLButtonElement).click();
    await settle();
    expect(ids).toEqual(["new-1", "new-1"]);
    expect(bodies()).toEqual(["First.", "Second."]);
  });

  it("shows a reopened thread from the threads the host answers, not its stale copy", async () => {
    const resolved = thread({ resolved: true });
    show({
      threads: [resolved], showResolved: true,
      setResolved: (id, value) => [{ ...resolved, id, resolved: value }],
    });
    button("Reopen").click();
    await settle();
    expect(button("Mark complete")).toBeDefined();
    expect(document.querySelector(".shell-cmt-list.resolved")).toBeNull();
  });

  it("shows a withdrawn message as withdrawn, and closes when the thread is gone", async () => {
    const two = thread({ messages: [{ ...ian, body: "Too long." }, { ...ian, body: "Agreed." }] });
    let answer: Comment[] = [{ ...two, messages: [two.messages[0]!, { ...ian, body: "", deleted: true }] }];
    show({ threads: [two], deleteMessage: () => answer });
    (document.querySelectorAll<HTMLButtonElement>(".shell-cmt-del")[1]!).click();
    await settle();
    expect(bodies()).toEqual(["Too long.", "Comment deleted"]);
    answer = [];
    document.querySelector<HTMLButtonElement>(".shell-cmt-del")!.click();
    await settle();
    expect(document.querySelector(".comments")).toBeNull();
  });

  it("keeps what's being typed when a refresh lands under it", async () => {
    let release: (v: Comment[]) => void = () => {};
    show({ post: () => new Promise<Comment[]>((r) => { release = r; }) });
    type("Posted.");
    button("Reply").click();
    type("Still typing");
    release([thread({ messages: [{ ...ian, body: "Too long." }, { ...ian, body: "Posted." }] })]);
    await settle();
    expect(document.querySelector<HTMLTextAreaElement>(".shell-cmt-input")!.value).toBe("Still typing");
  });
});
