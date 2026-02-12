# Runtime Boundaries (Prototype -> Scale)

## Deploy target

1. Deploy `apps/web` to Vercel for fast iteration and global delivery.
2. Keep Vercel focused on UI/API orchestration, not high-frequency authoritative simulation.

## Performance-critical code

1. Put deterministic simulation logic in Rust (`packages/sim-core`).
2. Use WASM builds for client-side hot paths when needed.
3. Run authoritative world simulation on dedicated Rust services outside Vercel once multiplayer scale starts.

## C++ note

C++ can be added later for specialized hot loops, but Rust should be the default systems language now because it integrates cleanly with:

1. WASM in the browser
2. Native Linux world services
3. Safer concurrency for MMO server code
