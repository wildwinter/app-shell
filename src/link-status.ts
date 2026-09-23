// ---------------------------------------------------------------------------
// The live-link status chip: a compact control in the bottom-right corner for
// the loopback server a running game connects to. All the state collapses to
// one coloured "connect" icon (grey off, amber listening, green connected and
// in sync, red connected on a different build); click it to toggle the link
// (off -> listening -> stop), and while the link is up the copiable ws://
// address sits beside it. Patterpad's debug-panel.ts and Storyletter's
// live-link.ts were this file twice, character for character down to the
// 1000ms `.copied` revert. Styles ship as link-status.css.
//
// What the game sends is the app's business; this is the control and the
// status only.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { iconNode } from "./icons.js";
import { copyWithFeedback } from "./util.js";

export type LinkStatus =
  | { state: "off" }
  | { state: "error"; message: string }
  | { state: "listening"; port: number; address?: string }
  | {
      state: "connected"; port: number; address?: string;
      /** What connected, if it said. */
      project?: string;
      /** Whether the game's build matches the editor's. */
      build?: "match" | "stale" | "unknown";
      /** One extra sentence for the tip (Storyletter names the live boxes). */
      note?: string;
    };

/** The chip's colour class for a state: the four. */
export type LinkStatusClass = "off" | "listening" | "live" | "stale";

export interface LinkStatusOptions {
  /** A word beside the chip ("Live link"), so a bottom-corner plug is not a
   *  mystery. Omitted draws none. */
  label?: string;
  /** Start when off or failed, stop otherwise. A returned status is applied;
   *  a status pushed later through `apply` works as well. */
  onToggle: (current: LinkStatus) => LinkStatus | void | Promise<LinkStatus | void>;
  /** Runs after the address is copied. The copy itself is the chip's. */
  onCopy?: (address: string) => void;
  /** Controls before the address (Patterpad's flow picker). */
  lead?: HTMLElement[];
}

export interface LinkStatusChip {
  el: HTMLElement;
  apply(status: LinkStatus): void;
  status(): LinkStatus;
  /** Show / hide the control (shown when a project is open). */
  setVisible(on: boolean): void;
  /** Toggle the link (a menu item routes here). */
  toggle(): void;
}

export function linkStatusClass(s: LinkStatus): LinkStatusClass {
  if (s.state === "off" || s.state === "error") return "off";
  if (s.state === "listening") return "listening";
  return s.build === "stale" ? "stale" : "live";
}

/** The tooltip, spelling the state out. One wording for the family. */
export function linkStatusTip(s: LinkStatus): string {
  switch (s.state) {
    case "off": return "Live link is off. Click to start listening.";
    case "error": return `Live link failed (${s.message}). Click to retry.`;
    case "listening": return "Live link is listening for a game. Click to stop.";
    case "connected": {
      const who = s.project !== undefined ? ` to ${s.project}` : "";
      const build = s.build === "stale" ? " on a different build, so save or rebuild to re-sync"
        : s.build === "match" ? " and in sync" : "";
      const note = s.note ? ` ${s.note}` : "";
      return `Live link is connected${who}${build}.${note} Click to stop.`;
    }
  }
}

/** The address a game connects to. */
export function linkAddress(s: LinkStatus): string | undefined {
  if (s.state !== "listening" && s.state !== "connected") return undefined;
  return s.address ?? `ws://127.0.0.1:${s.port}`;
}

/** Where the chip sits, which link-status.css says too: its right inset, and the
 *  breathing room anything beside it keeps. Kept beside the reserve that uses
 *  them, since the reserve is a promise about the CSS. */
const CORNER_INSET = 14.5;
const CORNER_GAP = 12;

/** Mount the chip into `host` (document.body in both apps: it is fixed to the
 *  window's corner). Hidden until `setVisible(true)`. */
export function mountLinkStatus(host: HTMLElement, opts: LinkStatusOptions): LinkStatusChip {
  const wrap = el("div", "linkstatus"); wrap.hidden = true;
  const url = el("button", "linkstatus-url"); url.type = "button"; url.hidden = true;
  const toggle = el("button", "linkstatus-toggle off"); toggle.type = "button"; toggle.append(iconNode("connect"));
  if (opts.label !== undefined) wrap.append(el("span", "linkstatus-word", opts.label));
  wrap.append(...(opts.lead ?? []), url, toggle);
  host.append(wrap);

  let status: LinkStatus = { state: "off" };

  // The corner the chip floats over belongs to whatever the host put there: a
  // problems bar's error link and its buttons, a canvas strip's last control.
  // Both apps had it drawn under the chip (2026-09-17). So the chip publishes
  // how much of the corner it takes, as --linkstatus-reserve on the document,
  // and the things that can sit there leave that much room (the stepper bar
  // does, in stepper.css; a host's own strips opt in). 0px while hidden.
  // Re-measured on every render, because the address comes and goes, and on a
  // resize where the platform offers one, because a web font landing moves it.
  const root = host.ownerDocument.documentElement;
  const publishReserve = (): void => {
    const width = wrap.hidden ? 0 : wrap.getBoundingClientRect().width;
    root.style.setProperty("--linkstatus-reserve",
      width > 0 ? `${Math.ceil(width + CORNER_INSET + CORNER_GAP)}px` : "0px");
  };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(publishReserve).observe(wrap);

  const render = (): void => {
    toggle.className = `linkstatus-toggle ${linkStatusClass(status)}`;
    const tip = linkStatusTip(status);
    toggle.dataset["tip"] = tip;
    toggle.setAttribute("aria-label", tip);
    // The copiable address means something once the server is up.
    const addr = linkAddress(status);
    if (addr !== undefined) {
      url.textContent = addr;
      url.dataset["tip"] = "Click to copy the live link address";
      url.hidden = false;
    } else url.hidden = true;
    publishReserve();
  };
  const apply = (s: LinkStatus): void => { status = s; render(); };
  render();

  toggle.addEventListener("click", () => {
    const out = opts.onToggle(status);
    void Promise.resolve(out).then((next) => { if (next) apply(next); });
  });
  url.addEventListener("click", () => {
    const addr = url.textContent ?? "";
    if (!addr) return;
    void copyWithFeedback(url, addr);
    opts.onCopy?.(addr);
  });

  return {
    el: wrap, apply,
    status: () => status,
    setVisible(on: boolean): void { wrap.hidden = !on; publishReserve(); },
    toggle(): void { toggle.click(); },
  };
}
