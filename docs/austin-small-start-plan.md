# Austin Small-Start Plan (Real Data -> Style-First Prototype)

This is the execution plan to keep scope small while preserving a path to full-area species scaling.

## Step 1: Real Inputs (Done Locally)

Data is pulled by:

```bash
pnpm data:austin
pnpm atlas:austin
```

Outputs:

1. `/Users/jcrisp/Code/monster-mash/data/austin/location.json`
2. `/Users/jcrisp/Code/monster-mash/data/austin/map-features.geojson`
3. `/Users/jcrisp/Code/monster-mash/data/austin/species-top200.json`
4. `/Users/jcrisp/Code/monster-mash/data/austin/species-starter-40.json`
5. `/Users/jcrisp/Code/monster-mash/data/austin/atlas-manifest-v0.json`
6. `/Users/jcrisp/Code/monster-mash/data/austin/atlas-generation-queue-v0.json`

Sources used:

1. [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/)
2. [OpenStreetMap Overpass API](https://overpass-api.de/)
3. [iNaturalist API](https://api.inaturalist.org/v1/docs/)

## Step 2: Style Lock (Start With 12 Mons)

Use `atlas-manifest-v0.json` as the first art scope:

1. Generate 12 mon sprite sheets first.
2. Keep strict retro constraints:
   - 32x32 frames
   - readable silhouette at 1x scale
   - no anti-aliased blur
3. Validate in-game at target camera zoom before generating more species.

## Step 3: Expand to Austin 40-Pack

After style lock:

1. Generate remaining 28 mons from `species-starter-40.json`.
2. Keep same animation contract for every mon.
3. Add automated checks:
   - frame count by animation
   - transparent background
   - sprite bounds occupancy (avoid mostly-empty frames)

## Step 4: Scale to "All Species in Area"

Scaling strategy:

1. Keep pulling top observed species in Austin windows (radius/cell based).
2. Track taxonomy IDs as canonical IDs (stable breeding/evolution rules).
3. Split asset generation into queues by iconic taxon and popularity.
4. Use "encounter-ready" subset in runtime while background generation catches up.

## Runtime Rule

Do not block gameplay on asset generation. Missing mon art should resolve to deterministic placeholder sprites until approved atlases are available.
