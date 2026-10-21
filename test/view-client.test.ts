// The view client (view-client.ts) end to end against hostView over a real MessageChannel: connect and its
// refusals, typed requests and refusals as errors, events, the theme on the root, and key forwarding.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ViewRefusalError, comboOf, connect } from "../src/view-client.js";
import type { ViewClient } from "../src/view-client.js";
import { hostView, hostViews, onViewPort, readTheme } from "../src/view-host-web.js";
import { VIEW_API, VIEW_PORT_MESSAGE } from "../src/view-protocol.js";
import type { ViewAdapter, ViewHandle, ViewPortMeta } from "../src/view-protocol.js";

const META: ViewPortMeta = { window: 3, extension: "probe", view: "inspect", version: "1.0.0" };
const keys: string[] = [];
const writes: unknown[] = [];
let readOnly = false;
const adapter: ViewAdapter = {
  host: "storylets",
  project: () => ({ id: "p", kind: "project", parent: null, label: "Deck", host: {}, ext: {} }),
  node: (id) => ({ id, kind: "card", parent: "d", label: `Card ${id}`, host: {}, ext: { probe: { note: "hi" }, other: { no: 1 } } }),
  selection: () => ({ path: [{ id: "c1", kind: "card" }] }),
  write: (ext, label, edits) => { writes.push([ext, label, edits]); },
  select: () => true,
  writable: () => (readOnly ? { readOnly: true, why: "It's locked." } : { readOnly: false }),
  key: (combo) => { keys.push(combo); },
};

const cleanup: (() => void)[] = [];
afterEach(() => { for (const f of cleanup.splice(0)) f(); keys.length = 0; writes.length = 0; readOnly = false; });

async function pair(theme: { scheme: "dark" | "light"; tokens: Record<string, string> } = { scheme: "dark", tokens: { "--ink": "#eeeeee", "--bg": "#111111" } }): Promise<{ app: ViewClient; host: ViewHandle }> {
  const { port1, port2 } = new MessageChannel();
  const host = hostView(port2, adapter, { meta: META, reads: [], theme: () => theme, debounceMs: 5 });
  const app = await connect({ port: port1 });
  cleanup.push(() => { app.close(); host.close(); port1.close(); port2.close(); });
  return { app, host };
}

describe("connect", () => {
  it("says hello and resolves on the welcome, applying the theme to the root", async () => {
    const { app } = await pair();
    expect(app.welcome).toMatchObject({ t: "welcome", api: VIEW_API, host: "storylets", extension: { id: "probe", version: "1.0.0" } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--ink")).toBe("#eeeeee");
    expect(root.style.getPropertyValue("color-scheme")).toBe("dark");
  });

  it("rejects with the host's sentence when refused", async () => {
    const { port1, port2 } = new MessageChannel();
    cleanup.push(() => { port1.close(); port2.close(); });
    port2.onmessage = () => port2.postMessage({ t: "refused", message: "Probe's view was built for view API 2; this app serves 1." });
    await expect(connect({ port: port1 })).rejects.toThrow("Probe's view was built for view API 2; this app serves 1.");
  });

  it("rejects on a timeout when no port comes", async () => {
    await expect(connect({ timeoutMs: 20 })).rejects.toThrow("The app didn't answer this view in time.");
  });

  it("takes the port the preload posts on the window", async () => {
    const { port1, port2 } = new MessageChannel();
    const host = hostView(port2, adapter, { meta: META, reads: [], theme: () => ({ scheme: "light", tokens: {} }) });
    const pending = connect({ timeoutMs: 1000 });
    const e = new Event("message");
    Object.defineProperties(e, { data: { value: VIEW_PORT_MESSAGE }, ports: { value: [port1] }, source: { value: window } });
    window.dispatchEvent(e);
    const app = await pending;
    cleanup.push(() => { app.close(); host.close(); port2.close(); });
    expect(app.welcome.view).toBe("inspect");
  });
});

describe("requests and events", () => {
  it("makes typed requests, ext kept to its own", async () => {
    const { app } = await pair();
    expect(await app.selection()).toEqual({ path: [{ id: "c1", kind: "card" }] });
    expect((await app.node("c1"))?.ext).toEqual({ probe: { note: "hi" } });
    expect((await app.project()).label).toBe("Deck");
    expect(await app.select("c1")).toBe(true);
    expect(await app.write("Note", [{ node: "c1", field: "note", value: "there" }])).toEqual({ written: 1 });
    expect(writes).toEqual([["probe", "Note", [{ node: "c1", field: "note", value: "there" }]]]);
  });

  it("rejects a refusal with its code", async () => {
    const { app } = await pair();
    const err = await app.media(["c1"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ViewRefusalError);
    expect((err as ViewRefusalError).refusal.code).toBe("unsupported");
    readOnly = true;
    await expect(app.write("x", [{ node: "c1", field: "note" }])).rejects.toThrow("It's locked.");
  });

  it("hears events, unsubscribes, and applies a new theme", async () => {
    const theme = { scheme: "dark" as const, tokens: { "--ink": "#eeeeee" } };
    const { app, host } = await pair(theme);
    const heard: unknown[] = [];
    const off = app.on("changed", (v) => heard.push(v));
    host.changed(["c1"]);
    await new Promise((r) => setTimeout(r, 30));
    expect(heard).toEqual([{ nodes: ["c1"] }]);
    off();
    host.changed("all");
    const themed = new Promise((r) => app.on("theme", r));
    theme.tokens["--ink"] = "#000000";
    host.theme();
    await themed;
    expect(heard).toHaveLength(1);
    expect(document.documentElement.style.getPropertyValue("--ink")).toBe("#000000");
  });

  it("rejects what's waiting when closed", async () => {
    const { app } = await pair();
    const p = app.selection();
    app.close();
    await expect(p).rejects.toThrow("closed");
  });
});

describe("keys", () => {
  const press = (init: KeyboardEventInit): KeyboardEvent => {
    const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(e);
    return e;
  };

  it("spells combos portably", () => {
    const k = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
    expect(comboOf(k({ key: "z", code: "KeyZ", metaKey: true }), true)).toBe("Mod+Z");
    expect(comboOf(k({ key: "Z", code: "KeyZ", metaKey: true, shiftKey: true }), true)).toBe("Mod+Shift+Z");
    expect(comboOf(k({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true }), false)).toBe("Mod+Shift+1");
    expect(comboOf(k({ key: "ArrowUp", code: "ArrowUp", ctrlKey: true, metaKey: true }), true)).toBe("Mod+Ctrl+Up");
    expect(comboOf(k({ key: "Meta", metaKey: true }), true)).toBeNull();
  });

  it("forwards a modified key the view didn't handle, stops the page's own undo, and keeps typing", async () => {
    await pair();
    const undo = press({ key: "z", code: "KeyZ", ctrlKey: true });
    expect(undo.defaultPrevented).toBe(true);
    const find = press({ key: "f", code: "KeyF", ctrlKey: true });
    expect(find.defaultPrevented).toBe(false);
    press({ key: "a", code: "KeyA" });
    const own = (e: Event) => e.preventDefault();
    document.body.addEventListener("keydown", own);
    press({ key: "s", code: "KeyS", ctrlKey: true });
    document.body.removeEventListener("keydown", own);
    await new Promise((r) => setTimeout(r, 20));
    expect(keys).toEqual(["Mod+Z", "Mod+F"]);
  });
});

describe("the editor's side", () => {
  it("onViewPort takes a port posted with its meta, and nothing else", () => {
    const got: unknown[] = [];
    const off = onViewPort((port, meta) => got.push([port, meta]));
    const { port1, port2 } = new MessageChannel();
    cleanup.push(() => { port1.close(); port2.close(); off(); });
    const post = (data: unknown, ports: unknown[], source: unknown = window) => {
      const e = new Event("message");
      Object.defineProperties(e, { data: { value: data }, ports: { value: ports }, source: { value: source } });
      window.dispatchEvent(e);
    };
    post({ type: VIEW_PORT_MESSAGE, meta: META }, [port1]);
    post({ type: VIEW_PORT_MESSAGE, meta: META }, [port1], null);
    post({ type: "other", meta: META }, [port1]);
    post({ type: VIEW_PORT_MESSAGE, meta: { window: "x" } }, [port1]);
    expect(got).toEqual([[port1, META]]);
  });

  it("hostViews hosts each window's port, replaces it on a new one, and drops it when the window closes", async () => {
    const adapter = {
      host: "patter" as const, project: () => ({ id: "p", kind: "project", parent: null, label: "P", host: {}, ext: {} }),
      node: () => null, selection: () => ({ path: [] }), write: () => {}, select: () => true,
      writable: () => ({ readOnly: false }),
    };
    const seen: number[] = [];
    const hosts = hostViews((meta) => { seen.push(meta.window); return meta.view === "nope" ? null : { adapter, reads: [] }; });
    const post = (data: unknown, ports: MessagePort[]) => {
      const e = new Event("message");
      Object.defineProperties(e, { data: { value: data }, ports: { value: ports }, source: { value: window } });
      window.dispatchEvent(e);
    };
    const a = new MessageChannel(); const b = new MessageChannel(); const c = new MessageChannel();
    cleanup.push(() => { for (const ch of [a, b, c]) { ch.port1.close(); ch.port2.close(); } hosts.dispose(); });
    post({ type: VIEW_PORT_MESSAGE, meta: META }, [a.port2]);
    expect(hosts.size).toBe(1);
    post({ type: VIEW_PORT_MESSAGE, meta: META }, [b.port2]);
    expect(hosts.size).toBe(1);
    post({ type: VIEW_PORT_MESSAGE, meta: { ...META, window: 99, view: "nope" } }, [c.port2]);
    expect(hosts.size).toBe(1);
    post({ type: VIEW_PORT_MESSAGE, meta: { ...META, closed: true } }, []);
    expect(hosts.size).toBe(0);
    expect(seen).toEqual([META.window, META.window, 99]);
  });

  it("readTheme reads the root's tokens and scheme", () => {
    const root = document.documentElement;
    root.removeAttribute("style");
    root.style.setProperty("--accent", "#c33");
    root.style.setProperty("color-scheme", "dark");
    const t = readTheme(root);
    expect(t.tokens["--accent"]).toBe("#c33");
    expect(t.tokens["--ink"]).toBeUndefined();
    expect(t.scheme).toBe("dark");
    root.style.setProperty("color-scheme", "light");
    expect(readTheme(root).scheme).toBe("light");
    root.removeAttribute("style");
  });
});
