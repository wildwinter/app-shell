// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { mountPaneShell } from "../src/pane-shell.js";
import { setKeyPlatform } from "../src/keys.js";

const el = (tag: keyof HTMLElementTagNameMap, text = ""): HTMLElement => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};

afterEach(() => { setKeyPlatform(undefined); });

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
  it("an unoffered pane has no toggle and cannot be opened", () => {
    // Storyletter's inspector slot is retired but stayed mounted, so the
    // shell still offered a chevron that opened 384px of nothing - the
    // editor antagonist audit's blank-pane find (2026-08-29). A pane a host
    // is not offering renders no toggle, ignores togglePane, and stays
    // closed whatever the remembered state says.
    const host = document.createElement("div");
    document.body.append(host);
    const shell = mountPaneShell(host, {
      nav: { defaultWidth: "224px", label: "navigator" },
      inspector: { defaultWidth: "384px", label: "inspector", offered: false },
      initial: { open: { nav: true, inspector: true } },
      onChange: vi.fn(),
    });
    expect(host.querySelectorAll(".pane-toggle")).toHaveLength(1);
    expect(shell.isOpen("inspector")).toBe(false);
    shell.togglePane("inspector");
    expect(shell.isOpen("inspector")).toBe(false);
    expect(host.querySelector(".panes")!.classList.contains("no-inspector")).toBe(true);
  });

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

  it("swaps the toggle icon and aria by open state", () => {
    const { host, shell } = mount();
    const navBtn = host.querySelectorAll<HTMLButtonElement>(".pane-toggle")[0]!;
    const drawn = (): string | null => navBtn.querySelector("svg")?.getAttribute("data-icon") ?? null;
    expect(drawn()).toBe("back");                          // open -> collapse-left chevron
    expect(navBtn.textContent).toBe("");                   // drawn, never typed
    expect(navBtn.getAttribute("aria-pressed")).toBe("true");
    shell.togglePane("nav");
    expect(drawn()).toBe("forward");
    expect(navBtn.querySelectorAll("svg")).toHaveLength(1); // replaced, not stacked
    // The rollover is the themed one (`data-tip`), never an OS `title`.
    expect(navBtn.title).toBe("");
    expect(navBtn.dataset["tip"]).toBe("Show navigator (Cmd+1)");
    expect(navBtn.getAttribute("aria-label")).toBe("Show navigator (Cmd+1)");
  });

  it("spells a shortcutHint combo for the platform, and a literal as written", () => {
    // "Mod+1" is the portable spelling: the toggle says "(⌘1)" on a Mac and
    // "(Ctrl+1)" elsewhere, like every other tip built with tipWithKey. A
    // literal such as "Cmd+1" (what 0.39.0 callers wrote) is not touched.
    const build = (): NodeListOf<HTMLButtonElement> => {
      const host = document.createElement("div");
      document.body.append(host);
      mountPaneShell(host, {
        nav: { defaultWidth: "224px", label: "navigator", shortcutHint: "Mod+1" },
        inspector: { defaultWidth: "384px", label: "inspector", shortcutHint: "Cmd+2" },
        initial: { open: { nav: false, inspector: false } },
      });
      return host.querySelectorAll<HTMLButtonElement>(".pane-toggle");
    };
    setKeyPlatform("mac");
    let [nav, insp] = build();
    expect(nav!.dataset["tip"]).toBe("Show navigator (⌘1)");
    expect(nav!.getAttribute("aria-label")).toBe("Show navigator (⌘1)");
    expect(insp!.dataset["tip"]).toBe("Show inspector (Cmd+2)");
    setKeyPlatform("win");
    [nav, insp] = build();
    expect(nav!.dataset["tip"]).toBe("Show navigator (Ctrl+1)");
    expect(insp!.dataset["tip"]).toBe("Show inspector (Cmd+2)");
    expect(document.querySelector("[title]")).toBeNull();
  });

  it("takes the toggle rollover from tipFor when given", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shell = mountPaneShell(host, {
      nav: { defaultWidth: "224px" }, inspector: { defaultWidth: "384px" },
      tipFor: (side, open) => `${open ? "Hide" : "Show"} ${side === "nav" ? "scenes" : "inspector"} (⌘${side === "nav" ? 1 : 2})`,
    });
    const [navBtn, inspBtn] = host.querySelectorAll<HTMLButtonElement>(".pane-toggle");
    expect(navBtn!.dataset["tip"]).toBe("Hide scenes (⌘1)");
    expect(inspBtn!.dataset["tip"]).toBe("Hide inspector (⌘2)");
    shell.togglePane("nav");
    expect(navBtn!.dataset["tip"]).toBe("Show scenes (⌘1)");
    expect(navBtn!.getAttribute("aria-label")).toBe("Show scenes (⌘1)");
    expect(host.querySelector("[title]")).toBeNull();
  });

  it("collapseAlso toggles the app's own class beside the shell's, with the side's collapsed state", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shell = mountPaneShell(host, {
      nav: { defaultWidth: "224px" }, inspector: { defaultWidth: "384px" },
      collapseAlso: { inspector: "props-doc-open" },
    });
    const panes = host.querySelector(".panes")!;
    expect(panes.classList.contains("props-doc-open")).toBe(false);
    shell.togglePane("inspector");
    expect(panes.classList.contains("no-inspector")).toBe(true);
    expect(panes.classList.contains("props-doc-open")).toBe(true);
    // The nav has no extra class, so nothing else appears when it collapses.
    shell.togglePane("nav");
    expect(panes.className).toBe("panes no-inspector props-doc-open no-nav");
    shell.togglePane("inspector");
    expect(panes.classList.contains("props-doc-open")).toBe(false);
  });

  it("holdClosed folds a side without touching the remembered state, and releasing restores it", () => {
    const { shell, onChange, panes } = mount({ open: { nav: true, inspector: true }, width: {} });
    shell.holdClosed("inspector", true);
    expect(panes.classList.contains("no-inspector")).toBe(true);
    expect(shell.isOpen("inspector")).toBe(false);
    expect(shell.state().open.inspector).toBe(true);   // the person's choice, untouched
    expect(onChange).not.toHaveBeenCalled();            // and not persisted
    shell.holdClosed("inspector", false);
    expect(panes.classList.contains("no-inspector")).toBe(false);
    expect(shell.isOpen("inspector")).toBe(true);
  });

  // jsdom implements no `inert` (an inert subtree still takes focus there), so
  // this reads the Tab order as a browser builds it: every focusable control,
  // less anything under an `inert` ancestor.
  const tabbable = (root: ParentNode): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]")]
      .filter((n) => !(n as HTMLButtonElement).disabled && n.tabIndex >= 0 && n.closest("[inert]") === null);

  it("a collapsed pane's controls leave the Tab order, and come back when it opens", () => {
    // The hands-on review of October 2026: a collapsed pane was hidden with
    // opacity and pointer-events only, so Tab still walked through its
    // invisible buttons.
    const { host, shell } = mount();
    const inNav = el("button", "Scene one");
    const inInsp = el("button", "Speaker");
    shell.nav.append(inNav);
    shell.inspector.append(inInsp);
    expect(tabbable(host)).toContain(inNav);
    shell.togglePane("nav");
    expect(tabbable(host)).not.toContain(inNav);
    expect(tabbable(host)).toContain(inInsp);
    shell.togglePane("nav");
    expect(tabbable(host)).toContain(inNav);
    // A hold folds it away just the same, and releasing it gives it back.
    shell.holdClosed("inspector", true);
    expect(tabbable(host)).not.toContain(inInsp);
    shell.holdClosed("inspector", false);
    expect(tabbable(host)).toContain(inInsp);
    // The pane toggles themselves stay reachable.
    expect(tabbable(host).filter((n) => n.classList.contains("pane-toggle"))).toHaveLength(2);
  });

  it("a pane mounted closed starts out of the Tab order", () => {
    const { host, shell } = mount({ open: { nav: true, inspector: false } });
    const inInsp = el("button", "Speaker");
    shell.inspector.append(inInsp);
    expect(tabbable(host)).not.toContain(inInsp);
  });
});

describe("focusOrToggle (Cmd+1 / Cmd+2)", () => {
  afterEach(() => { document.body.replaceChildren(); });

  function frame(extra: Partial<Parameters<typeof mountPaneShell>[1]> = {}, initial?: Parameters<typeof mountPaneShell>[1]["initial"]) {
    const host = document.createElement("div");
    document.body.append(host);
    const shell = mountPaneShell(host, {
      nav: { defaultWidth: "224px", label: "navigator" },
      inspector: { defaultWidth: "384px", label: "inspector" },
      ...(initial ? { initial } : {}),
      ...extra,
    });
    const editor = el("button", "Editor");
    shell.centre.append(editor);
    const first = el("button", "First row");
    const second = el("button", "Second row");
    shell.nav.append(el("span", "Scenes"), first, second);
    return { host, shell, editor, first, second };
  }

  it("opens a closed pane and moves focus to its first control", () => {
    const { shell, editor, first } = frame({}, { open: { nav: false, inspector: true } });
    editor.focus();
    shell.focusOrToggle("nav");
    expect(shell.isOpen("nav")).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("moves focus into an open pane when focus is outside it, and leaves it open", () => {
    const { shell, editor, first } = frame();
    editor.focus();
    shell.focusOrToggle("nav");
    expect(shell.isOpen("nav")).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("closes the pane when focus is already inside, and gives focus back to where it was", () => {
    const { shell, editor, second } = frame();
    editor.focus();
    shell.focusOrToggle("nav");          // into the pane
    second.focus();                      // the person moves about inside it
    shell.focusOrToggle("nav");          // and presses it again
    expect(shell.isOpen("nav")).toBe(false);
    expect(document.activeElement).toBe(editor);
  });

  it("closing with nothing to go back to lands on the host's focusHome", () => {
    const home = el("div", "Script");
    home.tabIndex = -1;
    const { shell, first } = frame({ focusHome: () => home });
    document.body.append(home);
    first.focus();                       // clicked straight in: no earlier place
    shell.focusOrToggle("nav");
    expect(shell.isOpen("nav")).toBe(false);
    expect(document.activeElement).toBe(home);
  });

  it("falls back to focusHome when the earlier place has gone from the page", () => {
    const home = el("div", "Script");
    home.tabIndex = -1;
    const { shell, editor } = frame({ focusHome: () => home });
    document.body.append(home);
    editor.focus();
    shell.focusOrToggle("nav");
    editor.remove();                     // re-rendered while focus was away
    shell.focusOrToggle("nav");
    expect(document.activeElement).toBe(home);
  });

  it("without focusHome, falls back to the centre's first control", () => {
    const { shell, editor, first } = frame();
    first.focus();
    shell.focusOrToggle("nav");
    expect(document.activeElement).toBe(editor);
  });

  it("focuses the element the host names for a side", () => {
    const search = el("input");
    const { shell, editor } = frame({ focusTarget: { nav: () => search } });
    shell.nav.prepend(el("button", "Before"));
    shell.nav.append(search);
    editor.focus();
    shell.focusOrToggle("nav");
    expect(document.activeElement).toBe(search);
  });

  it("an empty pane takes focus itself", () => {
    const { shell, editor } = frame();
    editor.focus();
    shell.focusOrToggle("inspector");
    expect(document.activeElement).toBe(shell.inspector);
    shell.focusOrToggle("inspector");
    expect(shell.isOpen("inspector")).toBe(false);
    expect(document.activeElement).toBe(editor);
  });

  it("collapsing a pane that holds focus moves focus out of it", () => {
    // A collapsed pane is inert, and a browser drops focus inside an inert
    // subtree to <body>; the shell hands it somewhere useful first.
    const { shell, editor, first } = frame();
    editor.focus();
    shell.focusOrToggle("nav");
    expect(document.activeElement).toBe(first);
    shell.togglePane("nav");             // the toggle button, or the menu's plain toggle
    expect(document.activeElement).toBe(editor);
  });

  it("does nothing for a pane that isn't offered", () => {
    const { shell, editor } = frame({ inspector: { defaultWidth: "384px", offered: false } });
    editor.focus();
    shell.focusOrToggle("inspector");
    expect(shell.isOpen("inspector")).toBe(false);
    expect(document.activeElement).toBe(editor);
  });

  it("a held pane keeps the plain toggle and leaves focus alone", () => {
    const { shell, editor } = frame();
    shell.holdClosed("nav", true);
    editor.focus();
    shell.focusOrToggle("nav");
    expect(shell.state().open.nav).toBe(false);   // the remembered choice flips, as togglePane does
    expect(shell.isOpen("nav")).toBe(false);
    expect(document.activeElement).toBe(editor);
  });
});

