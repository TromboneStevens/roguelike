// Build script for the co-op bullet hell roguelike.
//
// Produces two bundles via the esbuild JS API:
//   - src/client/main.ts   -> dist/client/bundle.js   (browser target, ESM)
//   - src/server/index.ts  -> dist/server/index.js    (node target, ESM, ws external)
//
// Also copies everything under public/ into dist/client so the server can serve
// the static client. Pass --watch to rebuild (and re-copy) on source changes.

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

const clientOutDir = resolve(root, "dist/client");
const serverOutDir = resolve(root, "dist/server");
const publicDir = resolve(root, "public");

/** @type {import("esbuild").BuildOptions} */
const clientOptions = {
  entryPoints: [resolve(root, "src/client/main.ts")],
  outfile: resolve(clientOutDir, "bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  logLevel: "info",
};

/** @type {import("esbuild").BuildOptions} */
const serverOptions = {
  entryPoints: [resolve(root, "src/server/index.ts")],
  outfile: resolve(serverOutDir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
  external: ["ws"],
  // Allow `import ... from "ws"` to resolve at runtime from node_modules.
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
};

async function copyPublic() {
  await mkdir(clientOutDir, { recursive: true });
  await cp(publicDir, clientOutDir, { recursive: true });
}

async function main() {
  await rm(resolve(root, "dist"), { recursive: true, force: true });
  await mkdir(clientOutDir, { recursive: true });
  await mkdir(serverOutDir, { recursive: true });

  if (watch) {
    const clientCtx = await esbuild.context(clientOptions);
    const serverCtx = await esbuild.context(serverOptions);
    await copyPublic();
    await clientCtx.watch();
    await serverCtx.watch();
    console.log("[build] watching for changes (public/ copied once at start)...");
    // Keep the process alive.
    await new Promise(() => {});
  } else {
    await Promise.all([esbuild.build(clientOptions), esbuild.build(serverOptions)]);
    await copyPublic();
    console.log("[build] done: dist/client/bundle.js, dist/server/index.js");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
