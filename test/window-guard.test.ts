// Window hardening (window-guard.ts): the family's one policy, read back from a page, and the guards that
// keep a window on its page, refuse new windows and webviews, and send web links to the browser.
import { describe, expect, it, vi } from "vitest";
import { cspOfPage, familyCsp, guardAllWindows, guardWebContents, isSamePage } from "../src/window-guard.js";

describe("familyCsp", () => {
  it("is the base policy with nothing added", () => {
    expect(familyCsp()).toBe("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'");
  });
  it("extends a directive the base has, and adds one it lacks from default-src", () => {
    expect(familyCsp({ "img-src": ["blob:", "data:"], "media-src": ["blob:"] }))
      .toBe("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; media-src 'self' blob:");
  });
});

describe("cspOfPage", () => {
  it("reads the meta's content, whatever the attribute order or quotes", () => {
    expect(cspOfPage(`<head><meta charset="utf-8" /><meta content="default-src 'self'" http-equiv="Content-Security-Policy"></head>`)).toBe("default-src 'self'");
    expect(cspOfPage(`<meta http-equiv='Content-Security-Policy' content='a b'>`)).toBe("a b");
    expect(cspOfPage(`<meta charset="utf-8">`)).toBeNull();
  });
});

describe("isSamePage", () => {
  it("lets a dev server's page move within its origin, and a file page only to itself", () => {
    expect(isSamePage("http://localhost:5173/", "http://localhost:5173/search/index.html")).toBe(true);
    expect(isSamePage("http://localhost:5173/", "https://example.com/")).toBe(false);
    expect(isSamePage("file:///app/out/renderer/index.html", "file:///app/out/renderer/index.html#x")).toBe(true);
    expect(isSamePage("file:///app/out/renderer/index.html", "file:///etc/passwd")).toBe(false);
    expect(isSamePage("file:///a/index.html", "not a url")).toBe(false);
  });
});

type Handler = (...args: unknown[]) => void;
const fakeContents = (url: string) => {
  const on = new Map<string, Handler>();
  let opener: ((d: { url: string }) => { action: string }) | undefined;
  return {
    getURL: () => url,
    on: (event: string, fn: Handler) => { on.set(event, fn); },
    setWindowOpenHandler: (fn: (d: { url: string }) => { action: string }) => { opener = fn; },
    fire: (event: string, url = ""): boolean => { const e = { preventDefault: vi.fn() }; on.get(event)!(e, url); return e.preventDefault.mock.calls.length > 0; },
    open: (u: string) => opener!({ url: u }),
  };
};

describe("guardWebContents", () => {
  it("keeps a window on its page and sends a web link to the browser", () => {
    const c = fakeContents("file:///app/index.html");
    const openExternal = vi.fn();
    guardWebContents(c as never, { openExternal });
    expect(c.fire("will-navigate", "file:///app/index.html#top")).toBe(false);
    expect(c.fire("will-navigate", "https://storylets.dev/")).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://storylets.dev/");
    expect(c.fire("will-navigate", "file:///elsewhere.html")).toBe(true);
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("refuses every new window, opening only web links in the browser", () => {
    const c = fakeContents("file:///app/index.html");
    const openExternal = vi.fn();
    guardWebContents(c as never, { openExternal });
    expect(c.open("https://example.com/")).toEqual({ action: "deny" });
    expect(c.open("javascript:alert(1)")).toEqual({ action: "deny" });
    expect(openExternal.mock.calls).toEqual([["https://example.com/"]]);
  });

  it("refuses a webview, and opens nothing without openExternal", () => {
    const c = fakeContents("file:///app/index.html");
    const onBlocked = vi.fn();
    guardWebContents(c as never, { onBlocked });
    expect(c.fire("will-attach-webview")).toBe(true);
    expect(c.open("https://example.com/")).toEqual({ action: "deny" });
    expect(onBlocked.mock.calls).toEqual([["webview", ""], ["window", "https://example.com/"]]);
  });

  it("guardAllWindows guards each web contents as it is created", () => {
    let created: Handler | undefined;
    guardAllWindows({ on: (_e: string, fn: Handler) => { created = fn; } } as never);
    const c = fakeContents("file:///app/index.html");
    created!({}, c);
    expect(c.open("https://example.com/")).toEqual({ action: "deny" });
  });
});

// The view scheme (view-host): a view's page is `<scheme>://<extension>/?view=<id>`, loaded by main (no
// will-navigate), so the guard only ever sees the page reload itself or try to leave.
describe("isSamePage on the view scheme", () => {
  it("lets the view's page reload itself, and nothing else", () => {
    const page = "patter-view://probe/?view=inspect";
    expect(isSamePage(page, "patter-view://probe/?view=inspect")).toBe(true);
    expect(isSamePage(page, "patter-view://probe/?view=other")).toBe(true);
    expect(isSamePage(page, "patter-view://probe/view/probe-view.js")).toBe(false);
    expect(isSamePage(page, "patter-view://pattershot/?view=inspect")).toBe(false);
    expect(isSamePage(page, "https://example.com/")).toBe(false);
    expect(isSamePage("", page)).toBe(false);
  });
});
