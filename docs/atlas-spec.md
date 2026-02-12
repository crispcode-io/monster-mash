# Sprite Atlas Contract (Nano Banana -> Runtime)

Use this contract for every generated mon.

## Required Output Per Mon

1. `PNG` sprite sheet: `/atlas/<pack-id>/mons/<taxon-id>.png`
2. `JSON` frame map: `/atlas/<pack-id>/mons/<taxon-id>.json`

## Frame Rules

1. Frame size: `32x32`
2. Transparent background only
3. Pixel art style with hard edges (no blur)
4. One consistent facing direction for world mode

## Required Animations

1. `idle`: 4
2. `walk`: 6
3. `attack`: 6
4. `sleep`: 2
5. `faint`: 2
6. `hurt`: 2
7. `jump`: 3
8. `run`: 6

## Metadata Example

```json
{
  "taxonId": 46020,
  "frameSize": { "width": 32, "height": 32 },
  "animations": {
    "idle": [{ "x": 0, "y": 0, "w": 32, "h": 32, "durationMs": 180 }],
    "walk": [{ "x": 0, "y": 32, "w": 32, "h": 32, "durationMs": 120 }]
  }
}
```

## Quality Gate

A mon asset is publishable only if:

1. All required animations exist.
2. JSON references only in-bounds frames.
3. Palette and silhouette stay consistent across animations.
