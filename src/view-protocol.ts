// ---------------------------------------------------------------------------
// The view host API (tier 2 view extensions): the messages between a view, a
// web component an extension's installed package supplies, and the app that
// hosts it in a sandboxed floating window (patterkit design/view-extensions.md).
//
// Both ends import this module: the app through `hostView`, a view through
// `@wildwinter/app-shell/view-client`. It is types and constants only, so a
// view's bundle takes nothing else from the shell.
//
// The transport is a MessagePort straight from the view to the editor's
// renderer, which holds what the writer sees in both apps. Nothing is
// answered before the view's hello names the API it was built for; a host
// that can't serve that API refuses it with a sentence and closes the port.
// ---------------------------------------------------------------------------

/** The API this shell's hosts and clients speak. A host serves exactly this version. */
export const VIEW_API = 1;

/** A host: the app a view runs in. */
export type ViewHostName = "patter" | "storylets";

/** A JSON value, as extension data and host fields are. */
export type ViewJson = string | number | boolean | null | ViewJson[] | { [key: string]: ViewJson };

// --- What a host hands a view ---------------------------------------------

/**
 * A node of the host's project, in one envelope for both hosts.
 *
 * `kind` is the manifest's node kind (`line`, `card`, `project`, ...). `host`
 * holds the host's own fields for that kind, documented per host in the
 * shell's README; `ext` holds extension data by extension id, the view's own
 * and those its manifest `reads`, nothing else.
 */
export interface ViewNode {
  readonly id: string;
  readonly kind: string;
  /** The containing node's id; null for the project. */
  readonly parent: string | null;
  /** A short label for the node, in the source language, as the editor names it. */
  readonly label: string;
  readonly host: { readonly [field: string]: ViewJson };
  readonly ext: { readonly [extension: string]: { readonly [field: string]: ViewJson } };
  /** The node's children in order, when they were asked for. */
  readonly children?: readonly ViewNode[];
  /** Set when somebody else holds the view's own extension data on this node: the sentence saying who. A write
   *  touching the node is refused `held`; a view can show the node read-only meanwhile. */
  readonly held?: string;
}

/** The selection, innermost first (a line, then its snippet, block, and scene). Empty when nothing is selected. */
export interface ViewSelection {
  readonly path: readonly { readonly id: string; readonly kind: string }[];
}

/** A line's length: a recording's when there is one (`measured`), else the host's estimate from its text. */
export interface ViewMediaLength {
  readonly seconds: number;
  readonly measured: boolean;
}

/** The app's theme, for the view to draw in: its CSS custom properties and its colour scheme. */
export interface ViewTheme {
  readonly scheme: "light" | "dark";
  /** Custom property names, with their leading `--`, and their computed values. */
  readonly tokens: { readonly [name: string]: string };
}

/** Whether the view may write, and why not when it may not, as a sentence for the view to show. */
export interface ViewWritable {
  readonly readOnly: boolean;
  readonly why?: string;
}

/**
 * One write to the view's own extension data: a field on a node, set to a value, or cleared when `value` is absent.
 *
 * `field` is a top-level field the manifest declares for that node's kind, never a path into one: changing one
 * entry of a map or record writes the whole field's new value. Read the node again just before writing, so the
 * write builds on any edit made in the editor meanwhile; requests are answered in order, so nothing lands between.
 *
 * One write is one undo step in one history: its edits are all on the project node, or none of them are (the
 * project's data and a scene's sit in different histories in Patterpad). `hostView` refuses a write that mixes them.
 */
export interface ViewEdit {
  readonly node: string;
  readonly field: string;
  readonly value?: ViewJson;
}

/** Why a request was refused: a stable code for the view, and a sentence for the writer. */
export interface ViewRefusal {
  readonly code:
    | "bad-request"   // the request's shape is wrong
    | "unsupported"   // the host has no such thing (media and audio in Storyletter)
    | "gone"          // a node the request names doesn't exist
    | "held"          // somebody else holds the data the write would change
    | "read-only"     // the project or the view is read-only
    | "failed";       // the host tried and couldn't
  readonly message: string;
}

// --- Requests --------------------------------------------------------------

/** Each request a view can make: what it sends, and what a granted reply carries. */
export interface ViewRequests {
  /** The project node: the host's project facts (Patter: cast, qualifiers, pad default; Storylets: boxes, tag groups). */
  project: { args: Record<string, never>; value: ViewNode };
  /** One node by id, and its children in order when `children` is true; null when there is no such node. */
  node: { args: { id: string; children?: boolean }; value: ViewNode | null };
  selection: { args: Record<string, never>; value: ViewSelection };
  /** Lines' lengths by id. Refused `unsupported` by a host with no media. */
  media: { args: { ids: string[] }; value: { [id: string]: ViewMediaLength } };
  /** Writes to the view's own extension, applied as one undo step with the label, or refused whole. */
  write: { args: { label: string; edits: ViewEdit[] }; value: { written: number } };
  /** Reveal and select a node in the editor. */
  select: { args: { id: string }; value: boolean };
  /**
   * Play a line's or text beat's take, as the editor plays it, stopping whatever was playing: true when it plays,
   * false when the node has no take (`media`'s `measured` says so beforehand). Refused `unsupported` by a host with
   * no audio just now. Added after API 1's first release (app-shell 0.60): a host before it refuses `bad-request`,
   * so a view treats either refusal as "no audio here".
   */
  play: { args: { id: string }; value: boolean };
  /** Stop the take playing, if any: true when one was. Refused as `play` is. */
  stop: { args: Record<string, never>; value: boolean };
}

export type ViewOp = keyof ViewRequests;

// --- Messages ----------------------------------------------------------------

/** A view's first message. */
export interface ViewHello { readonly t: "hello"; readonly api: number }

export interface ViewRequest<K extends ViewOp = ViewOp> {
  readonly t: "request";
  readonly id: number;
  readonly op: K;
  readonly args: ViewRequests[K]["args"];
}

/** A key combination the view didn't handle, in the shell's portable spelling ("Mod+Z", "Mod+Shift+Z"), for the host to run. */
export interface ViewKey { readonly t: "key"; readonly combo: string }

export type ViewToHost = ViewHello | ViewRequest | ViewKey;

/** The host's answer to a hello it can serve. */
export interface ViewWelcome {
  readonly t: "welcome";
  readonly api: number;
  readonly host: ViewHostName;
  /** The view's extension: its id, the installed version, and the version the project pins, if any. */
  readonly extension: { readonly id: string; readonly version: string; readonly pinned?: string };
  /** The view's own id within its manifest. */
  readonly view: string;
  readonly theme: ViewTheme;
  readonly writable: ViewWritable;
  /** The extensions the view's manifest `requires` that the project doesn't take, by id; empty when none. Absent
   *  from a host before app-shell 0.60, which didn't say. */
  readonly missing?: readonly string[];
}

/** The host's answer to a hello it can't serve, before it closes the port. */
export interface ViewRefused { readonly t: "refused"; readonly message: string }

export type ViewReply =
  | { readonly t: "reply"; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly t: "reply"; readonly id: number; readonly ok: false; readonly refusal: ViewRefusal };

/** What the host tells a view unasked. */
export interface ViewEvents {
  /** The project changed: these nodes, or anything ("all"). Debounced; read again what you show. */
  changed: { nodes: readonly string[] | "all" };
  selection: ViewSelection;
  theme: ViewTheme;
  writable: ViewWritable;
  /** The window is closing; the port goes next. */
  closing: Record<string, never>;
  /** The take playing in the editor, by its node's id, or null when it stops or ends (whoever asked for it). */
  playing: { id: string | null };
  /** The project's missing requirements changed (an extension taken or removed): the new list, as in the welcome. */
  missing: { extensions: readonly string[] };
}

export type ViewEventName = keyof ViewEvents;

export interface ViewEvent<K extends ViewEventName = ViewEventName> {
  readonly t: "event";
  readonly name: K;
  readonly value: ViewEvents[K];
}

export type HostToView = ViewWelcome | ViewRefused | ViewReply | ViewEvent;

// --- The port's arrival --------------------------------------------------------

/** The IPC channel main sends each end's port on. */
export const VIEW_PORT_CHANNEL = "wildwinter-view:port";

/** The window message a preload posts a port with, so page code (which can't see ipcRenderer) can take it. */
export const VIEW_PORT_MESSAGE = "wildwinter-view:port";

/** What main tells the editor about a view whose port it is handing over. */
export interface ViewPortMeta {
  /** The view window's id, unique while it's open. */
  readonly window: number;
  readonly extension: string;
  readonly view: string;
  readonly version: string;
  readonly pinned?: string;
  /** Set, with no port, when the view window has closed: the editor drops its handle for `window`. */
  readonly closed?: true;
}

// --- The host's side: what an app implements, and what hostView gives back ----

/**
 * What an app supplies `hostView` for one open view: its own model, as the
 * writer sees it (unsaved edits included). `hostView` answers the protocol
 * from it, checks every request's shape, keeps `ext` to the view's own
 * extension and its manifest's `reads`, and refuses writes when not writable.
 * Any method may return a promise.
 */
export interface ViewAdapter {
  readonly host: ViewHostName;
  /** The project node. */
  project(): ViewNode | Promise<ViewNode>;
  node(id: string, children: boolean): ViewNode | null | Promise<ViewNode | null>;
  selection(): ViewSelection | Promise<ViewSelection>;
  /** Absent in a host with no media; `hostView` then refuses `media` as unsupported. */
  media?(ids: readonly string[]): { [id: string]: ViewMediaLength } | Promise<{ [id: string]: ViewMediaLength }>;
  /** Apply the edits to `extension`'s data as one undo step with the label, or refuse them all. */
  write(extension: string, label: string, edits: readonly ViewEdit[]): void | ViewRefusal | Promise<void | ViewRefusal>;
  select(id: string): boolean | Promise<boolean>;
  /** Play a node's take: true when it plays, false when it has none, or a refusal (`unsupported` while the app has
   *  no audio, `gone`). Absent in a host with no audio; `hostView` then refuses `play` and `stop` as unsupported.
   *  The app tells views through the handle's `playing` as a take starts and ends. */
  play?(id: string): boolean | ViewRefusal | Promise<boolean | ViewRefusal>;
  /** Stop the take playing: true when one was. */
  stop?(): boolean | Promise<boolean>;
  writable(extension: string): ViewWritable;
  /** The extensions `extension`'s manifest requires that the project doesn't take (the toolkit's
   *  `missingRequirements`). None when absent. */
  missing?(extension: string): readonly string[];
  /** Run a key combination the view passed on (undo, redo, the app's shortcuts). */
  key?(combo: string): void;
}

/** What `hostView` returns, and `hostViews` for every open view: the app calls these as its model, selection,
 *  theme, or locks change. */
export interface ViewHandle {
  changed(nodes: readonly string[] | "all"): void;
  selection(): void;
  theme(): void;
  writable(): void;
  /** The take playing, by node id, or null when none is: call as one starts and as it stops or ends. */
  playing(id: string | null): void;
  /** The project's extensions changed: tell the view if its missing requirements did. */
  missing(): void;
  close(): void;
}
