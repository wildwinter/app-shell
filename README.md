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

- **`--ok`** joins `--danger` and `--warn` in `tokens.css`, with a `light-dark()`
  default every palette should override in its own `theme.css`. It is the only
  colour in the grammar layer, and it is there because it kept not being
  anywhere: "all is well" was being met with raw green literals that could not
  theme-shift.

## Roadmap

Later slices lift the rest of the common shell from Patterpad (canonical),
reconciling Storylet Studio's variants: the pane grid + toggles, the command
palette, and version control's renderer half. Storylet Studio migrates each
first (proving app-agnosticism); Patterpad follows - see
`patterkit/design/from-storylets/patterpad-onto-the-shell.md` for that order.

## Release

```bash
npm run release -- minor   # bumps, commits, pushes, tags, creates a GH Release
```

Creating the Release triggers `publish.yml`, which publishes to npm. Requires an
`NPM_TOKEN` repo secret with publish rights to the `@wildwinter` scope.
