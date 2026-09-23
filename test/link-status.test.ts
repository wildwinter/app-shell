// The live-link chip: four states, one tip wording, the copiable address and
// its 1000ms revert, and the toggle round trip.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountLinkStatus, linkStatusClass, linkStatusTip, linkAddress } from "../src/link-status.js";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe("the state table", () => {
  it("maps the states to the four classes", () => {
    expect(linkStatusClass({ state: "off" })).toBe("off");
    expect(linkStatusClass({ state: "error", message: "port busy" })).toBe("off");
    expect(linkStatusClass({ state: "listening", port: 7331 })).toBe("listening");
    expect(linkStatusClass({ state: "connected", port: 7331, build: "match" })).toBe("live");
    expect(linkStatusClass({ state: "connected", port: 7331 })).toBe("live");
    expect(linkStatusClass({ state: "connected", port: 7331, build: "stale" })).toBe("stale");
  });

  it("spells the tips one way, capitalised", () => {
    expect(linkStatusTip({ state: "off" })).toBe("Live link is off. Click to start listening.");
    expect(linkStatusTip({ state: "error", message: "port busy" })).toBe("Live link failed (port busy). Click to retry.");
    expect(linkStatusTip({ state: "listening", port: 1 })).toBe("Live link is listening for a game. Click to stop.");
    expect(linkStatusTip({ state: "connected", port: 1, project: "Tavern", build: "match" }))
      .toBe("Live link is connected to Tavern and in sync. Click to stop.");
    expect(linkStatusTip({ state: "connected", port: 1, build: "stale" }))
      .toBe("Live link is connected on a different build, so save or rebuild to re-sync. Click to stop.");
    expect(linkStatusTip({ state: "connected", port: 1, note: "Boxes: inn, road." }))
      .toBe("Live link is connected. Boxes: inn, road. Click to stop.");
  });

  it("derives the address from the port, or takes the one given", () => {
    expect(linkAddress({ state: "off" })).toBeUndefined();
    expect(linkAddress({ state: "listening", port: 7331 })).toBe("ws://127.0.0.1:7331");
    expect(linkAddress({ state: "connected", port: 1, address: "ws://10.0.0.2:1" })).toBe("ws://10.0.0.2:1");
  });
});

describe("mountLinkStatus", () => {
  it("mounts hidden, draws the word and the plug, and reflects each state", () => {
    const chip = mountLinkStatus(document.body, { label: "Live link", onToggle: () => {} });
    expect(chip.el.hidden).toBe(true);
    expect(chip.el.querySelector(".linkstatus-word")?.textContent).toBe("Live link");
    const toggle = chip.el.querySelector<HTMLButtonElement>(".linkstatus-toggle")!;
    expect(toggle.querySelector("svg[data-icon=connect]")).not.toBeNull();
    const url = chip.el.querySelector<HTMLButtonElement>(".linkstatus-url")!;
    expect(toggle.classList.contains("off")).toBe(true);
    expect(url.hidden).toBe(true);
    chip.setVisible(true);
    expect(chip.el.hidden).toBe(false);
    chip.apply({ state: "listening", port: 7331 });
    expect(toggle.className).toBe("linkstatus-toggle listening");
    expect(url.hidden).toBe(false);
    expect(url.textContent).toBe("ws://127.0.0.1:7331");
    expect(url.dataset["tip"]).toBe("Click to copy the live link address");
    chip.apply({ state: "connected", port: 7331, build: "stale" });
    expect(toggle.className).toBe("linkstatus-toggle stale");
    expect(toggle.getAttribute("aria-label")).toBe(linkStatusTip(chip.status()));
    expect(toggle.title).toBe("");
    chip.apply({ state: "error", message: "x" });
    expect(toggle.className).toBe("linkstatus-toggle off");
    expect(url.hidden).toBe(true);
  });

  it("toggles through onToggle and applies what comes back", async () => {
    const onToggle = vi.fn(async (s: { state: string }) => (s.state === "off" ? { state: "listening" as const, port: 9 } : { state: "off" as const }));
    const chip = mountLinkStatus(document.body, { onToggle });
    chip.toggle();
    await vi.runAllTimersAsync();
    expect(onToggle).toHaveBeenCalledWith({ state: "off" });
    expect(chip.status()).toEqual({ state: "listening", port: 9 });
    chip.toggle();
    await vi.runAllTimersAsync();
    expect(chip.status()).toEqual({ state: "off" });
  });

  it("copies the address, lights .copied for 1000ms, and reports the copy", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onCopy = vi.fn();
    const chip = mountLinkStatus(document.body, { onToggle: () => {}, onCopy });
    chip.apply({ state: "connected", port: 7331 });
    const url = chip.el.querySelector<HTMLButtonElement>(".linkstatus-url")!;
    url.click();
    expect(writeText).toHaveBeenCalledWith("ws://127.0.0.1:7331");
    expect(onCopy).toHaveBeenCalledWith("ws://127.0.0.1:7331");
    expect(url.classList.contains("copied")).toBe(true);
    vi.advanceTimersByTime(999);
    expect(url.classList.contains("copied")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(url.classList.contains("copied")).toBe(false);
  });
});

// The corner the chip floats over belongs to what the host put there: the
// problems bar's error link and buttons, a canvas strip's last control. Both
// apps drew those under the chip (2026-09-17), so the chip says how much of the
// corner it takes and they leave room.
describe("the corner the chip takes", () => {
  const reserve = (): string => document.documentElement.style.getPropertyValue("--linkstatus-reserve");
  afterEach(() => { document.documentElement.style.removeProperty("--linkstatus-reserve"); });

  it("is nothing while the chip is hidden", () => {
    const chip = mountLinkStatus(document.body, { label: "Live link", onToggle: () => {} });
    vi.spyOn(chip.el, "getBoundingClientRect").mockReturnValue({ width: 90 } as DOMRect);
    chip.apply({ state: "off" });
    expect(reserve()).toBe("0px");
  });

  it("is the chip's width plus its inset and a gap once shown, and nothing again once hidden", () => {
    const chip = mountLinkStatus(document.body, { label: "Live link", onToggle: () => {} });
    vi.spyOn(chip.el, "getBoundingClientRect").mockReturnValue({ width: 90 } as DOMRect);
    chip.setVisible(true);
    expect(reserve()).toBe("117px");   // ceil(90 + 14.5 + 12)
    chip.setVisible(false);
    expect(reserve()).toBe("0px");
  });

  it("follows the chip as the address appears, since that is what widens it", () => {
    const chip = mountLinkStatus(document.body, { label: "Live link", onToggle: () => {} });
    const rect = vi.spyOn(chip.el, "getBoundingClientRect").mockReturnValue({ width: 90 } as DOMRect);
    chip.setVisible(true);
    expect(reserve()).toBe("117px");
    rect.mockReturnValue({ width: 240 } as DOMRect);
    chip.apply({ state: "listening", port: 7331 });
    expect(reserve()).toBe("267px");   // ceil(240 + 14.5 + 12)
  });
});
