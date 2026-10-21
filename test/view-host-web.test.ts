// hostView (view-host-web.ts) end to end over a real MessageChannel with a fake adapter: the hello gate, each
// op, ext kept to the view's own extension and its reads, writes refused when read-only, bad requests, a throw
// answered as failed, and changed debounced.
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostView } from "../src/view-host-web.js";
import type { HostToView, ViewAdapter, ViewHandle, ViewNode, ViewPortMeta, ViewWritable } from "../src/view-protocol.js";
import { VIEW_API } from "../src/view-protocol.js";

const META: ViewPortMeta = { window: 7, extension: "pattershot", view: "sheet", version: "0.3.0", pinned: "0.3.0" };
const THEME = { scheme: "dark" as const, tokens: { "--ink": "#eee" } };

const line = (id: string, extra: Partial<ViewNode> = {}): ViewNode => ({
  id, kind: "line", parent: "b1", label: `Line ${id}`, host: { character: "TAM" },
  ext: { pattershot: { shot: "wide" }, patterstage: { mark: "A" }, secret: { x: 1 } }, ...extra,
});

type Fake = ViewAdapter & { writes: unknown[]; keys: string[]; ro: ViewWritable };
function fakeAdapter(over: Partial<ViewAdapter> = {}): Fake {
  const a: Fake = {
    host: "patter" as const,
    writes: [] as unknown[], keys: [] as string[], ro: { readOnly: false } as ViewWritable,
    project: () => ({ id: "p", kind: "project", parent: null, label: "Tavern", host: {}, ext: { secret: { a: 1 } } }),
    node: (id: string, children: boolean) => (id === "gone" ? null
      : line(id, children ? { children: [line("c1", { ext: { secret: {}, pattershot: { shot: "close" } } })] } : {})),
    selection: () => ({ path: [{ id: "l1", kind: "line" }, { id: "b1", kind: "block" }] }),
    media: (ids: readonly string[]) => Object.fromEntries(ids.map((i) => [i, { seconds: 2.5, measured: false }])),
    write(ext: string, label: string, edits: unknown) { a.writes.push([ext, label, edits]); },
    select: (id: string) => id === "l1",
    writable: (): ViewWritable => a.ro,
    key(combo: string) { a.keys.push(combo); },
    ...over,
  };
  return a;
}

const open: { close(): void }[] = [];
afterEach(() => { for (const p of open.splice(0)) p.close(); vi.useRealTimers(); });

/** A view end: send, and read what the host says, in order. */
function setup(adapter: ViewAdapter, opts: Partial<Parameters<typeof hostView>[2]> = {}) {
  const { port1, port2 } = new MessageChannel();
  open.push(port1, port2);
  const got: HostToView[] = [];
  const waiters: (() => void)[] = [];
  port1.onmessage = (e) => { got.push(e.data as HostToView); for (const w of waiters.splice(0)) w(); };
  const handle: ViewHandle = hostView(port2 as unknown as MessagePort, adapter, { meta: META, reads: ["patterstage"], theme: () => THEME, ...opts });
  const next = async (): Promise<HostToView> => {
    while (got.length === 0) await new Promise<void>((r) => waiters.push(r));
    return got.shift()!;
  };
  let id = 0;
  const ask = async (op: string, args?: unknown) => {
    const n = ++id;
    port1.postMessage({ t: "request", id: n, op, args });
    const reply = await next();
    expect(reply).toMatchObject({ t: "reply", id: n });
    return reply as Extract<HostToView, { t: "reply" }>;
  };
  return { send: (m: unknown) => port1.postMessage(m), next, ask, handle, got };
}

describe("hostView: the hello", () => {
  it("answers nothing before a hello, then welcomes with the host's facts", async () => {
    const v = setup(fakeAdapter());
    v.send({ t: "request", id: 1, op: "project", args: {} });
    v.send({ t: "hello", api: VIEW_API });
    expect(await v.next()).toEqual({
      t: "welcome", api: VIEW_API, host: "patter",
      extension: { id: "pattershot", version: "0.3.0", pinned: "0.3.0" }, view: "sheet",
      theme: THEME, writable: { readOnly: false },
    });
    expect((await v.ask("selection", {})).ok).toBe(true);
  });

  it("refuses another API with a sentence and closes the port", async () => {
    const v = setup(fakeAdapter(), { names: { extension: "Pattershot", view: "Performance sheet" } });
    v.send({ t: "hello", api: 2 });
    expect(await v.next()).toEqual({ t: "refused", message: "Pattershot's Performance sheet was built for view API 2; this app serves 1." });
    v.send({ t: "hello", api: VIEW_API });
    await new Promise((r) => setTimeout(r, 20));
    expect(v.got).toEqual([]);
  });

  it("refuses a hello with no API", async () => {
    const v = setup(fakeAdapter());
    v.send({ t: "hello" });
    expect(await v.next()).toEqual({ t: "refused", message: "pattershot's sheet didn't say which view API it was built for; this app serves 1." });
  });
});

describe("hostView: requests", () => {
  const ready = async (a = fakeAdapter(), opts = {}) => { const v = setup(a, opts); v.send({ t: "hello", api: VIEW_API }); await v.next(); return { v, a }; };

  it("answers project and node, keeping ext to the view's own extension and its reads, children too", async () => {
    const { v } = await ready();
    expect(await v.ask("project", {})).toMatchObject({ ok: true, value: { id: "p", ext: {} } });
    const r = await v.ask("node", { id: "l1", children: true });
    expect(r).toMatchObject({ ok: true });
    const node = (r as { value: ViewNode }).value;
    expect(node.ext).toEqual({ pattershot: { shot: "wide" }, patterstage: { mark: "A" } });
    expect(node.children![0]!.ext).toEqual({ pattershot: { shot: "close" } });
    expect(node.host).toEqual({ character: "TAM" });
    expect((await v.ask("node", { id: "l1" }) as { value: ViewNode }).value.children).toBeUndefined();
    expect(await v.ask("node", { id: "gone" })).toMatchObject({ ok: true, value: null });
  });

  it("answers selection, media, and select", async () => {
    const { v } = await ready();
    expect(await v.ask("selection", {})).toMatchObject({ value: { path: [{ id: "l1", kind: "line" }, { id: "b1", kind: "block" }] } });
    expect(await v.ask("media", { ids: ["l1"] })).toMatchObject({ value: { l1: { seconds: 2.5, measured: false } } });
    expect(await v.ask("select", { id: "l1" })).toMatchObject({ ok: true, value: true });
  });

  it("refuses media as unsupported in a host with none", async () => {
    const a = fakeAdapter();
    delete (a as { media?: unknown }).media;
    const { v } = await ready(a);
    expect(await v.ask("media", { ids: ["l1"] })).toMatchObject({ ok: false, refusal: { code: "unsupported" } });
  });

  it("writes the view's own extension as one labelled step", async () => {
    const { v, a } = await ready();
    expect(await v.ask("write", { label: "Set shots", edits: [{ node: "l1", field: "shot", value: "wide" }, { node: "l2", field: "shot" }] }))
      .toMatchObject({ ok: true, value: { written: 2 } });
    expect(a.writes).toEqual([["pattershot", "Set shots", [{ node: "l1", field: "shot", value: "wide" }, { node: "l2", field: "shot" }]]]);
  });

  it("refuses a write when read-only, with the adapter's why, and passes on the adapter's own refusal", async () => {
    const { v, a } = await ready();
    a.ro = { readOnly: true, why: "Sam holds this scene." };
    expect(await v.ask("write", { label: "x", edits: [{ node: "l1", field: "shot", value: 1 }] }))
      .toMatchObject({ ok: false, refusal: { code: "read-only", message: "Sam holds this scene." } });
    expect(a.writes).toEqual([]);
    a.ro = { readOnly: false };
    a.write = () => ({ code: "held", message: "Somebody holds that." });
    expect(await v.ask("write", { label: "x", edits: [{ node: "l1", field: "shot", value: 1 }] }))
      .toMatchObject({ ok: false, refusal: { code: "held" } });
  });

  it("refuses a bad shape as bad-request", async () => {
    const { v } = await ready();
    const bad = async (op: string, args: unknown) => expect(await v.ask(op, args)).toMatchObject({ ok: false, refusal: { code: "bad-request" } });
    await bad("explode", {});
    await bad("node", {});
    await bad("node", { id: "l1", children: "yes" });
    await bad("media", { ids: [1] });
    await bad("select", []);
    await bad("write", { edits: [] });
    await bad("write", { label: "x", edits: [{ node: "l1", field: "a.b", value: 1 }] });
    await bad("write", { label: "x", edits: [{ node: "l1", field: "shot", value: Number.NaN }] });
  });

  it("answers a throw as failed", async () => {
    const { v } = await ready(fakeAdapter({ selection: () => { throw new Error("no editor"); } }));
    expect(await v.ask("selection", {})).toMatchObject({ ok: false, refusal: { code: "failed", message: "The app couldn't do that: no editor" } });
  });

  it("passes a key on to the adapter", async () => {
    const { v, a } = await ready();
    v.send({ t: "key", combo: "Mod+Z" });
    await v.ask("selection", {});
    expect(a.keys).toEqual(["Mod+Z"]);
  });
});

describe("hostView: events", () => {
  it("debounces changed, merging nodes, with all winning", async () => {
    const v = setup(fakeAdapter(), { debounceMs: 30 });
    v.handle.changed(["x"]);   // before the welcome: nothing
    v.send({ t: "hello", api: VIEW_API });
    await v.next();
    v.handle.changed(["l1"]);
    v.handle.changed(["l2", "l1"]);
    expect(await v.next()).toEqual({ t: "event", name: "changed", value: { nodes: ["l1", "l2"] } });
    v.handle.changed(["l1"]);
    v.handle.changed("all");
    v.handle.changed(["l3"]);
    expect(await v.next()).toEqual({ t: "event", name: "changed", value: { nodes: "all" } });
  });

  it("sends selection, theme, writable, and closing", async () => {
    const a = fakeAdapter();
    const v = setup(a);
    v.send({ t: "hello", api: VIEW_API });
    await v.next();
    v.handle.selection();
    expect(await v.next()).toMatchObject({ t: "event", name: "selection", value: { path: [{ id: "l1" }, { id: "b1" }] } });
    v.handle.theme();
    expect(await v.next()).toEqual({ t: "event", name: "theme", value: THEME });
    a.ro = { readOnly: true, why: "Read-only." };
    v.handle.writable();
    expect(await v.next()).toEqual({ t: "event", name: "writable", value: { readOnly: true, why: "Read-only." } });
    v.handle.close();
    expect(await v.next()).toEqual({ t: "event", name: "closing", value: {} });
    v.handle.close();
  });
});

describe("hostView: holds and histories", () => {
  it("passes a node's held sentence on", async () => {
    const v = setup(fakeAdapter({ node: (id: string) => line(id, { held: "Sam holds this scene's Pattershot data." }) }));
    v.send({ t: "hello", api: VIEW_API });
    await v.next();
    const r = await v.ask("node", { id: "l1" });
    expect(r.ok && (r.value as ViewNode).held).toBe("Sam holds this scene's Pattershot data.");
  });

  it("refuses a write mixing the project node with others, and allows either alone", async () => {
    const a = fakeAdapter();
    const v = setup(a);
    v.send({ t: "hello", api: VIEW_API });
    await v.next();
    const mixed = await v.ask("write", { label: "Pin", edits: [{ node: "p", field: "a", value: 1 }, { node: "l1", field: "shot", value: "wide" }] });
    expect(mixed).toMatchObject({ ok: false, refusal: { code: "bad-request" } });
    expect(a.writes).toEqual([]);
    expect((await v.ask("write", { label: "Pin", edits: [{ node: "p", field: "a", value: 1 }, { node: "p", field: "b", value: 2 }] })).ok).toBe(true);
    expect((await v.ask("write", { label: "Pin", edits: [{ node: "l1", field: "shot", value: "wide" }, { node: "l2", field: "shot", value: "close" }] })).ok).toBe(true);
  });
});
