// ---------------------------------------------------------------------------
// mountPaneShell: the app-frame both editors share - a top bar with compact
// pane toggles, a nav | centre | inspector grid whose side panes collapse and
// resize, and width/open-state persistence via a host callback. The host fills
// the pane bodies + top-bar slots and owns its own keyboard accelerators
// (call togglePane); the frame owns layout, collapse, drag-resize, and state.
//
// The frame CSS ships alongside as pane-shell.css (import it once at the app
// root). It reads the shared token grammar (tokens.css).
// ---------------------------------------------------------------------------

export type PaneSide = "nav" | "inspector";

export interface PaneSideConfig {
  /** The open width as a CSS length, e.g. "14rem" or "224px". */
  defaultWidth: string;
  /** Drag floor in px (default 160). */
  minWidth?: number;
  /** Drag ceiling in px from the window width (default w => min(640, w - 420)). */
  maxWidth?: (innerWidth: number) => number;
  /** Whether a drag seam is offered (default true). */
  resizable?: boolean;
  /** Noun for the toggle's tooltip/aria, e.g. "navigator" / "inspector". */
  label?: string;
  /** Shortcut hint appended to the tooltip, e.g. "Cmd+1". */
  shortcutHint?: string;
  /** false = the pane is not offered at all: no toggle, togglePane ignored,
   *  forced closed whatever the remembered state says. For a slot a host has
   *  retired but keeps mounted (Storyletter's inspector) - the shell used to
   *  offer a chevron that opened a paneful of nothing. Default true. */
  offered?: boolean;
}

export interface PaneShellState {
  open: Record<PaneSide, boolean>;
  /** Dragged widths in px; absent = the config default. */
  width: Partial<Record<PaneSide, number>>;
}

export interface PaneShellOptions {
  nav: PaneSideConfig;
  inspector: PaneSideConfig;
  /** Initial open + width state (from the host's store). */
  initial?: Partial<PaneShellState>;
  /** Persist state after any toggle or resize (host wires it to its store). */
  onChange?: (state: PaneShellState) => void;
}

export interface PaneShell {
  /** The frame element (top bar + panes); mount it into the app container. */
  readonly root: HTMLElement;
  readonly topbar: HTMLElement;
  /** Top-bar host slots: leading (title) and trailing (status), the host fills. */
  readonly topbarLead: HTMLElement;
  readonly topbarTrail: HTMLElement;
  /** Pane bodies the host fills (the fixed-width inner that clips on collapse). */
  readonly nav: HTMLElement;
  readonly centre: HTMLElement;
  readonly inspector: HTMLElement;
  togglePane(side: PaneSide): void;
  setPaneOpen(side: PaneSide, open: boolean): void;
  isOpen(side: PaneSide): boolean;
  /** Clear dragged widths back to the config defaults. */
  resetWidths(): void;
  /** A snapshot of the current state (open + widths). */
  state(): PaneShellState;
  destroy(): void;
}

const DEFAULT_MAX = (w: number): number => Math.min(640, w - 420);
const openVar: Record<PaneSide, string> = { nav: "--nav-open-w", inspector: "--insp-open-w" };
const collapseClass: Record<PaneSide, string> = { nav: "no-nav", inspector: "no-inspector" };

export function mountPaneShell(host: HTMLElement, opts: PaneShellOptions): PaneShell {
  const cfg: Record<PaneSide, PaneSideConfig> = { nav: opts.nav, inspector: opts.inspector };
  const offered = (side: PaneSide): boolean => cfg[side].offered !== false;
  const open: Record<PaneSide, boolean> = {
    nav: offered("nav") && (opts.initial?.open?.nav ?? true),
    inspector: offered("inspector") && (opts.initial?.open?.inspector ?? true),
  };
  const width: Partial<Record<PaneSide, number>> = { ...(opts.initial?.width ?? {}) };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  // --- top bar ---------------------------------------------------------------
  const navToggle = el("button", "pane-toggle");
  navToggle.type = "button";
  const inspToggle = el("button", "pane-toggle");
  inspToggle.type = "button";
  const topbarLead = el("div", "topbar-lead");
  const topbarTrail = el("div", "topbar-trail");
  const spacer = el("span", "topbar-spacer");
  const topbar = el("header", "topbar");
  topbar.append(navToggle, topbarLead, spacer, topbarTrail, inspToggle);

  // --- panes -----------------------------------------------------------------
  const panes = el("main", "panes");
  const navPane = el("nav", "pane pane-nav");
  const navInner = el("div", "pane-inner");
  navPane.append(navInner);
  const centre = el("section", "pane-centre");
  const inspPane = el("aside", "pane pane-inspector");
  const inspInner = el("div", "pane-inner");
  inspPane.append(inspInner);
  const navResizer = el("div", "pane-resizer pane-resizer-nav");
  const inspResizer = el("div", "pane-resizer pane-resizer-insp");
  panes.append(navPane, centre, inspPane, navResizer, inspResizer);

  const root = el("div", "pane-shell");
  root.append(topbar, panes);
  host.append(root);
  // An unoffered pane's toggle is not hidden but ABSENT: nothing to
  // discover, nothing to tab to.
  if (!offered("nav")) navToggle.remove();
  if (!offered("inspector")) inspToggle.remove();

  // --- state application -----------------------------------------------------
  function applyToggleGlyph(side: PaneSide, button: HTMLButtonElement): void {
    const isOpen = open[side];
    // Chevron points toward where the pane collapses to.
    button.textContent = side === "nav" ? (isOpen ? "‹" : "›") : (isOpen ? "›" : "‹");
    const noun = cfg[side].label ?? side;
    const hint = cfg[side].shortcutHint ? ` (${cfg[side].shortcutHint})` : "";
    button.title = `${isOpen ? "Hide" : "Show"} ${noun}${hint}`;
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(isOpen));
  }

  function apply(): void {
    panes.classList.toggle(collapseClass.nav, !open.nav);
    panes.classList.toggle(collapseClass.inspector, !open.inspector);
    // The open widths live on the grid: the track and each .pane-inner read them.
    panes.style.setProperty(openVar.nav, width.nav !== undefined ? `${width.nav}px` : cfg.nav.defaultWidth);
    panes.style.setProperty(openVar.inspector, width.inspector !== undefined ? `${width.inspector}px` : cfg.inspector.defaultWidth);
    applyToggleGlyph("nav", navToggle);
    applyToggleGlyph("inspector", inspToggle);
    navResizer.style.display = cfg.nav.resizable === false || !offered("nav") ? "none" : "";
    inspResizer.style.display = cfg.inspector.resizable === false || !offered("inspector") ? "none" : "";
  }

  const snapshot = (): PaneShellState => ({ open: { ...open }, width: { ...width } });
  const persist = (): void => opts.onChange?.(snapshot());

  function setPaneOpen(side: PaneSide, next: boolean): void {
    if (open[side] === next) return;
    open[side] = next;
    apply();
    persist();
  }
  function togglePane(side: PaneSide): void { if (offered(side)) setPaneOpen(side, !open[side]); }
  function resetWidths(): void { delete width.nav; delete width.inspector; apply(); persist(); }

  navToggle.addEventListener("click", () => togglePane("nav"));
  inspToggle.addEventListener("click", () => togglePane("inspector"));

  // --- drag resize -----------------------------------------------------------
  function beginResize(side: PaneSide, startEvent: PointerEvent): void {
    if (cfg[side].resizable === false || !open[side]) return;
    startEvent.preventDefault();
    const pane = side === "nav" ? navPane : inspPane;
    const min = cfg[side].minWidth ?? 160;
    const max = cfg[side].maxWidth ?? DEFAULT_MAX;
    const startX = startEvent.clientX;
    const startW = pane.getBoundingClientRect().width;
    document.body.classList.add("pane-resizing");
    let latest = startW;
    const onMove = (e: PointerEvent): void => {
      const delta = side === "nav" ? e.clientX - startX : startX - e.clientX;
      latest = Math.max(min, Math.min(max(window.innerWidth), startW + delta));
      panes.style.setProperty(openVar[side], `${latest}px`);
    };
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("pane-resizing");
      width[side] = latest;
      persist();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  navResizer.addEventListener("pointerdown", (e) => beginResize("nav", e));
  inspResizer.addEventListener("pointerdown", (e) => beginResize("inspector", e));
  navResizer.addEventListener("dblclick", () => { delete width.nav; apply(); persist(); });
  inspResizer.addEventListener("dblclick", () => { delete width.inspector; apply(); persist(); });

  apply();

  return {
    root, topbar, topbarLead, topbarTrail,
    nav: navInner, centre, inspector: inspInner,
    togglePane, setPaneOpen, isOpen: (s) => open[s], resetWidths, state: snapshot,
    destroy: () => { root.remove(); },
  };
}
