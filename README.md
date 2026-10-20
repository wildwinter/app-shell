# @wildwinter/app-shell

The shared shell for the editor family (Patterpad, Storylet Studio): the
app-agnostic pieces both apps would otherwise hand-mirror. Framework-neutral
(vanilla TS + DOM), no app dependencies.

**Two palettes, one grammar.** Each app supplies its own palette and fonts; this
package supplies the grammar and primitives beneath them.

## v0.1 (the thin slice)

- **`el`** - the tag-typed element factory. A superset of the two apps' prior
  signatures, so neither rewrites call sites:

  ```ts
  import { el } from "@wildwinter/app-shell";
  el("div", "card", "hello");                       // string className + text child
  el("button", { className: "b", onClick: fn }, child);  // props bag + children
  ```

- **`colourIndex` / `colourFor` / `PALETTE` / `PALETTE_SIZE`** - the per-entity
  colour hash. A stable name -> palette-slot index, storage-free. The hues live
  in each theme as `--char-0 .. --char-11`.

- **`tokens.css`** - the design-token grammar (elevation, motion, radius,
  scrollbar). Import once at the app root:

  ```css
  @import "@wildwinter/app-shell/tokens.css";
  ```

## v0.6 (the long-job kit)

For work that takes long enough to need a progress bar and a Cancel button:
coverage sweeps, big exports, corpus runs.

```ts
// main
import { createJobHost, JOB_PROGRESS } from "@wildwinter/app-shell/job";
const jobs = createJobHost({ send: (ch, p) => window.webContents.send(ch, p) });
const outcome = await jobs.start("coverage", async (ctx) => {
  for (let i = 0; i < runs; i++) {
    if (ctx.cancelled) break;          // cancellation is a boundary, not an interrupt
    doOneRun();
    await ctx.step(i + 1, runs);       // reports progress AND yields the loop
  }
  return report;                        // a cancelled job may still hand back a partial
});
jobs.cancel("coverage");
```

```ts
// renderer
import { mountJobProgress } from "@wildwinter/app-shell";
import "@wildwinter/app-shell/job.css";
const strip = mountJobProgress(host, { units: "runs", onCancel: () => api.cancel() });
```

**Cooperative, not parallel.** The work still runs in the main process; it just
stops hogging it, so IPC keeps flowing and the renderer keeps painting.
`ctx.step()` throttles progress messages (100ms) separately from yielding the
event loop (16ms), so a fast inner loop neither floods IPC nor stutters.

**A strip, not a modal.** The window that started the job shows it; the rest of
the app stays usable.

## v0.18 (the bars, and the third semantic colour)

Three drawings each app had grown its own copy of, and the token the family kept
needing and never had.

- **`renderStepperBar`** - a bottom bar that walks a list of things to attend to,
  one at a time: count, previous, position, next, the entry as a button, an
  action slot. Four bars across the two apps are this shape (problems, review
  walks). It knows about a list and an index; it knows nothing about what a
  problem or a comment is.

  ```ts
  import { renderStepperBar } from "@wildwinter/app-shell";
  import "@wildwinter/app-shell/stepper.css";
  renderStepperBar(host, {
    items: problems.map((p) => ({ kind: p.severity, kindClass: `sev-${p.severity}`, where: p.path, text: p.message })),
    at, tone: "danger", onStep: (i) => { at = i; paint(); }, onGo: (i) => jumpTo(problems[i]),
  });
  ```

  Whether stepping NAVIGATES is the caller's decision, and the bar takes no view:
  an ambient surface moves the view and never the focus; a mode you entered may
  take you somewhere.

- **`saveIndicator`** - the six lines that draw what `createSaveController`
  already computes. Three states, always present: a dot that only ever appears
  to worry you leaves "did that get written?" unanswered.

  ```ts
  const ind = saveIndicator();
  topbar.append(ind.el);
  const saver = createSaveController({ write, onStatus: ind.set });
  ```

- **`staleBar`** - a running session that has fallen behind its source. The app
  supplies the noun and the callback; the sentence is shared, because both apps
  had written it independently and landed a word apart.

  ```ts
  staleBar({ subject: "The project", onRestart: () => void rebuild() });
  ```

- **`toast`** - a transient remark: "Bundle published", "Save refused: ...".
  Bottom-right, an outlined card on the surface colour with the kind in the
  border, on the shared panel motion; one at a time, 4s (7s for an error).
  Both apps had one, and they agreed on nothing but the sentences - place,
  colour, timing, motion and ARIA all differed. It mounts its own node, so a
  second window gets it by importing it. Bring `toast.css`.

  ```ts
  toast(`Bundle published\n${where}`, "ok");
  toast(`Save refused: ${err}`, "error");
  ```

- **`revealRow`** - land on one row of a settings list. `expandableRow` takes a
  `name` and stamps it on the row; `revealRow(within, name)` opens that row's
  details, brings it to the middle of its scroller and lights it for a moment.
  "Go to definition" in both apps opened the page a property is declared on and
  stopped there, with the row off screen. It returns false when no row carries
  the name, so a host whose page fills in late asks again on a later frame.
  Brings nothing new: the light is in `settings.css`.

  ```ts
  list.append(expandableRow({ line, details, name: decl.name }));
  revealRow(document, "mood");
  ```

- **`--linkstatus-reserve`** - how much of the window's bottom-right corner the
  live-link chip takes, published on the document while the chip is visible (`0px`
  while hidden) and re-measured as its address comes and goes. The chip floats over
  that corner, and both apps had things drawn under it. The stepper bar leaves the
  room itself; a host strip that can end in the corner opts in with
  `padding-right: calc(<its own> + var(--linkstatus-reserve, 0px))`.

- **`--ok`** joins `--danger` and `--warn` in `tokens.css`, with a `light-dark()`
  default every palette should override in its own `theme.css`. It is the only
  colour in the grammar layer, and it is there because it kept not being
  anywhere: "all is well" was being met with raw green literals that could not
  theme-shift.

## v0.41 (the kit gallery)

The new-thing moment (New Project, New Box, New Scene), drawn once: tiles on
the left, the chosen kit said in full on the right, one screen, on the dialog
frame. Shelves say what their button does, so a kit ("Create") and a worked
example ("Open a Copy") can sit side by side.

```ts
import { openKitGallery } from "@wildwinter/app-shell";
import "@wildwinter/app-shell/kit-gallery.css";

openKitGallery({
  title: "New project",
  what: "A project is one game's worth of storylets.",
  namePlaceholder: "The Village",
  details: vcsFields,                       // the app's own fields, under the name
  sections: [
    { caption: "Start from a kit", items: [
      { id: "starter", name: "Starter project", blurb: "Two cards that already work together.",
        play: "Press Play: one card opens the next.", features: ["One box", "Playable at once"],
        lands: ["One box", "Two cards"] },
    ] },
    { caption: "Learn from a finished project", action: "Open a Copy", usesDetails: false,
      items: [{ id: "hamlet", name: "The Hamlet", blurb: "Small.", badge: "Start here" }] },
  ],
  onPick: (id, { name }) => { /* the app makes it */ },
});
```

- **What a kit is made of stays in the app.** The shell knows names, words and
  pictures, never boxes or scenes.
- Single click chooses, double-click chooses and goes, Enter in the name field
  creates; the name is required when asked for.
- **v0.42: on the welcome too.** A welcome group with `tiles: true` draws its
  items with the gallery's own tile (`kitTile`), so a kit looks the same on the
  welcome as in New Project; import `kit-gallery.css` beside `welcome.css`. An
  item's `tile` is a shorter line for the tile when its blurb runs past the
  three lines a tile shows.
- **v0.43:** `onNameInput` runs as the name is typed (and once on open), so an
  app's own fields can follow it: Patterpad's "Saved as" preview and its
  default publish path.
- **v0.44:** `onChoose` runs whenever an item is chosen, so an app can show or
  hide its own fields per kit; `validate` holds the pick until the app's own
  field is filled, marking and focusing it the way an empty name is.
- **v0.46:** `features`, a kit's features as pills on its tile (the welcome's
  too) and in the panel, replace both `shows` and pictures. Pictures were tried
  in 0.41 to 0.45 and ruled out by the author; `image` and the `--kit-art-*`
  tokens are gone.

## v0.51 (the file-byte history, and rows for structured values)

**`@wildwinter/app-shell/history`** (main process): undo and redo for the files
an app writes, the files-are-truth way. Storyletter's, lifted so Patterpad's
project-level undo is the same code; the document undo of each app still
shares nothing.

```ts
import { History, captureBefore, applyStates } from "@wildwinter/app-shell/history";

const history = new History({ write: myOrderedWriter, restorer: (path) => path.endsWith(".patterx") ? trail : undefined });
history.record("Rename card", "card:c_1", captureBefore(paths), writes);   // after the writes land
const outcome = await history.applyUndo();   // { ok, label } or { ok: false, error, drift? }
```

- A repeated key folds into one step; `fold` adds a write nobody asked for to
  the last step; a hundred steps are kept.
- **Drift is refused**: a file changed since the step (a pull, a merge, the other
  app) refuses the undo or redo, names the file, and drops that step and every
  one below it.
- A per-file `restorer` decides what counts as drift and what is written back;
  the `write` option is the app's own write path (`applyStates`, all or nothing
  through simple-vc-lib 0.5, by default).

**`@wildwinter/app-shell/value-rows`**: a row for a value of any declared type,
for an extension's fields. The seven scalars are the field row; a `reference`
picks one of the host's nodes, a `pick` one choice from its sources ("auto"
first, then its fixed words, the host's nodes of a kind, and the extension's
project lists, through the adapter's optional `list(name)`), a `record` is its fields, a `map` is keyed by a
host's nodes or by text, a `list` adds, moves and removes items (a new item of
an id list gets a fresh id). The checks are `@wildwinter/toolkit/extensions`'
(an optional peer, 0.2.5 or later), so the editor and validation agree.

```ts
import { valueRows } from "@wildwinter/app-shell/value-rows";
const rows = valueRows();
host.append(rows.row(`${nodeId}:${decl.name}`, { decl, value, adapter: { nodes: (kind) => myNodes(kind) }, onCommit }));
```

- **v0.52:** a declaration's `valueHelp` (a sentence per enum value, flag or
  stage, as a manifest gives them) shows the chosen value's under the control,
  and each chosen flag's, in the field row and so in every value row. The
  adapter's optional `label(kind, id)` names a held node the choices leave out,
  so only a node the host says is gone reads as gone.
- **v0.53:** `History.clearRedo()`, for a host that changes the files on its
  own; `replaceProblem` on a field row or value row, the host's sentence instead
  of the row's own; and **`@wildwinter/app-shell/extension-copy`**, an
  extension's problems worded for the writer (`entryProblemLine`,
  `valueProblemSentence`, `fieldPhrase`), Patterpad's rules made the family's,
  with each app's words for its items, kinds and where a value is changed
  passed in.
- **v0.54:** the `pick` row, the adapter's `list(name)` for a pick's
  project lists, and the words for a pick's problems (`not-a-choice`,
  `pick-ambiguous`, `pick-clash`). Needs toolkit 0.2.5.

## v0.55 (one live link server)

**`@wildwinter/app-shell/live-link`** (main process): the loopback WebSocket
server a running game connects to, once for the family. Patterpad's and
Storyletter's were copies; each now plugs its own protocol into this one.
`ws` (8 or later) is an optional peer the app supplies.

```ts
import { createLiveLinkServer } from "@wildwinter/app-shell/live-link";

const server = createLiveLinkServer<MyFields>({
  port: 4471,
  currentBuildHash: () => projectHash(),
  onStatus: (s) => sendToWindows(s),
  protocol: ({ pushStatus }) => ({
    hello: ({ build, project, msg }) => { /* a run begins: read msg's own fields */ },
    message: (msg) => { /* anything after the hello; pushStatus() if it changes the status */ },
    reset: () => { /* the game went away */ },
    describe: () => ({ /* your fields on a connected status */ }),
  }),
});
server.start();
server.pushBundle(hash, json);   // after a save
```

- Loopback only, and a web page's Origin is refused (`isLocalOrigin`).
- One game at a time: a new connection replaces the old.
- Nothing reaches the protocol before a hello, which names the build: `match`,
  `stale`, or `unknown` (no project open).
- `pushBundle` sends `{ t: "bundle", v: 1, build, data }` only to a game that
  has said hello and runs another build, and shows the build stale until the
  game re-hellos with the new one.
- A taken port reports an error and leaves the server off. The status is the
  link-status chip's.

## v0.56 (native controls follow the palette, and extension fields folded)

**`--color-scheme`**: `tokens.css` now sets `color-scheme: var(--color-scheme,
light dark)` on `:root`. Native controls (unticked checkboxes, radios,
scrollbars, select pop-ups, date fields) and every `light-dark()` default
(`--ok`, `--on-accent`) draw from `color-scheme`, so they followed the OS even
when the author had picked a palette: a light palette under a dark OS drew
every unticked checkbox as a dark filled square, and a dark palette under a
light OS drew bright white boxes. `accent-color` colours only the ticked state.

**The rule: every palette block declares `--color-scheme`**, `light` or
`dark` by its ground. A palette that can be chosen explicitly needs a block of
its own even when it is also the bare `:root` default, so the bare `:root` can
leave the token unset and "follow the OS" keeps working through the fallback.

```css
/* an app's theme.css */
:root[data-theme="linen"]  { --color-scheme: light; }
:root[data-theme="indigo"] { --color-scheme: dark; }
```

**An extension's fields folded** (`@wildwinter/app-shell/value-rows`): an
extension's section in an inspector shows only the fields the node sets, and
opens to every field on request. `isSet(decl, value)` is the rule: held, and
not the toolkit's `defaultOf`, compared deeply (a record of defaults, an empty
map, an enum's first value and `false` are all unset). `extensionFold()` draws
the section around the host's own rows: the caption is the disclosure, with
the count ("Pattershot (3 set)"); the fold is per extension and stays as left
from node to node; a value cleared while folded keeps its row until the author
leaves the node; the host's lead (a lock line) and tail (undeclared keys)
always show. Styles in `controls.css`; `lockControls` leaves the caption live.

```ts
const fold = extensionFold();   // one per inspector, kept across redraws
host.append(fold.section({
  extension: x.id, caption: x.name, node: nodeId, fields, entry,
  row: (decl) => rows.row(`${x.id}:${nodeId}:${decl.name}`, { decl, value: entry?.[decl.name], onCommit }),
  group: (name) => heading(name),
}));
fold.sweep();   // after each redraw, beside the rows' own sweep
```

Project Settings shouldn't fold: it's where an author goes to set things.

## v0.57 (a map of records as a grid)

**`@wildwinter/app-shell/value-rows`**, for a map whose values are records (an
extension's per-character performance, say), too big for an inspector's column:

- `isRecordMap(decl)`: which fields these are, from the declaration alone.
- `recordMapSummary(decl, value, adapter)`: a line per key, "TAM: smile, nod",
  the record's set values as their controls show them (`valueText`); for the
  inspector, beside an Edit button.
- `recordMapGrid({ decl, value, adapter, onCommit, disabled })`: the grid a
  helper window draws, a row per key and a column per record field, each cell
  the row value-rows draws for that field (picks, checks and problems
  included), a remove button per row and the key adder under it. `onCommit`
  gets the whole map. Cells keep their elements across `update`. Styles in
  `controls.css`.

**`selectionFollowButton`** (tool-window kit): "Follow selection", for a helper
window that shows whatever the editor has selected. The other direction from
`followButton` ("Follow in the editor"), so it has its own words.

## Roadmap

Later slices lift the rest of the common shell from Patterpad (canonical),
reconciling Storylet Studio's variants: the pane grid + toggles, the command
palette, and version control's renderer half. Storylet Studio migrates each
first (proving app-agnosticism); Patterpad follows - see
`patterkit/design/from-storylets/patterpad-onto-the-shell.md` for that order.

## Third-party

The icon vocabulary (`iconNode`, `iconSvg` in `src/icons.ts`) vendors drawings
from [Lucide](https://lucide.dev) 1.46.0, ISC licence, Copyright (c) 2026 Lucide
Icons and Contributors; some of those derive from Feather, MIT, Copyright (c)
2013-present Cole Bemis. The notices are in `LICENSES.md` and at the head of
`src/icons.ts`. Everything else in this package is MIT (see `LICENSE`).

## Release

```bash
npm run release -- minor   # bumps, commits, pushes, tags, creates a GH Release
```

Creating the Release triggers `publish.yml`, which publishes to npm. Requires an
`NPM_TOKEN` repo secret with publish rights to the `@wildwinter` scope.
