import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts", "src/menu.ts", "src/tool-window.ts", "src/job.ts", "src/vc-status.ts", "src/app-store.ts", "src/updater.ts", "src/session.ts",
    "src/dialog.ts", "src/floating.ts", "src/context-menu.ts",
    "src/updater-view.ts", "src/welcome.ts", "src/link-status.ts", "src/property-list.ts", "src/util.ts",
    "src/tokens.css", "src/controls.css", "src/dialog.css", "src/context-menu.css", "src/pane-shell.css", "src/settings.css", "src/tool-window.css", "src/confirm.css", "src/job.css", "src/tooltip.css", "src/about.css", "src/anchored.css", "src/vc.css", "src/identity.css", "src/notes-editor.css", "src/comments.css", "src/stale.css", "src/save.css", "src/stepper.css", "src/toast.css",
    "src/updater.css", "src/welcome.css", "src/link-status.css",
  ],
  format: ["esm", "cjs"],
  // Declarations only for the TS entries (the dts compiler rejects css roots).
  dts: { entry: ["src/index.ts", "src/menu.ts", "src/tool-window.ts", "src/job.ts", "src/vc-status.ts", "src/app-store.ts", "src/updater.ts", "src/session.ts", "src/dialog.ts", "src/floating.ts", "src/context-menu.ts", "src/updater-view.ts", "src/welcome.ts", "src/link-status.ts", "src/property-list.ts", "src/util.ts"] },
  clean: true,
  sourcemap: true,
  treeshake: true,
  // The tool-window entry is main-process code: electron stays external
  // (an optional peer supplied by the consuming app).
  external: ["electron", "@wildwinter/simple-vc-lib", "electron-updater"],
});
