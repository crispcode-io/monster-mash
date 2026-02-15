# mm-core-rs

Low-level Monster Mash core for native and WebAssembly targets.

## Scope (P2 bootstrap)
1. Stable C-style ABI symbols for client integration.
2. Mesh stats placeholder functions (to be replaced by real greedy meshing).
3. Shared base for native and wasm builds.

## Build (when Rust toolchain is available)
```bash
cd apps/mm-core-rs
cargo test
```

WASM target example:
```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
```
