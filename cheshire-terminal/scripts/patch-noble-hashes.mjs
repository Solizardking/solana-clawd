#!/usr/bin/env node
/**
 * Patches @noble/hashes@2.x to restore ./sha3 and ./sha256 exports
 * needed by @metaplex-foundation/mpl-core and @metaplex-foundation/mpl-agent-registry.
 *
 * These exports were removed in @noble/hashes v2 but Metaplex packages still
 * require() them without the .js extension (CJS-style).
 * pnpm overrides don't apply to peer dependencies, so we patch after install.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pnpmStore = join(__dirname, '..', 'node_modules', '.pnpm');

if (!existsSync(pnpmStore)) {
  console.log('[patch-noble-hashes] No .pnpm store found, skipping.');
  process.exit(0);
}

const missingExports = {
  './sha3': './sha3.js',
  './sha256': './sha256.js',
};

let patched = 0;

for (const entry of readdirSync(pnpmStore)) {
  if (!entry.startsWith('@noble+hashes@2.')) continue;

  const pkgPath = join(pnpmStore, entry, 'node_modules', '@noble', 'hashes', 'package.json');
  if (!existsSync(pkgPath)) continue;

  try {
    const json = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    let modified = false;

    if (!json.exports) {
      console.warn(`[patch-noble-hashes] No exports field in ${entry}, skipping.`);
      continue;
    }

    for (const [subpath, target] of Object.entries(missingExports)) {
      if (!json.exports[subpath]) {
        json.exports[subpath] = target;
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(pkgPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
      patched++;
      console.log(`[patch-noble-hashes] Patched ${entry}`);
    }
  } catch (err) {
    console.error(`[patch-noble-hashes] Error patching ${entry}:`, err.message);
  }
}

if (patched > 0) {
  console.log(`[patch-noble-hashes] Successfully patched ${patched} package(s).`);
} else {
  console.log('[patch-noble-hashes] No packages needed patching.');
}