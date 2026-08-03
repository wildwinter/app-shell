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

## Roadmap

Later slices lift the rest of the common shell from Patterpad (canonical),
reconciling Storylet Studio's variants: the pane grid + toggles, the save/dirty
controller, the command palette, the anchored popover/panel + toast, and the
detached-window out-of-date / restart pattern. Storylet Studio migrates each
first (proving app-agnosticism); Patterpad follows.

## Release

```bash
npm run release -- minor   # bumps, commits, pushes, tags, creates a GH Release
```

Creating the Release triggers `publish.yml`, which publishes to npm. Requires an
`NPM_TOKEN` repo secret with publish rights to the `@wildwinter` scope.
