import { defineConfig } from "tsup";

// Two entry points: the public library (`index`) and the executable CLI.
// tsup detects the shebang in `cli.ts` and marks the output executable.
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  target: "node20",
  dts: { entry: "src/index.ts" },
  clean: true,
  sourcemap: true,
  splitting: false,
});
