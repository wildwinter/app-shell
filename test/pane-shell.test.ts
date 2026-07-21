// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mountPaneShell } from "../src/pane-shell.js";

function mount(initial?: Parameters<typeof mountPaneShell>[1]["initial"], onChange = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const shell = mountPaneShell(host, {
    nav: { defaultWidth: "224px", label: "navigator", shortcutHint: "Cmd+1" },
    inspector: { defaultWidth: "384px", label: "inspector", shortcutHint: "Cmd+2" },
    ...(initial ? { initial } : {}),
    onChange,
  });
  return { host, shell, onChange, panes: host.querySelector<HTMLElement>(".panes")! };
}

describe("mountPaneShell", () => {
  it("builds the frame with fillable slots", () => {
    const { host, shell } = mount();
    expect(host.querySelector(".topbar")).not.toBeNull();
    expect(host.querySelector(".panes")).not.toBeNull();
    expect(host.querySelectorAll(".pane-toggle")).toHaveLength(2);
    // Host-fillable regions are returned.
    shell.nav.append(document.createTextNode("nav content"));
    shell.centre.append(document.createTextNode("centre"));
    shell.inspector.append(document.createTextNode("insp"));
    shell.topbarLead.append(document.createTextNode("title"));
    expect(host.querySelector(".pane-nav .pane-inner")!.textContent).toBe("nav content");
  });

  it("collapses and expands a pane, persisting each change", () => {
    const { shell, onChange, panes } = mount();
    expect(panes.classList.contains("no-nav")).toBe(false);
    shell.togglePane("nav");
    expect(panes.classList.contains("no-nav")).toBe(true);
    expect(shell.isOpen("nav")).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ open: { nav: false, inspector: true } }));
    shell.togglePane("nav");
    expect(panes.classList.contains("no-nav")).toBe(false);
  });

  it("honours initial state (closed inspector + a dragged nav width)", () => {
    const { shell, panes } = mount({ open: { nav: true, inspector: false }, width: { nav: 300 } });
    expect(panes.classList.contains("no-inspector")).toBe(true);
    expect(shell.isOpen("inspector")).toBe(false);
    expect(panes.style.getPropertyValue("--nav-open-w")).toBe("300px");
  });

  it("setPaneOpen is idempotent (no spurious persist)", () => {
    const { shell, onChange } = mount({ open: { nav: true, inspector: true }, width: {} });
    shell.setPaneOpen("nav", true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resetWidths clears dragged widths back to defaults", () => {
    const { shell, panes } = mount({ open: { nav: true, inspector: true }, width: { nav: 300, inspector: 500 } });
    expect(panes.style.getPropertyValue("--nav-open-w")).toBe("300px");
    shell.resetWidths();
    expect(panes.style.getPropertyValue("--nav-open-w")).toBe("224px");
    expect(shell.state().width).toEqual({});
  });

  it("swaps the toggle glyph and aria by open state", () => {
    const { host, shell } = mount();
    const navBtn = host.querySelectorAll<HTMLButtonElement>(".pane-toggle")[0]!;
    expect(navBtn.textContent).toBe("‹");                 // open -> collapse-left chevron
    expect(navBtn.getAttribute("aria-pressed")).toBe("true");
    shell.togglePane("nav");
    expect(navBtn.textContent).toBe("›");
    expect(navBtn.title).toContain("Show navigator");
    expect(navBtn.title).toContain("Cmd+1");
  });
});
