# @monster-mash/sim-core

Rust-based simulation core for deterministic, performance-critical systems.

## Why this exists

1. Browser and server can share deterministic simulation logic through WASM/native builds.
2. Keeps hot-path gameplay logic out of JavaScript as concurrency grows.
3. Supports long-term migration path to pure Rust world services.

## Commands

```bash
pnpm --filter @monster-mash/sim-core run check:rust
pnpm --filter @monster-mash/sim-core run test:rust
pnpm --filter @monster-mash/sim-core run build:wasm
```

`build:wasm` requires `wasm-pack` to be installed.
