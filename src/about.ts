// ---------------------------------------------------------------------------
// The About surface: every app in the family has one, and it should never be
// the grey OS panel (design-language, "coherent to the edges").
//
// Patterpad's, generalised. Theirs reuses its updater-dialog chrome and hard
// codes the PatterKit wordmark; the shell takes the wordmark as markup from the
// app, because that is the one part that is genuinely per-product. Everything
// else - the layout, the type, the link handling, the single Close - is the
// family's, so two apps' About boxes are recognisably siblings.
//
// The host opens links, because a renderer cannot: `onOpenLink` goes through
// the app's own IPC to `shell.openExternal`. Without it the links are shown as
// plain text rather than as buttons that do nothing.
// ---------------------------------------------------------------------------

import { el } from "./dom.js";
import { dialogFrame } from "./dialog.js";

export interface AboutOptions {
  /** The product's name, large. */
  appName: string;
  /** "1.4.2" - shown as "Version 1.4.2". */
  version: string;
  /** One or two sentences: what this app is for. */
  blurb?: string;
  /** Licence, authorship, the suite it belongs to. Newlines are respected. */
  credits?: string;
  links?: { label: string; url: string }[];
  /** Inline SVG for the product wordmark, if it has one. */
  wordmark?: string;
  /** Open a URL in the real browser. Omit and the links render as text. */
  onOpenLink?: (url: string) => void;
}

/** Show the About dialog. Resolves when it closes. */
export function showAbout(opts: AboutOptions): Promise<void> {
  return new Promise((resolve) => {
    // On the family's frame: the product name is the frame's title, centred by
    // about.css, and the wordmark sits above it.
    const frame = dialogFrame({ title: opts.appName, className: "shell-about", onClose: () => resolve() });
    frame.dialog.setAttribute("aria-label", `About ${opts.appName}`);
    if (opts.wordmark !== undefined) {
      const mark = el("div", "shell-about-mark");
      mark.innerHTML = opts.wordmark;
      frame.dialog.prepend(mark);
    }
    frame.body.append(el("div", "shell-about-version", `Version ${opts.version}`));
    if (opts.blurb !== undefined) frame.body.append(el("p", "shell-about-blurb", opts.blurb));
    if (opts.credits !== undefined) frame.body.append(el("p", "shell-about-credits", opts.credits));

    if (opts.links?.length) {
      const row = el("div", "shell-about-links");
      for (const link of opts.links) {
        if (!opts.onOpenLink) { row.append(el("span", "shell-about-link", link.label)); continue; }
        const a = el("button", "shell-about-link", link.label);
        a.type = "button";
        a.addEventListener("click", () => opts.onOpenLink?.(link.url));
        row.append(a);
      }
      frame.body.append(row);
    }

    const close = el("button", "btn shell-about-close", "Close");
    close.type = "button";
    close.addEventListener("click", () => frame.close());
    frame.actions.append(close);
    frame.open();
    close.focus();
  });
}
