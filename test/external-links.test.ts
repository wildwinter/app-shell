// The family's rule for links the renderer may open: the About links, the app's own release pages (What's
// New's "Full release notes", which neither app let out before), and its own sites' pages; nothing else.

import { describe, expect, it } from "vitest";
import { externalLinkAllowed, releaseNotesUrl } from "../src/external-links.js";

const rules = { links: ["https://patterkit.dev", "https://ian.wildwinter.net"], repo: "patterkit/patter", sites: ["https://patterkit.dev"] };

describe("externalLinkAllowed", () => {
  it("lets out the About links as they are", () => {
    expect(externalLinkAllowed("https://ian.wildwinter.net", rules)).toBe(true);
  });

  it("lets out the app's own release pages, which What's New links to", () => {
    expect(externalLinkAllowed(releaseNotesUrl("patterkit/patter", "0.46.0"), rules)).toBe(true);
    expect(externalLinkAllowed("https://github.com/patterkit/patter/releases/tag/v1.0.0-beta.1", rules)).toBe(true);
  });

  it("refuses other repositories, other GitHub pages, and a release page with more on it", () => {
    expect(externalLinkAllowed("https://github.com/someone/else/releases/tag/v1.0.0", rules)).toBe(false);
    expect(externalLinkAllowed("https://github.com/patterkit/patter/releases/tag/play-js-v0.46.0", rules)).toBe(false);
    expect(externalLinkAllowed("https://github.com/patterkit/patter/issues", rules)).toBe(false);
    expect(externalLinkAllowed("https://github.com/patterkit/patter/releases/tag/v1.0.0?x=1", rules)).toBe(false);
    expect(externalLinkAllowed("https://github.com/patterkit/patter/releases/tag/v1.0.0/../../../evil", rules)).toBe(false);
  });

  it("lets out pages on the app's own sites, and only those", () => {
    expect(externalLinkAllowed("https://patterkit.dev/play/live-debug/", rules)).toBe(true);
    expect(externalLinkAllowed("https://patterkit.dev.example.com/", rules)).toBe(false);
    expect(externalLinkAllowed("https://example.com/", rules)).toBe(false);
  });

  it("refuses anything but https, credentials, and nonsense", () => {
    expect(externalLinkAllowed("http://patterkit.dev/", rules)).toBe(false);
    expect(externalLinkAllowed("file:///etc/passwd", rules)).toBe(false);
    expect(externalLinkAllowed("https://user:pw@patterkit.dev/", rules)).toBe(false);
    expect(externalLinkAllowed("not a url", rules)).toBe(false);
  });
});

describe("releaseNotesUrl", () => {
  it("is the repository's release page for the version's v-tag", () => {
    expect(releaseNotesUrl("storylet-studio/storylets", "0.28.0")).toBe("https://github.com/storylet-studio/storylets/releases/tag/v0.28.0");
  });
});
