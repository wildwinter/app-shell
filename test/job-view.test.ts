// The long-job strip: the band until a total arrives, the bar and the count
// once one has, Cancel only for a job that can be stopped, and the label.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountJobProgress } from "../src/job-view.js";

afterEach(() => document.body.replaceChildren());

const mount = (opts: Parameters<typeof mountJobProgress>[1]) => {
  const host = document.createElement("div");
  document.body.append(host);
  const view = mountJobProgress(host, opts);
  const q = <T extends HTMLElement>(sel: string): T => view.element.querySelector<T>(sel)!;
  return {
    view,
    strip: view.element,
    fill: q<HTMLElement>(".job-fill"),
    bar: q<HTMLElement>(".job-bar"),
    label: q<HTMLElement>(".job-label"),
    count: q<HTMLElement>(".job-count"),
    time: q<HTMLElement>(".job-time"),
    cancel: q<HTMLButtonElement>(".job-cancel"),
  };
};

describe("mountJobProgress", () => {
  it("opens on the band with no count, and flips to the bar when a total arrives", () => {
    const s = mount({ onCancel: () => {}, units: "runs" });
    expect(s.strip.hidden).toBe(true);
    s.view.begin("Sweeping…");
    expect(s.strip.hidden).toBe(false);
    expect(s.label.textContent).toBe("Sweeping…");
    expect(s.view.indeterminate).toBe(true);
    expect(s.strip.classList.contains("indeterminate")).toBe(true);
    expect(s.count.hidden).toBe(true);
    expect(s.fill.style.width).toBe("");
    expect(s.bar.getAttribute("role")).toBe("progressbar");
    expect(s.bar.hasAttribute("aria-valuenow")).toBe(false);

    // The host's "no idea yet": still the band, the elapsed time alone.
    s.view.update(3, 0, 1500);
    expect(s.view.indeterminate).toBe(true);
    expect(s.count.hidden).toBe(true);
    expect(s.time.textContent).toBe("2s");

    // A total: the bar, the count, and the value for assistive tech.
    s.view.update(3, 10, 1500);
    expect(s.view.indeterminate).toBe(false);
    expect(s.strip.classList.contains("indeterminate")).toBe(false);
    expect(s.count.hidden).toBe(false);
    expect(s.count.textContent).toBe("3 / 10 runs");
    expect(s.fill.style.width).toBe("30%");
    expect(s.bar.getAttribute("aria-valuenow")).toBe("30");
    expect(s.time.textContent).toBe("2s elapsed, about 4s left");

    // Losing the total again (a second phase of unknown size) goes back to
    // the band, and the inline width is cleared so the stylesheet's wins.
    s.view.update(4, 0, 2000);
    expect(s.view.indeterminate).toBe(true);
    expect(s.fill.style.width).toBe("");
    expect(s.bar.hasAttribute("aria-valuenow")).toBe(false);
  });

  it("stays on the band when the host pins it, whatever the job reports", () => {
    const s = mount({ indeterminate: true });
    s.view.begin("Publishing the bundle…");
    s.view.update(3, 10, 500);
    expect(s.view.indeterminate).toBe(true);
    expect(s.count.hidden).toBe(true);
    expect(s.fill.style.width).toBe("");
    expect(s.time.textContent).toBe("1s");
  });

  it("a strip fed only by update() (no begin) is still the band, then the bar", () => {
    const s = mount({});
    expect(s.strip.classList.contains("indeterminate")).toBe(true);
    s.view.update(1, 0, 100);
    expect(s.strip.hidden).toBe(false);
    expect(s.view.indeterminate).toBe(true);
    s.view.update(1, 4, 100);
    expect(s.view.indeterminate).toBe(false);
    expect(s.count.textContent).toBe("1 / 4 runs");
  });

  it("draws Cancel only for a job that can be stopped", () => {
    // No onCancel: nothing to stop, no button.
    const plain = mount({});
    plain.view.begin("Pulling from the server…");
    expect(plain.cancel.hidden).toBe(true);

    // onCancel given: the button, and it says so once clicked.
    const onCancel = vi.fn();
    const sweep = mount({ onCancel });
    sweep.view.begin("Sweeping…");
    expect(sweep.cancel.hidden).toBe(false);
    sweep.cancel.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(sweep.cancel.disabled).toBe(true);
    expect(sweep.cancel.textContent).toBe("Stopping…");
    // The next run gets a fresh button.
    sweep.view.begin("Sweeping again…");
    expect(sweep.cancel.disabled).toBe(false);
    expect(sweep.cancel.textContent).toBe("Cancel");

    // cancellable: false overrides an onCancel that is there for other runs.
    const mixed = mount({ onCancel, cancellable: false });
    mixed.view.begin("Packing…");
    expect(mixed.cancel.hidden).toBe(true);
    // ...and a run may say otherwise.
    mixed.view.begin("Sweeping…", { cancellable: true });
    expect(mixed.cancel.hidden).toBe(false);
    mixed.view.begin("Packing…");
    expect(mixed.cancel.hidden).toBe(true);
  });

  it("a run may pin the band on a strip that otherwise follows the data", () => {
    const s = mount({ onCancel: () => {} });
    s.view.begin("Publishing…", { indeterminate: true });
    s.view.update(2, 4, 100);
    expect(s.view.indeterminate).toBe(true);
    s.view.begin("Sweeping…");
    s.view.update(2, 4, 100);
    expect(s.view.indeterminate).toBe(false);
    expect(s.fill.style.width).toBe("50%");
  });

  it("names the run, defaults the name, and hides on end()", () => {
    const s = mount({ onCancel: () => {}, units: "" });
    s.view.begin();
    expect(s.label.textContent).toBe("Running…");
    s.view.update(2, 4, 100);
    // An empty units word leaves no trailing space behind the numbers.
    expect(s.count.textContent).toBe("2 / 4");
    s.view.end();
    expect(s.strip.hidden).toBe(true);
    expect(s.view.visible).toBe(false);
  });
});
