// The live link server against a fake game, with a small protocol plugged in:
// nothing reaches the protocol before a hello, the hello's build is judged
// (match / stale / unknown), one game at a time, pushBundle is gated on the
// build the game reported and shows stale until it re-hellos, send reaches only
// a game that has said hello, a replaced game is closed with 4000, a stale
// hello is offered the current bundle once per connection, the status says
// unpublished while the game runs a pushed bundle that isn't published, web pages are
// refused, a taken port leaves it off, and the status walks off -> listening ->
// connected -> listening -> off.

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createLiveLinkServer, LIVE_LINK_REPLACED, type LiveLinkMessage, type LiveLinkServer, type LiveLinkServerStatus } from "../src/live-link.js";

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
  setPublished(h: string | null): void;
  staleHellos: () => number;
  until(pred: () => boolean): Promise<void>;
}

function harness(hash: string | null = "h1", port = freePort()): Harness {
  let current = hash;
  let published: string | null = null;
  let staleHellos = 0;
  let resets = 0;
  const statuses: LiveLinkServerStatus<Extra>[] = [];
  const messages: LiveLinkMessage[] = [];
  const hellos: string[] = [];
  const server = createLiveLinkServer<Extra>({
    port,
    currentBuildHash: () => current,
    publishedBuildHash: () => published,
    onStaleHello: () => { staleHellos++; },
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
    setPublished: (h) => { published = h; },
    staleHellos: () => staleHellos,
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
    const code = await new Promise<number>((resolve) => first.ws.once("close", (c) => resolve(c)));
    expect(code).toBe(LIVE_LINK_REPLACED);
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

  it("sends the protocol's own messages only to a game that has said hello", async () => {
    const h = await up("h1");
    expect(h.server.send({ t: "play", id: "p1" })).toBe(false);   // nobody connected
    const g = await game(h.port);
    expect(h.server.send({ t: "play", id: "p1" })).toBe(false);   // connected, no hello yet
    g.send({ t: "hello", build: "h1" });
    await h.until(() => last(h.statuses).state === "connected");
    expect(h.server.send({ t: "play", id: "p2" })).toBe(true);
    await h.until(() => g.received.length === 1);
    expect(JSON.parse(g.received[0]!)).toEqual({ t: "play", id: "p2" });
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

  it("offers a stale hello the current bundle once per connection, and gives the game's build", async () => {
    const h = await up("h2");
    const g = await game(h.port);
    expect(h.server.gameBuild()).toBeNull();
    g.send({ t: "hello", build: "h1" });
    await h.until(() => h.staleHellos() === 1);
    expect(h.server.gameBuild()).toBe("h1");
    g.send({ t: "hello", build: "h1" });   // the push didn't take: not offered again
    await h.until(() => h.hellos.length === 2);
    expect(h.staleHellos()).toBe(1);
    g.close();
    await h.until(() => last(h.statuses).state === "listening");
    expect(h.server.gameBuild()).toBeNull();
    const again = await game(h.port);       // a new connection is offered again
    again.send({ t: "hello", build: "h1" });
    await h.until(() => h.staleHellos() === 2);
    again.send({ t: "hello", build: "h2" }); // a matching hello isn't offered
    await h.until(() => h.hellos.length === 4);
    expect(h.staleHellos()).toBe(2);
    again.close();
  });

  it("says unpublished while the game runs a pushed bundle that isn't the published one", async () => {
    const h = await up("h1");
    h.setPublished("h1");
    const g = await game(h.port);
    g.send({ t: "hello", build: "h1" });
    await h.until(() => last(h.statuses).state === "connected");
    expect(last(h.statuses)).not.toHaveProperty("unpublished");
    h.setHash("h2");
    h.server.pushBundle("h2", "{}");
    g.send({ t: "hello", build: "h2" });   // the game took it
    await h.until(() => h.hellos.length === 2);
    expect(last(h.statuses)).toMatchObject({ build: "match", unpublished: true });
    h.setPublished("h2");                  // the writer published
    h.server.pushStatus();
    expect(last(h.statuses)).not.toHaveProperty("unpublished");
    g.close();
    await h.until(() => last(h.statuses).state === "listening");
    h.setPublished("h1");                  // a game that reconnects on the pushed build still shows it
    const again = await game(h.port);
    again.send({ t: "hello", build: "h2" });
    await h.until(() => last(h.statuses).state === "connected");
    expect(last(h.statuses)).toMatchObject({ unpublished: true });
    again.close();
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
