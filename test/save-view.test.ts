// The save indicator, and the stale bar: two small drawings the two apps had
// each grown their own copy of.
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { saveIndicator } from "../src/save-view.js";
import { staleBar } from "../src/stale.js";

describe("saveIndicator", () => {
  it("says all three states, and starts saved", () => {
    const ind = saveIndicator();
    expect(ind.el.textContent).toBe("Saved");
    expect(ind.el.className).toBe("savestat saved");
    ind.set("saving");
    expect(ind.el.textContent).toBe("Saving…");
    expect(ind.el.className).toBe("savestat saving");
    ind.set("unsaved");
    expect(ind.el.textContent).toBe("Unsaved");
    expect(ind.el.className).toBe("savestat unsaved");
  });

  it("keeps the same element across a status change", () => {
    // It is wired to the controller's onStatus and lives in the topbar, so it
    // must repaint in place rather than hand back a new node each time.
    const ind = saveIndicator("unsaved");
    const node = ind.el;
    ind.set("saved");
    expect(ind.el).toBe(node);
  });
});

describe("staleBar", () => {
  it("writes the app's noun into the shared sentence", () => {
    const bar = staleBar({ subject: "The project", onRestart: () => {} });
    expect(bar.querySelector(".stale-bar-msg")?.textContent)
      .toBe("The project changed in the editor. Restart to play the new version.");
  });

  it("restarts, with the app's own word for it", () => {
    const onRestart = vi.fn();
    const bar = staleBar({ subject: "The scene", restartLabel: "Start again", onRestart });
    const go = bar.querySelector<HTMLButtonElement>(".stale-bar-go")!;
    expect(go.textContent).toContain("Start again");
    go.click();
    expect(onRestart).toHaveBeenCalled();
  });
});
