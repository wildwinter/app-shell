import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/tokens.css", "src/pane-shell.css"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
});
