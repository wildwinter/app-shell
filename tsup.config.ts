import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/menu.ts", "src/tokens.css", "src/pane-shell.css", "src/settings.css"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
});
