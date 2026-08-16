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
