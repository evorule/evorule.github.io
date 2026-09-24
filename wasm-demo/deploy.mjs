// SPDX-License-Identifier: CC0-1.0
// deploy.mjs — sync the freshly built wasm pkg from the evorule workspace into
// this directory (the GitHub Pages source of the live demo).
//
// Full refresh flow:
//   1. cd D:\evorule\evorule-wasm-demo && wasm-pack build --target web --out-dir pkg
//   2. node build-rules.js            (in this dir — regenerate rules.js)
//   3. node deploy.mjs                (in this dir — sync pkg/)
//   4. git add -A && git commit && git push   (Pages redeploys automatically)
//
// The footer version badge comes from the wasm module itself
// (engine_version()), so a synced pkg always self-declares what it is.

'use strict';

import { cpSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC =
  process.env.EVORULE_WASM_PKG ||
  path.join(HERE, '..', '..', 'evorule', 'evorule-wasm-demo', 'pkg');
const DEST = path.join(HERE, 'pkg');

const REQUIRED = [
  'evorule_wasm_demo.js',
  'evorule_wasm_demo_bg.wasm',
  'evorule_wasm_demo.d.ts',
  'evorule_wasm_demo_bg.wasm.d.ts',
];
for (const f of REQUIRED) {
  if (!existsSync(path.join(SRC, f))) {
    console.error(`missing ${f} in ${SRC} — build the pkg first (wasm-pack build)`);
    process.exit(1);
  }
}

mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true });
console.log('pkg synced: ' + SRC + ' -> ' + DEST);

// Print the version baked into the artifact, for the deploy log.
// (engine_version()'s string lives in the .wasm binary, not the JS glue.)
const wasm = readFileSync(path.join(DEST, 'evorule_wasm_demo_bg.wasm'), 'latin1');
const m = wasm.match(/evorule-wasm-demo [0-9][^\x00"]*?TCB v[0-9][0-9.]*/);
console.log('artifact claims: ' + (m ? m[0] : 'version string not found (rebuild the pkg)'));
