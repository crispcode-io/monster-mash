import { WORLD_CONFIG } from "@/lib/game-contracts";

export const DEFAULT_TERRAIN_MAX_HEIGHT = 8;

export interface TerrainSample {
  height: number;
  heightIndex: number;
  moisture: number;
  ridge: number;
  path: boolean;
  pathMask: number;
}

export function sampleTerrain(
  cellX: number,
  cellZ: number,
  worldSeed: string,
  maxHeight: number = DEFAULT_TERRAIN_MAX_HEIGHT,
): TerrainSample {
  const seed = getSeedHash(worldSeed);
  const base = fbmNoise(cellX * 0.06, cellZ * 0.06, seed, 4, 0.5, 2.0);
  const ridge = ridgeNoise(cellX * 0.11, cellZ * 0.11, seed);
  const slope = fbmNoise(cellX * 0.02 - 11, cellZ * 0.02 + 7, seed, 2, 0.55, 2.0);
  const pathMask = resolvePathMask(cellX, cellZ);

  let height = 2 + ((base * 0.62) + (ridge * 0.22) + (slope * 0.16)) * maxHeight;
  height -= pathMask * 1.25;
  height = Math.max(1, height);

  const moisture = fbmNoise(cellX * 0.08 + 17, cellZ * 0.05 - 9, seed, 3, 0.5, 2.0);
  const heightIndex = clampInt(Math.floor(height), 1, maxHeight);
  const path = pathMask > 0.45;

  return {
    height,
    heightIndex,
    moisture,
    ridge,
    path,
    pathMask,
  };
}

export function sampleTerrainAtWorld(
  worldX: number,
  worldZ: number,
  worldSeed: string,
  maxHeight: number,
  blockSize: number,
): TerrainSample {
  const cell = worldToTerrainCell(worldX, worldZ, blockSize);
  return sampleTerrain(cell.x, cell.z, worldSeed, maxHeight);
}

export function worldToTerrainCell(
  worldX: number,
  worldZ: number,
  blockSize: number,
): { x: number; z: number } {
  const half = WORLD_CONFIG.chunkSize * 0.5;
  return {
    x: (worldX + half - (blockSize * 0.5)) / blockSize,
    z: (worldZ + half - (blockSize * 0.5)) / blockSize,
  };
}

const seedCache = new Map<string, number>();

function getSeedHash(worldSeed: string): number {
  const cached = seedCache.get(worldSeed);
  if (cached !== undefined) {
    return cached;
  }
  let hash = 2166136261;
  for (let index = 0; index < worldSeed.length; index += 1) {
    hash ^= worldSeed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const seeded = hash >>> 0;
  seedCache.set(worldSeed, seeded);
  return seeded;
}

function fbmNoise(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let amplitude = 0.5;
  let frequency = 1;
  let value = 0;
  let max = 0;

  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * valueNoise(x * frequency, z * frequency, seed);
    max += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return max > 0 ? value / max : 0;
}

function ridgeNoise(x: number, z: number, seed: number): number {
  const base = valueNoise(x, z, seed);
  return 1 - Math.abs(base * 2 - 1);
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const sx = smoothStep(x - x0);
  const sz = smoothStep(z - z0);

  const n00 = hash2d(x0, z0, seed);
  const n10 = hash2d(x1, z0, seed);
  const n01 = hash2d(x0, z1, seed);
  const n11 = hash2d(x1, z1, seed);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sz);
}

function hash2d(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >> 13), 1274126177);
  h ^= h >> 16;
  return (h >>> 0) / 4294967295;
}

function resolvePathMask(cellX: number, cellZ: number): number {
  const laneBend = Math.sin((cellZ + 18) * 0.09) * 2.4;
  const laneCenter = 8 + laneBend;
  const laneOffset = Math.abs(mod(cellX, 16) - laneCenter);
  const laneMask = smoothFalloff(laneOffset, 0.4, 2.2);

  const crossOffset = Math.abs(mod(cellZ, 29) - 12);
  const crossMask = smoothFalloff(crossOffset, 0.45, 2.1);

  return Math.max(laneMask, crossMask);
}

function smoothFalloff(distance: number, inner: number, outer: number): number {
  if (distance <= inner) {
    return 1;
  }
  if (distance >= outer) {
    return 0;
  }
  const t = (distance - inner) / (outer - inner);
  return 1 - smoothStep(t);
}

function smoothStep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
