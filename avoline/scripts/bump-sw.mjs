#!/usr/bin/env node
// Avolin SW version bumper.
//
// Runs as a pre-build step. Rewrites the CACHE_VERSION constant inside
// public/sw.js to include the current build timestamp. That guarantees the
// browser sees a different sw.js byte-stream on every republish, which
// triggers an SW reinstall → activate → controllerchange → page reload, so
// installed PWAs always pick up the freshly-deployed JS bundle without the
// user having to manually clear cache.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, "..", "public", "sw.js");

const buildId = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);

const original = readFileSync(swPath, "utf8");
const updated = original.replace(
  /const CACHE_VERSION = "[^"]*";/,
  `const CACHE_VERSION = "avolin-shell-${buildId}";`,
);

if (updated === original) {
  console.warn(
    "[bump-sw] CACHE_VERSION line not found in sw.js — file left unchanged.",
  );
  process.exit(0);
}

writeFileSync(swPath, updated, "utf8");
console.log(`[bump-sw] CACHE_VERSION → avolin-shell-${buildId}`);
