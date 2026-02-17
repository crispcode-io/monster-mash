# Monster Mash

Monorepo for the gameplay prototype and scaling-oriented foundation.

## Stack

1. Frontend: Next.js + Three.js (`apps/web`)
2. Performance path: Rust simulation core (`packages/sim-core`)
3. Decision records: `docs/adr`
4. OpenClaw MMO architecture draft: `docs/openclaw-mmo-architecture.md`

## Workspace (pnpm)

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## One-Command Game Run/Test

Use multiplayer-authoritative flow for all gameplay testing:

```bash
pnpm game:play
pnpm game:test
```

Notes:
1. `pnpm game:test` runs checks first, then launches a playable multiplayer-enabled game session.
2. Script auto-selects open ports and prints the client URL.
3. Legacy `play:*` aliases map to the same multiplayer command.
4. `pnpm game:play` and `pnpm game:test` both prebuild wasm before launching gameplay.

## Rust/WASM Prereq (P2)

Wasm is required by default for deterministic mesh/runtime behavior:

```bash
rustup target add wasm32-unknown-unknown
pnpm wasm:build
```

Fallback mode is opt-in only:

```bash
NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK=true pnpm game:play
```

Quick check:

```bash
pnpm game:test
```

Then verify in world HUD that `Mesh Core` reports `wasm`.

## Austin Bootstrap Data

```bash
pnpm data:austin
pnpm atlas:austin
```

This pulls real Austin map/species data and creates a starter atlas generation queue in `data/austin`.

## Vercel Deployment Notes

This repository is prepared for Vercel with `pnpm` commands in `vercel.json`.

In Vercel project settings:

1. Framework preset: `Next.js`
2. Root directory: repository root (`.`)
3. Install command: `pnpm install --frozen-lockfile`
4. Build command: `pnpm --filter web build`

## Performance Strategy

1. Keep rendering/input in web client.
2. Move deterministic simulation rules into Rust (`packages/sim-core`).
3. Later run the same Rust logic in authoritative world services outside Vercel.
