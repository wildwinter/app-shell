// ---------------------------------------------------------------------------
// The live link server: the loopback WebSocket server, in the main process,
// that a running game connects to. Patterpad's debug-link.ts and Storyletter's
// live-link.ts were this file twice (the family parity review of 2026-10, item
// 14), so the parts that were the same are here once and each app plugs in its
// own protocol:
//
// - loopback only, and refused to any Origin that isn't this machine
//   (isLocalOrigin), so a web page can't take the slot;
// - one game at a time: a new connection replaces the old;
// - nothing is honoured before a hello, which names the build the game runs,
//   judged against the project's (match / stale / unknown);
// - the status off -> listening -> connected, or error, pushed to the app;
// - pushBundle, gated on the build the game reported, and the build shown as
//   stale until the game re-hellos with the one it was sent;
// - a bind failure (the port is taken) leaves the server off, not dead "on".
//
// What the game sends after its hello (Patterpad's frames, Storyletter's
// boards and traces), and what the app adds to the connected status, is the
// protocol's. Main-process code: `ws` is an optional peer the app supplies.
// The chip that shows the status is link-status.ts.
// ---------------------------------------------------------------------------

import { WebSocketServer, type WebSocket } from "ws";
import { isLocalOrigin } from "./util.js";

/** How the game's build compares with the project's. */
export type LiveLinkBuild = "match" | "stale" | "unknown";

/** One parsed message from the game: a JSON object with its `t`. */
export type LiveLinkMessage = Record<string, unknown>;

/** The server's status, with the protocol's own fields on `connected`. */
export type LiveLinkServerStatus<X extends object = object> =
  | { state: "off" }
  | { state: "error"; message: string }
  | { state: "listening"; port: number }
  | ({ state: "connected"; port: number; project?: string; build: LiveLinkBuild } & X);

/** A hello, as the server read it. */
export interface LiveLinkHello {
  /** The game's build judged against the project's. */
  build: LiveLinkBuild;
  /** What the game said it is, if it did. */
  project?: string;
  /** The whole message, for the protocol's own fields (flows, boxes). */
  msg: LiveLinkMessage;
}

/** An app's half of the link. */
export interface LiveLinkProtocol<X extends object = object> {
  /** A hello landed: a run begins, or a pushed bundle took. The status is
   *  pushed after it returns. */
  hello(hello: LiveLinkHello): void;
  /** Any other message, once the game has said hello. Call `pushStatus` when
   *  it changes what the status shows. */
  message(msg: LiveLinkMessage): void;
  /** The game went away, was replaced, or the server stopped: forget the run. */
  reset(): void;
  /** The protocol's fields on a connected status. */
  describe(): X;
}

export interface LiveLinkServerOptions<X extends object = object> {
  /** Each app has its own, so both editors can listen on one machine. */
  port: number;
  /** The project's current compiled hash, read at each hello; null with no
   *  project open, which makes the build "unknown". */
  currentBuildHash: () => string | null;
  /** Make the protocol. `pushStatus` sends the status again while a game is
   *  connected (before that, nothing the protocol adds is shown). */
  protocol: (link: { pushStatus(): void }) => LiveLinkProtocol<X>;
  /** The latest status, for the app's windows and menu. */
  onStatus: (status: LiveLinkServerStatus<X>) => void;
}

export interface LiveLinkServer<X extends object = object> {
  start(): void;
  stop(): void;
  isOn(): boolean;
  status(): LiveLinkServerStatus<X>;
  /** Send the status again while a game is connected: something the protocol
   *  shows changed outside a message (the app followed another flow). */
  pushStatus(): void;
  /** Push a freshly compiled bundle to the connected game. Nothing happens when
   *  no game has said hello, or when it already runs this build. The game
   *  applies it and re-hellos with the new build; until then it shows stale. */
  pushBundle(build: string, data: string): void;
}

export function createLiveLinkServer<X extends object = object>(opts: LiveLinkServerOptions<X>): LiveLinkServer<X> {
  const { port } = opts;
  let wss: WebSocketServer | null = null;
  let client: WebSocket | null = null;
  // Set by a hello: nothing else is honoured until it is.
  let connected: { project?: string; build: LiveLinkBuild } | null = null;
  let clientBuild: string | null = null;   // the build the game reported: gates pushBundle

  const status = (): LiveLinkServerStatus<X> => {
    if (!wss) return { state: "off" };
    if (!client || !connected) return { state: "listening", port };
    return {
      ...protocol.describe(),
      state: "connected", port, build: connected.build,
      ...(connected.project !== undefined ? { project: connected.project } : {}),
    };
  };
  const push = (): void => opts.onStatus(status());
  const pushStatus = (): void => { if (connected) push(); };
  const protocol = opts.protocol({ pushStatus });

  const forget = (): void => { connected = null; clientBuild = null; protocol.reset(); };

  const handleMessage = (raw: string): void => {
    let msg: unknown;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg === null || typeof msg !== "object" || Array.isArray(msg)) return;
    const m = msg as LiveLinkMessage;
    if (m["t"] !== "hello") {
      if (connected) protocol.message(m);
      return;
    }
    clientBuild = typeof m["build"] === "string" ? m["build"] : null;
    const current = opts.currentBuildHash();
    const build: LiveLinkBuild = current === null ? "unknown" : clientBuild === current ? "match" : "stale";
    const project = typeof m["project"] === "string" ? m["project"] : undefined;
    connected = { build, ...(project !== undefined ? { project } : {}) };
    protocol.hello({ build, ...(project !== undefined ? { project } : {}), msg: m });
    push();
  };

  return {
    isOn: () => wss !== null,
    status,
    pushStatus,
    pushBundle(build: string, data: string): void {
      if (!client || !connected) return;   // nothing connected, or no hello yet
      if (clientBuild === build) return;   // the game already runs this build
      try { client.send(JSON.stringify({ t: "bundle", v: 1, build, data })); } catch { /* socket went away */ }
      // Until the game re-hellos with the new build it is on the old one, and
      // the chip says so rather than keep the match it had at the hello.
      if (connected.build !== "stale") { connected = { ...connected, build: "stale" }; push(); }
    },
    start(): void {
      if (wss) return;
      try {
        // Loopback only: only processes on this machine can reach it. And not
        // a web page on it: any site can open a WebSocket to localhost, and the
        // browser stamps the upgrade with the page's Origin.
        wss = new WebSocketServer({
          host: "127.0.0.1", port,
          verifyClient: (info: { origin?: string }) => isLocalOrigin(info.origin),
        }, () => push());   // "listening" once actually bound
      } catch (e) {
        opts.onStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
        wss = null;
        return;
      }
      wss.on("error", (e) => {
        opts.onStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
        // A bind failure leaves no server behind: the next click starts again
        // rather than finding a dead one "on".
        if (!client) { const s = wss; wss = null; try { s?.close(); } catch { /* already closing */ } }
      });
      wss.on("connection", (ws) => {
        // One game at a time: a new connection replaces the old.
        if (client) { try { client.close(); } catch { /* gone */ } }
        client = ws; forget();
        ws.on("message", (data) => handleMessage(data.toString()));
        ws.on("close", () => { if (client === ws) { client = null; forget(); push(); } });
        ws.on("error", () => { /* a flaky client must not take the editor down */ });
        push();
      });
    },
    stop(): void {
      try { client?.close(); } catch { /* gone */ }
      client = null; forget();
      const s = wss; wss = null;
      try { s?.close(); } catch { /* already closing */ }
      push();
    },
  };
}
