// The live link server against a fake game, with a small protocol plugged in:
// nothing reaches the protocol before a hello, the hello's build is judged
// (match / stale / unknown), one game at a time, pushBundle is gated on the
// build the game reported and shows stale until it re-hellos, web pages are
// refused, a taken port leaves it off, and the status walks off -> listening ->
// connected -> listening -> off.

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createLiveLinkServer, type LiveLinkMessage, type LiveLinkServer, type LiveLinkServerStatus } from "../src/live-link.js";

/** A port per test, high and random, so parallel files don't collide. */
const freePort = (): number => 40000 + Math.floor(Math.random() * 20000);

interface Extra { seen: number }

interface Harness {
  server: LiveLinkServer<Extra>;
  port: number;
  statuses: LiveLinkServerStatus<Extra>[];
  messages: LiveLinkMessage[];
  hellos: string[];
  resets: () => number;
  setHash(h: string | null): void;
  until(pred: () => boolean): Promise<void>;
}

function harness(hash: string | null = "h1", port = freePort()): Harness {
  let current = hash;
  let resets = 0;
  const statuses: LiveLinkServerStatus<Extra>[] = [];
  const messages: LiveLinkMessage[] = [];
  const hellos: string[] = [];
  const server = createLiveLinkServer<Extra>({
    port,
    currentBuildHash: () => current,
    onStatus: (s) => statuses.push(s),
    protocol: ({ pushStatus }) => ({
      hello: (h) => { hellos.push(h.build); },
      message: (m) => { messages.push(m); if (m["t"] === "seen") pushStatus(); },
      reset: () => { resets++; messages.length = 0; },
      describe: () => ({ seen: messages.length }),
    }),
  });
  return {
    server, port, statuses, messages, hellos,
    resets: () => resets,
    setHash: (h) => { current = h; },
    until: (pred) => new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = (): void => {
        if (pred()) { resolve(); return; }
        if (Date.now() - started > 3000) { reject(new Error("timed out waiting")); return; }
        setTimeout(tick, 10);
      };
      tick();
    }),
  };
}

function game(port: number, origin?: string): Promise<{ ws: WebSocket; received: string[]; send(o: unknown): void; close(): void }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin !== undefined ? { origin } : {});
    const received: string[] = [];
    ws.on("message", (d) => received.push(d.toString()));
    ws.on("open", () => resolve({ ws, received, send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close() }));
    ws.on("error", reject);
  });
}

const last = <T>(xs: T[]): T => xs[xs.length - 1]!;

describe("the live link server", () => {
  let open: Harness[] = [];
  afterEach(() => { for (const h of open) h.server.stop(); open = []; });
  const up = async (hash: string | null = "h1"): Promise<Harness> => {
    const h = harness(hash);
    open.push(h);
    h.server.start();
    await h.until(() => h.statuses.some((s) => s.state === "listening"));
    return h;
  };

  it("is off until started, then listening on its port, then off again", async () => {
    const h = harness();
    expect(h.server.status()).toEqual({ state: "off" });
    expect(h.server.isOn()).toBe(false);
    h.server.start();
    await h.until(() => h.statuses.length > 0);
    expect(last(h.statuses)).toEqual({ state: "listening", port: h.port });
    expect(h.server.isOn()).toBe(true);
    h.server.stop();
    expect(last(h.statuses)).toEqual({ state: "off" });
    expect(h.server.isOn()).toBe(false);
  });

  it("passes nothing to the protocol before a hello, then judges the build and adds the protocol's fields", async () => {
    const h = await up("h1");
    const g = await game(h.port);
    g.send({ t: "seen" });
    g.send("not an object");
    g.send([1, 2]);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.messages).toEqual([]);
    expect(last(h.statuses).state).toBe("listening");
    g.send({ t: "hello", build: "h1", project: "The Hamlet" });
    g.send({ t: "seen" });
    await h.until(() => h.messages.length === 1 && (last(h.statuses) as { seen?: number }).seen === 1);
    expect(h.hellos).toEqual(["match"]);
    expect(last(h.statuses)).toEqual({ state: "connected", port: h.port, project: "The Hamlet", build: "match", seen: 1 });
    g.close();
    await h.until(() => last(h.statuses).state === "listening");
    expect(h.resets()).toBeGreaterThan(0);
  });

  it("judges a different build stale, and no project hash unknown, and leaves out a project the game didn't name", async () => {
    const h = await up("h1");
    const g = await game(h.port);
    g.send({ t: "hello", build: "old" });
    await h.until(() => last(h.statuses).state === "connected");
    expect(last(h.statuses)).toMatchObject({ build: "stale" });
    expect(last(h.statuses)).not.toHaveProperty("project");
    h.setHash(null);
    g.send({ t: "hello", build: "old" });
    await h.until(() => h.hellos.length === 2);
    expect(last(h.statuses)).toMatchObject({ state: "connected", build: "unknown" });
    g.close();
  });

  it("takes one game at a time: a new connection replaces the old", async () => {
    const h = await up("h1");
    const first = await game(h.port);
    first.send({ t: "hello", build: "h1", project: "one" });
    await h.until(() => last(h.statuses).state === "connected");
    const second = await game(h.port);
    await new Promise<void>((resolve) => first.ws.once("close", () => resolve()));
    await h.until(() => last(h.statuses).state === "listening");
    second.send({ t: "hello", build: "h1", project: "two" });
    await h.until(() => last(h.statuses).state === "connected");
    expect(last(h.statuses)).toMatchObject({ project: "two" });
    second.close();
  });

  it("pushes a bundle only to a handshaken game on a different build, and shows it stale until it re-hellos", async () => {
    const h = await up("h1");
    h.server.pushBundle("h2", "{}");   // nobody connected
    const g = await game(h.port);
    h.server.pushBundle("h2", "{}");   // connected, no hello yet
    g.send({ t: "hello", build: "h1" });
    await h.until(() => last(h.statuses).state === "connected");
    h.server.pushBundle("h1", "{}");   // the game already runs this build
    await new Promise((r) => setTimeout(r, 50));
    expect(g.received).toEqual([]);
    h.setHash("h2");
    h.server.pushBundle("h2", "{\"a\":1}");
    await h.until(() => g.received.length === 1);
    expect(JSON.parse(g.received[0]!)).toEqual({ t: "bundle", v: 1, build: "h2", data: "{\"a\":1}" });
    expect(last(h.statuses)).toMatchObject({ state: "connected", build: "stale" });
    g.send({ t: "hello", build: "h2" });
    await h.until(() => (last(h.statuses) as { build?: string }).build === "match");
    h.server.pushBundle("h2", "{}");   // in sync: not pushed again
    await new Promise((r) => setTimeout(r, 50));
    expect(g.received).toHaveLength(1);
    g.close();
  });

  it("pushes the status on the protocol's word only while a game is connected", async () => {
    const h = await up("h1");
    const before = h.statuses.length;
    h.server.pushStatus();
    expect(h.statuses).toHaveLength(before);
    const g = await game(h.port);
    g.send({ t: "hello", build: "h1" });
    await h.until(() => last(h.statuses).state === "connected");
    const after = h.statuses.length;
    h.server.pushStatus();
    expect(h.statuses).toHaveLength(after + 1);
    g.close();
  });

  it("refuses a web page's Origin and keeps the slot for the game, and lets loopback ones in", async () => {
    const h = await up("h1");
    const refused = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${h.port}`, { origin: "https://somewhere.example" });
      ws.on("open", () => { ws.close(); resolve("opened"); });
      ws.on("unexpected-response", (_req, res) => resolve(`refused ${res.statusCode}`));
      ws.on("error", () => resolve("refused"));
    });
    expect(refused).toBe("refused 401");
    for (const origin of ["http://localhost:5173", "127.0.0.1"]) {
      const g = await game(h.port, origin);
      g.close();
    }
    const g = await game(h.port);
    g.send({ t: "hello", build: "h1" });
    await h.until(() => last(h.statuses).state === "connected");
    g.close();
  });

  it("reports an error and stays off when the port is taken", async () => {
    const a = await up("h1");
    const b = harness("h1", a.port);
    open.push(b);
    b.server.start();
    await b.until(() => b.statuses.some((s) => s.state === "error"));
    expect(b.server.isOn()).toBe(false);
    expect(b.server.status()).toEqual({ state: "off" });
  });
});
