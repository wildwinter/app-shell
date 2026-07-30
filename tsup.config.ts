import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts", "src/menu.ts", "src/tool-window.ts",
    "src/tokens.css", "src/pane-shell.css", "src/settings.css", "src/tool-window.css", "src/confirm.css",
  ],
  format: ["esm", "cjs"],
  // Declarations only for the TS entries (the dts compiler rejects css roots).
  dts: { entry: ["src/index.ts", "src/menu.ts", "src/tool-window.ts"] },
  clean: true,
  sourcemap: true,
  treeshake: true,
  // The tool-window entry is main-process code: electron stays external
  // (an optional peer supplied by the consuming app).
  external: ["electron"],
});
