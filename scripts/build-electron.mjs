import { build } from "esbuild";

await Promise.all([
  build({
    entryPoints: ["src/main/main.ts"],
    outfile: "dist-electron/main.js",
    platform: "node",
    format: "esm",
    bundle: true,
    external: ["electron"],
    sourcemap: true
  }),
  build({
    entryPoints: ["src/preload/preload.ts"],
    outfile: "dist-electron/preload.cjs",
    platform: "node",
    format: "cjs",
    bundle: true,
    external: ["electron"],
    sourcemap: true
  })
]);
