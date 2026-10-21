// The view scheme (view-serve.ts): the privileges entry, the generated page, files confined to the installed
// package, the view CSP on every response, and a session that reaches nothing off the scheme.
import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest } from "@wildwinter/toolkit/extensions";
import { readFileSync } from "node:fs";
import {
  VIEW_CSP, confined, guardViewSession, serveViews, viewContentType, viewPage, viewPageUrl, viewRequestAllowed,
  viewResponse, viewSchemePrivileges,
} from "../src/view-serve.js";
import type { ServeViewsOptions } from "../src/view-serve.js";

const ROOT = join(import.meta.dirname, "fixtures/probe-view");
const manifest = parseManifest(readFileSync(join(ROOT, "probe.extension.json"), "utf8"));
const opts: ServeViewsOptions = {
  scheme: "patter-view", host: "patter",
  resolve: (id) => (id === "probe" ? { root: ROOT, manifest } : null),
};

describe("viewSchemePrivileges", () => {
  it("is standard, secure and fetchable, and never bypasses the CSP", () => {
    expect(viewSchemePrivileges("patter-view")).toEqual({
      scheme: "patter-view", privileges: { standard: true, secure: true, supportFetchAPI: true },
    });
  });
});

describe("VIEW_CSP", () => {
  it("is the ruled policy", () => {
    expect(VIEW_CSP).toBe("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'");
  });
});

describe("viewResponse", () => {
  it("serves the view's page: its entry as a module and its element in the body, under the CSP", async () => {
    const res = await viewResponse(viewPageUrl("patter-view", "probe", "inspect"), opts);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe(VIEW_CSP);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const html = await res.text();
    expect(html).toContain(`<script type="module" src="/view/probe-view.js"></script>`);
    expect(html).toContain("<body><probe-view></probe-view></body>");
    expect(html).toContain("<title>Probe view</title>");
    expect(html).toContain("var(--ink");
  });

  it("serves the page with the head the URL asks for", async () => {
    const html = await (await viewResponse(viewPageUrl("patter-view", "probe", "inspect", { title: "Probe & co", pinned: false }), opts)).text();
    expect(html).toContain(`<span class="swin-title">Probe &amp; co</span>`);
    expect(html).toContain(`class="swin-pin" data-view-pin aria-pressed="false"`);
  });

  it("serves a package file with its type and the CSP", async () => {
    const res = await viewResponse("patter-view://probe/view/probe-view.js", opts);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toBe(VIEW_CSP);
    expect(await res.text()).toContain("customElements.define");
  });

  it("is 404 for an unknown extension, view, file, scheme, or a page with no view, still under the CSP", async () => {
    for (const url of [
      "patter-view://other/view/probe-view.js", "patter-view://probe/?view=nope", "patter-view://probe/",
      "patter-view://probe/view/missing.js", "storylet-view://probe/view/probe-view.js",
      "patter-view://probe/view/%2e%2e/%2e%2e/view-serve.test.ts", "patter-view://probe/view/..%2F..%2Fx",
    ]) {
      const res = await viewResponse(url, opts);
      expect(res.status, url).toBe(404);
      expect(res.headers.get("content-security-policy")).toBe(VIEW_CSP);
    }
  });

  it("doesn't serve a view the manifest offers another host only", async () => {
    const only = parseManifest(JSON.stringify({ ...manifest, views: [{ ...manifest.views![0], hosts: ["storylets"] }] }));
    const res = await viewResponse(viewPageUrl("patter-view", "probe", "inspect"), { ...opts, resolve: () => ({ root: ROOT, manifest: only }) });
    expect(res.status).toBe(404);
  });

  it("is reached through serveViews on a protocol", async () => {
    const handlers = new Map<string, (r: Request) => Promise<Response> | Response>();
    serveViews({ handle: (s, h) => { handlers.set(s, h); } }, opts);
    const res = await handlers.get("patter-view")!({ url: "patter-view://probe/probe.extension.json" } as Request);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});

describe("confined", () => {
  it("keeps a path inside the root, and refuses .., absolute, backslash, and links out", async () => {
    expect(await confined(ROOT, "/view/probe-view.js")).toBe(join(ROOT, "view/probe-view.js"));
    expect(await confined(ROOT, "/../view-serve.test.ts")).toBeNull();
    expect(await confined(ROOT, "/view/..%5C..%5Cx")).toBeNull();
    expect(await confined(ROOT, "//etc/passwd")).toBeNull();
    expect(await confined(ROOT, "/")).toBeNull();
    const d = await mkdtemp(join(tmpdir(), "view-serve-"));
    await writeFile(join(d, "outside.txt"), "secret");
    const pkg = await mkdtemp(join(tmpdir(), "view-serve-pkg-"));
    await symlink(join(d, "outside.txt"), join(pkg, "link.txt"));
    expect(await confined(pkg, "/link.txt")).toBeNull();
    for (const x of [d, pkg]) await rm(x, { recursive: true, force: true });
  });
});

describe("viewContentType and viewPage", () => {
  it("types by extension", () => {
    expect(viewContentType("a.CSS")).toBe("text/css; charset=utf-8");
    expect(viewContentType("a.woff2")).toBe("font/woff2");
    expect(viewContentType("a.bin")).toBe("application/octet-stream");
  });
  it("escapes the title", () => {
    expect(viewPage({ name: "<b>&", entry: "v.js", element: "x-y" })).toContain("<title>&lt;b&gt;&amp;</title>");
  });
  it("has no head unless asked", () => {
    const html = viewPage({ name: "V", entry: "v.js", element: "x-y" });
    expect(html).not.toContain("swin-head");
    expect(html).toContain("body > x-y { display: block; height: 100%; overflow: auto; }");
  });
  it("carries the shell's head above the view when asked: title, pin when there is one, close", () => {
    const html = viewPage({ name: "V", entry: "v.js", element: "x-y" }, { title: "<V>", pinned: true });
    expect(html).toContain("<title>&lt;V&gt;</title>");
    expect(html).toMatch(/<body><header class="swin-head" data-view-head><span class="swin-title">&lt;V&gt;<\/span>.*<\/header><x-y><\/x-y><\/body>/);
    expect(html).toContain(`class="swin-pin on" data-view-pin aria-pressed="true"`);
    expect(html).toContain(`data-view-close aria-label="Close (Esc)"`);
    expect(html).toContain("-webkit-app-region: drag");
    expect(html).toContain("flex: 1; min-height: 0");
    expect(viewPage({ name: "V", entry: "v.js", element: "x-y" }, { title: "V" })).not.toContain("data-view-pin");
  });
});

describe("guardViewSession", () => {
  it("cancels anything off the scheme and refuses every permission", () => {
    let before: ((d: { url: string }, cb: (r: { cancel?: boolean }) => void) => void) | undefined;
    let perm: ((wc: unknown, p: string, cb: (g: boolean) => void) => void) | null = null;
    let check: ((...a: unknown[]) => boolean) | null = null;
    guardViewSession({
      webRequest: { onBeforeRequest: (l) => { before = l; } },
      setPermissionRequestHandler: (h) => { perm = h; },
      setPermissionCheckHandler: (h) => { check = h; },
    }, "patter-view");
    const cancelled = (url: string): boolean | undefined => { let c: boolean | undefined; before!({ url }, (r) => { c = r.cancel; }); return c; };
    expect(cancelled("patter-view://probe/view/probe-view.js")).toBe(false);
    expect(cancelled("devtools://devtools/bundled/x.html")).toBe(false);
    expect(cancelled("data:image/png;base64,AA")).toBe(false);
    expect(cancelled("https://example.com/")).toBe(true);
    expect(cancelled("file:///etc/passwd")).toBe(true);
    expect(cancelled("storylet-asset://x")).toBe(true);
    const cb = vi.fn();
    perm!(null, "media", cb);
    expect(cb).toHaveBeenCalledWith(false);
    expect(check!()).toBe(false);
    expect(viewRequestAllowed("PATTER-VIEW://probe/", "patter-view")).toBe(true);
  });
});
