# Monster Mash

Monorepo for the gameplay prototype and scaling-oriented foundation.

## Stack

1. Frontend: Next.js + Three.js (`apps/web`)
2. Performance path: Rust simulation core (`packages/sim-core`)
3. Decision records: `docs/adr`

## Workspace (pnpm)

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## Austin Bootstrap Data

```bash
pnpm data:austin
pnpm atlas:austin
```

This pulls real Austin map/species data and creates a starter atlas generation queue in `/Users/jcrisp/Code/monster-mash/data/austin`.

## Vercel Deployment Notes

This repository is prepared for Vercel with `pnpm` commands in `/Users/jcrisp/Code/monster-mash/vercel.json`.

In Vercel project settings:

1. Framework preset: `Next.js`
2. Root directory: repository root (`.`)
3. Install command: `pnpm install --frozen-lockfile`
4. Build command: `pnpm --filter web build`

## Performance Strategy

1. Keep rendering/input in web client.
2. Move deterministic simulation rules into Rust (`packages/sim-core`).
3. Later run the same Rust logic in authoritative world services outside Vercel.
