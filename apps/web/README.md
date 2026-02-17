# Monster Mash Web Prototype

This app contains the local gameplay prototype for:

1. Home screen
2. Start game flow (`Start -> Gender -> Character Creation -> Enter World`)
3. World entry with first-person and third-person camera modes
4. Deterministic chunked world generation

## Run Locally

```bash
pnpm install
pnpm --filter web dev
```

Open `http://localhost:3100`.

For one-command multiplayer game test from repo root, use:

```bash
pnpm game:test
```

MM core wasm is required by default in this flow. Only use fallback mode explicitly:

```bash
NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK=true pnpm game:play
```

## Prototype Controls

1. Create a profile in `/start`.
2. Enter the world in `/world`.
3. Move using `WASD` (or `ArrowUp/ArrowDown`).
4. Turn using mouse drag or `Q/E` (or left/right arrows).
5. Toggle camera mode in the world HUD.

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
