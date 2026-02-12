# Monster Mash Web Prototype

This app contains the local gameplay prototype for:

1. Home screen
2. Start game flow (character name, gender, archetype)
3. World entry with low-level Three.js rendering
4. Deterministic chunked world generation

## Run Locally

```bash
pnpm install
pnpm --filter web dev
```

Open `http://localhost:3000`.

## Prototype Controls

1. Create a profile in `/start`.
2. Enter the world in `/world`.
3. Move using `WASD` or arrow keys.

## Scaling-Oriented Foundation in This Prototype

1. Typed world/game contracts in `src/lib/game-contracts.ts`.
2. Deterministic world generation by `worldSeed + chunkX + chunkZ`.
3. Chunk-based world loading (`activeChunkRadius`) to mimic future MMO cell management.
4. Real-world coordinate conversion with traversal compression (`compressionFactor`).

## Quality Checks

```bash
pnpm --filter web lint
pnpm --filter web build
```

## Austin Data + Atlas Bootstrap

From repository root:

```bash
pnpm data:austin
pnpm atlas:austin
pnpm data:sync:web
```

Then run `pnpm --filter web dev`. The world HUD will show the loaded Austin atlas pack summary.
