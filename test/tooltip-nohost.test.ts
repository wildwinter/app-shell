// The one case a self-mounting component cannot cover: a `data-tip` the APP wrote itself, in markup or
// by hand, in a window that never mounted a host. No shell component is involved, so nothing self-mounts
// and every one of those rollovers is dead. That gets a warning rather than silence.
//
// Its own file because it needs a module instance where nothing has EVER mounted, and mounting is
// module state that no reset can take back off the document.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { el } from "../src/dom.js";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe("data-tip with no host", () => {
  it("warns, naming what to do about it", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = document.createElement("button");
    raw.dataset["tip"] = "written by the app, not by el";
    document.body.append(raw);
    el("span", { text: "any shell element schedules the one-shot check" });
    vi.advanceTimersByTime(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no tooltip host is mounted"));
    warn.mockRestore();
  });
});
