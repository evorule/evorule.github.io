# EvoRule Live WASM Demo

Source of `https://evorule.github.io/wasm-demo/` — the real EvoRule TCB engine
compiled to WebAssembly, running entirely in the browser: deterministic rule
execution, BLAKE3 audit chain, time machine, and (since 2026-09-24) the full
`io_request → resolve → replay` loop (D11 contract).

## Layout

- `index.html` — the demo page (single file: markup, styles, app logic).
- `rules.js` — **AUTO-GENERATED** rule data, do not edit by hand.
- `pkg/` — wasm-bindgen artifact, synced from the engine crate.
- `build-rules.js` — regenerates `rules.js`.
- `deploy.mjs` — syncs `pkg/` from the engine crate build.
- `io_flow_test.mjs` — regression gate for the D11 io flow (`node io_flow_test.mjs`,
  15 checks; run after any pkg or rules.js refresh).

## Refresh flow

```bash
# 1. rebuild the engine artifact (from the evorule workspace)
cd ../evorule/evorule-wasm-demo
wasm-pack build --target web --out-dir pkg

# 2. regenerate rule data
cd ../../evorule.github.io/wasm-demo
node build-rules.js

# 3. sync the pkg
node deploy.mjs

# 4. commit + push; GitHub Pages redeploys automatically
```

## Rulesets

`finance` / `medical` / `djbh` are generated from the canonical rule-set files
in `evorule-console-cloud/static/rules/` (override the source directory with
`EVORULE_RULES_DIR`).

`io` is authored inline in `build-rules.js` and demonstrates the D11 replay
contract with the same two-phase pattern as the shipped server constitution:

- phase 1 — `__io_result__` absent → lone `io_request` leaf (params resolve to
  concrete values at signal time);
- phase 2 — `__io_result__` present → consume the result into the payload,
  then clear it with `set ... = null` (JSON null counts as "cleared" for the
  `exists` predicate, so the next instruction starts a fresh io_request
  instead of consuming the stale one).

## Engine version badge

The footer shows `engine: evorule-wasm-demo X / TCB vY`. Both values are baked
into the wasm artifact at build time (`build.rs` extracts the `evorule-tcb`
dependency version from Cargo.toml), so the deployed demo always self-declares
what it is — staleness relative to the latest release is directly visible.
