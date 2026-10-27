import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts", "src/menu.ts", "src/tool-window.ts", "src/job.ts", "src/vc-status.ts", "src/app-store.ts", "src/history.ts", "src/updater.ts", "src/session.ts",
    "src/dialog.ts", "src/floating.ts", "src/context-menu.ts",
    "src/updater-view.ts", "src/welcome.ts", "src/kit-gallery.ts", "src/link-status.ts", "src/live-link.ts", "src/property-list.ts", "src/util.ts", "src/keys.ts", "src/problems.ts", "src/value-control.ts", "src/value-rows.ts", "src/extension-copy.ts", "src/window-guard.ts",
    "src/view-protocol.ts", "src/view-client.ts", "src/view-host.ts", "src/view-package.ts", "src/view-host-web.ts", "src/view-preload.ts", "src/contrast.ts", "src/theme.ts", "src/palette-main.ts",
    "src/tokens.css", "src/palette.css", "src/controls.css", "src/dialog.css", "src/context-menu.css", "src/pane-shell.css", "src/settings.css", "src/tool-window.css", "src/confirm.css", "src/job.css", "src/tooltip.css", "src/about.css", "src/anchored.css", "src/vc.css", "src/identity.css", "src/notes-editor.css", "src/comments.css", "src/stale.css", "src/save.css", "src/stepper.css", "src/toast.css",
    "src/extensions-window.css", "src/command-palette.css", "src/updater.css", "src/welcome.css", "src/kit-gallery.css", "src/link-status.css", "src/keys.css",
  ],
  format: ["esm", "cjs"],
  // Declarations only for the TS entries (the dts compiler rejects css roots).
  dts: { entry: ["src/index.ts", "src/menu.ts", "src/tool-window.ts", "src/job.ts", "src/vc-status.ts", "src/app-store.ts", "src/history.ts", "src/updater.ts", "src/session.ts", "src/dialog.ts", "src/floating.ts", "src/context-menu.ts", "src/updater-view.ts", "src/welcome.ts", "src/kit-gallery.ts", "src/link-status.ts", "src/live-link.ts", "src/property-list.ts", "src/util.ts", "src/keys.ts", "src/problems.ts", "src/value-control.ts", "src/value-rows.ts", "src/extension-copy.ts", "src/window-guard.ts", "src/view-protocol.ts", "src/view-client.ts", "src/view-host.ts", "src/view-package.ts", "src/view-host-web.ts", "src/contrast.ts", "src/theme.ts", "src/palette-main.ts"] },
  clean: true,
  sourcemap: true,
  treeshake: true,
  // The tool-window entry is main-process code: electron stays external
  // (an optional peer supplied by the consuming app), and so does ws for the
  // live-link server. view-preload builds to dist/view-preload.cjs, which a
  // view window loads as its preload: a sandboxed preload can require only
  // electron, so it must stay a single file (cjs output is never split).
  external: ["electron", "@wildwinter/simple-vc-lib", "electron-updater", "@wildwinter/toolkit", "ws"],
});
