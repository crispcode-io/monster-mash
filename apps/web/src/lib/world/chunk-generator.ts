import { WORLD_CONFIG } from "@/lib/game-contracts";

export const CHUNK_GRID_CELLS = 16;

export type TerrainTileType = "path" | "water" | "flowers";
export type ChunkEntityType = "tree" | "rock" | "fence" | "npc" | "wild-mon";

export interface TerrainTile {
  type: TerrainTileType;
  x: number;
  z: number;
}

export interface ChunkEntity {
  type: ChunkEntityType;
  x: number;
  z: number;
  scale: number;
  rotation: number;
  variant: number;
}

export interface ChunkData {
  biomeTone: number;
  tileSize: number;
  terrainTiles: TerrainTile[];
  entities: ChunkEntity[];
}

export function generateChunkData(
  chunkX: number,
  chunkZ: number,
  worldSeed = WORLD_CONFIG.worldSeed,
): ChunkData {
  const rng = mulberry32(hashChunkSeed(chunkX, chunkZ, worldSeed));
  const biomeTone = rng();
  const tileSize = WORLD_CONFIG.chunkSize / CHUNK_GRID_CELLS;
  const terrainTiles: TerrainTile[] = [];
  const entities: ChunkEntity[] = [];
  const halfChunk = WORLD_CONFIG.chunkSize * 0.5;

  const baseGlobalCellX = chunkX * CHUNK_GRID_CELLS;
  const baseGlobalCellZ = chunkZ * CHUNK_GRID_CELLS;

  for (let cellX = 0; cellX < CHUNK_GRID_CELLS; cellX += 1) {
    for (let cellZ = 0; cellZ < CHUNK_GRID_CELLS; cellZ += 1) {
      const globalCellX = baseGlobalCellX + cellX;
      const globalCellZ = baseGlobalCellZ + cellZ;
      const localX = ((cellX + 0.5) * tileSize) - halfChunk;
      const localZ = ((cellZ + 0.5) * tileSize) - halfChunk;

      const path = isPathCell(globalCellX, globalCellZ);
      const moisture = layeredNoise(globalCellX, globalCellZ);

      if (path) {
        terrainTiles.push({ type: "path", x: localX, z: localZ });
      } else if (moisture > 0.78) {
        terrainTiles.push({ type: "water", x: localX, z: localZ });
      } else if (moisture > 0.55 && rng() > 0.76) {
        terrainTiles.push({ type: "flowers", x: localX, z: localZ });
      }

      if (!path && moisture <= 0.78) {
        const roll = rng();
        if (roll > 0.965) {
          entities.push({
            type: "wild-mon",
            x: localX + randomCellOffset(rng, tileSize),
            z: localZ + randomCellOffset(rng, tileSize),
            scale: 0.95 + (rng() * 0.22),
            rotation: 0,
            variant: Math.floor(rng() * 3),
          });
        } else if (roll > 0.935) {
          entities.push({
            type: "tree",
            x: localX + randomCellOffset(rng, tileSize * 0.75),
            z: localZ + randomCellOffset(rng, tileSize * 0.75),
            scale: 1 + (rng() * 0.4),
            rotation: 0,
            variant: Math.floor(rng() * 3),
          });
        } else if (roll > 0.91) {
          entities.push({
            type: "rock",
            x: localX + randomCellOffset(rng, tileSize * 0.65),
            z: localZ + randomCellOffset(rng, tileSize * 0.65),
            scale: 0.9 + (rng() * 0.45),
            rotation: 0,
            variant: Math.floor(rng() * 2),
          });
        }
      } else if (path && rng() > 0.985) {
        entities.push({
          type: "npc",
          x: localX,
          z: localZ,
          scale: 0.95 + (rng() * 0.15),
          rotation: 0,
          variant: Math.floor(rng() * 2),
        });
      }
    }
  }

  if (rng() > 0.54) {
    const fenceWidth = 3 + Math.floor(rng() * 3);
    const fenceHeight = 3 + Math.floor(rng() * 3);
    const startX = 1 + Math.floor(rng() * (CHUNK_GRID_CELLS - fenceWidth - 2));
    const startZ = 1 + Math.floor(rng() * (CHUNK_GRID_CELLS - fenceHeight - 2));

    for (let dx = 0; dx < fenceWidth; dx += 1) {
      addFenceEntity(entities, startX + dx, startZ, tileSize, halfChunk, Math.PI * 0.5);
      addFenceEntity(
        entities,
        startX + dx,
        startZ + fenceHeight,
        tileSize,
        halfChunk,
        Math.PI * 0.5,
      );
    }

    for (let dz = 1; dz < fenceHeight; dz += 1) {
      addFenceEntity(entities, startX, startZ + dz, tileSize, halfChunk, 0);
      addFenceEntity(
        entities,
        startX + fenceWidth,
        startZ + dz,
        tileSize,
        halfChunk,
        0,
      );
    }
  }

  return { biomeTone, tileSize, terrainTiles, entities };
}

function addFenceEntity(
  entities: ChunkEntity[],
  cellX: number,
  cellZ: number,
  tileSize: number,
  halfChunk: number,
  rotation: number,
): void {
  entities.push({
    type: "fence",
    x: ((cellX + 0.5) * tileSize) - halfChunk,
    z: ((cellZ + 0.5) * tileSize) - halfChunk,
    scale: 1,
    rotation,
    variant: 0,
  });
}

function randomCellOffset(rng: () => number, tileSize: number): number {
  return (rng() - 0.5) * tileSize * 0.68;
}

function isPathCell(globalCellX: number, globalCellZ: number): boolean {
  const bend = Math.sin((globalCellZ + 18) * 0.09) * 2.4;
  const laneCenter = 8 + bend;
  const vertical = Math.abs((globalCellX % CHUNK_GRID_CELLS) - laneCenter) <= 1.2;
  const crossRoad = Math.abs((globalCellZ % 29) - 12) <= 1.1;

  return vertical || crossRoad;
}

function layeredNoise(x: number, z: number): number {
  const coarse = Math.sin(x * 0.19 + z * 0.11) * 0.5 + 0.5;
  const detail = Math.sin(x * 0.63 - z * 0.53) * 0.5 + 0.5;
  return (coarse * 0.72) + (detail * 0.28);
}

function hashChunkSeed(chunkX: number, chunkZ: number, worldSeed: string): number {
  let hash = 2166136261;
  const payload = `${worldSeed}:${chunkX}:${chunkZ}`;

  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let temp = Math.imul(state ^ (state >>> 15), 1 | state);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}
