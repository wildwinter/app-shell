// ---------------------------------------------------------------------------
// The comment thread popover: Patterpad's (#148), as the family's.
//
// Comments are the conversation; documentation states the reason. Anchored
// rather than modal, which is the deliberate contrast with the notes editor: a
// comment is had BESIDE the thing, and a modal covering the card would hide
// what is being discussed.
//
// Everything here that looks like a small decision is one somebody already
// made: author and timestamp on every message (a comment without a "who" is an
// anonymous complaint); Enter posts and closes while Shift+Enter is a newline;
// the button reads Comment on a new thread and Reply on an old one; focus goes
// to the composer ONLY for a new thread, because opening an existing one to
// read must not yank the cursor out of the work; and a thread does not exist
// until its first message is posted, so a composer somebody thought better of
// leaves nothing behind.
//
// THE SEAM: an anchor is an opaque id. What it points at - a card, a beat, a
// span of characters - is the app's, and so is where the threads are stored.
// This takes a list and gives back "post this" and "resolve that".
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { openAnchoredPanel } from "./anchored.js";

/** One message. The author is a NAME stamped at posting time, not a reference:
 *  people leave projects and their words stay. */
export interface CommentMessage {
  author: string; ts: string; body: string;
  /** A TOMBSTONE: the words are gone, the turn in the conversation is not.
   *  Deleting a reply out of a thread would renumber the argument around it, so
   *  what is left says who spoke and when and that they withdrew it. The body is
   *  emptied on the way out, so "deleted" means deleted from the file too. */
  deleted?: boolean;
}

/** A thread, anchored to the id of whatever it is about. */
export interface Comment {
  id: string;
  anchor: string;
  resolved?: boolean;
  messages: CommentMessage[];
}

const stamp = (ts: string): string => {
  const when = new Date(ts);
  if (Number.isNaN(when.getTime())) return ts;
  return when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** A preview of a thread, for the list: its first message, shortened. The first
 *  message that still SAYS something - a thread whose opener was withdrawn is
 *  previewed by whatever carried on, not by its tombstone. */
const gist = (thread: Comment): string => {
  const first = thread.messages.find((m) => m.deleted !== true)?.body ?? "";
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
};

export interface CommentsOptions {
  anchor: HTMLElement;
  /** What is being discussed, for the panel's title. */
  subject: string;
  /** Every thread on this thing, resolved ones included. */
  threads: Comment[];
  /** Review ▸ Show Resolved Comments. */
  showResolved: boolean;
  /** A fresh thread id, minted by the caller so main never has to. */
  newThreadId: () => string;
  post: (threadId: string, body: string) => void;
  setResolved: (threadId: string, resolved: boolean) => void;
  /**
   * Withdraw one message. Absent = the host does not offer deletion.
   *
   * By INDEX, because a message has no id of its own and giving every message
   * one would be a format change to every stored thread for the sake of one
   * verb. The index is read off the list the reader is looking at, and these
   * files are edited by one person at a time with a VCS underneath.
   *
   * The host decides what deleting MEANS: the agreed rule is that the message
   * becomes a tombstone, and the whole thread goes when nothing readable would
   * be left (which covers the common case of withdrawing a comment nobody had
   * replied to).
   */
  deleteMessage?: (threadId: string, index: number) => void;
  /** Where the panel sits: "centre" for a point on a canvas (see anchored.ts). */
  prefer?: "left" | "below" | "centre";
  /**
   * The text a thread is pinned to, shown above it as a quotation.
   *
   * A callback rather than a field on `Comment`, because resolving an anchor is
   * the APP's half of the seam and this is only that resolution rendered: an app
   * that pins threads to a span of prose can quote it, one that pins them to a
   * whole card has nothing to quote and passes nothing. Keeping it out of the
   * thread type also means no change to what is written to disk, which matters
   * for files living in version control.
   *
   * Return undefined (or "") for a thread with no quotable anchor.
   */
  quoteFor?: (thread: Comment) => string | undefined;
}

export function openComments(opts: CommentsOptions): void {
  const visible = opts.threads.filter((t) => opts.showResolved || t.resolved !== true);
  const panel = openAnchoredPanel({
    anchor: opts.anchor, className: "comments", title: "Comments", width: 320,
    // Below its button (the topline), unlike Patterpad's inspector rows which
    // want it to the left; and never over the problems bar, which an author may
    // be stepping through while reading the thread.
    prefer: opts.prefer ?? "below",
    keepClear: [".problembar"],
  });
  if (!panel) return;      // the same anchor again: that click closed it
  const { body, close } = panel;

  // Which thread is on screen. A brand-new one until it is posted: it exists
  // only here, which is why nothing is written when the panel closes unposted.
  let open: Comment | undefined = visible.length === 1 ? visible[0] : undefined;
  let composing = visible.length === 0;

  const render = (): void => {
    body.replaceChildren();

    if (!composing && open === undefined) {
      // More than one: pick.
      for (const thread of visible) {
        const row = el("button", { className: `shell-cmt-row${thread.resolved === true ? " resolved" : ""}` },
          el("span", { className: "shell-cmt-row-author", text: thread.messages[0]?.author ?? "Someone" }),
          el("span", { className: "shell-cmt-row-gist", text: gist(thread) }),
          ...(thread.messages.length > 1
            ? [el("span", { className: "shell-cmt-row-count", text: `${thread.messages.length}` })] : []),
        );
        row.addEventListener("click", () => { open = thread; render(); });
        body.append(row);
      }
      const fresh = el("button", { className: "shell-cmt-new", text: "New comment" });
      fresh.addEventListener("click", () => { open = undefined; composing = true; render(); });
      body.append(fresh);
      return;
    }

    const thread = open;
    if (thread) {
      // The span this thread is pinned to, quoted above it. Without it a comment
      // on a phrase reads as a comment on the whole thing, and the reader has to
      // remember what was selected.
      const quote = opts.quoteFor?.(thread);
      if (quote !== undefined && quote !== "") {
        body.append(el("blockquote", { className: "shell-cmt-quote", text: quote }));
      }
      const list = el("div", { className: `shell-cmt-list${thread.resolved === true ? " resolved" : ""}` });
      thread.messages.forEach((message, index) => {
        const head = el("div", { className: "shell-cmt-msg-head" },
          el("span", { className: "shell-cmt-author", text: message.author === "" ? "Someone" : message.author }),
          el("span", { className: "shell-cmt-ts", text: stamp(message.ts) }));
        // Rollover-revealed, at the end of the head: the family's grip grammar,
        // and a delete that is always visible invites the accident it is.
        // Nothing is offered on a tombstone: there is nothing left to withdraw.
        if (opts.deleteMessage && message.deleted !== true) {
          const bin = el("button", { className: "shell-cmt-del", text: "✕" });
          bin.title = "Delete this comment";
          bin.addEventListener("click", () => opts.deleteMessage?.(thread.id, index));
          head.append(bin);
        }
        list.append(el("div", { className: `shell-cmt-msg${message.deleted === true ? " gone" : ""}` },
          head,
          el("div", { className: "shell-cmt-body", text: message.deleted === true ? "Comment deleted" : message.body })));
      });
      body.append(list);
    }

    const input = el("textarea", { className: "shell-cmt-input" });
    input.rows = 2;
    input.placeholder = thread ? "Reply…" : "Comment…";
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      submit(true);
    });
    body.append(input);

    const submit = (andClose: boolean): void => {
      const text = input.value.trim();
      if (text === "") return;
      const id = thread?.id ?? opts.newThreadId();
      opts.post(id, text);
      if (andClose) close(); else { input.value = ""; }
    };

    const actions = el("div", { className: "shell-cmt-actions" });
    const post = el("button", { className: "shell-cmt-btn primary", text: thread ? "Reply" : "Comment" });
    post.addEventListener("click", () => submit(false));
    actions.append(post);

    if (thread) {
      const resolved = thread.resolved === true;
      const toggle = el("button", { className: "shell-cmt-btn", text: resolved ? "Reopen" : "Mark complete" });
      toggle.addEventListener("click", () => {
        opts.setResolved(thread.id, !resolved);
        // A resolved thread hides, so there is nothing left to look at.
        if (!resolved) close(); else render();
      });
      actions.append(toggle);
    }
    body.append(actions);

    // Only for a new thread: reading an old one must not steal the cursor.
    if (!thread) input.focus();
  };
  render();
}
