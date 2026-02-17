import { WORLD_CONFIG } from "@/lib/game-contracts";

export type VoxelBlockType = "grass" | "dirt" | "stone" | "path" | "wood";

export interface VoxelChunkData {
  chunkX: number;
  chunkZ: number;
  worldSeed: string;
  blockSize: number;
  gridSize: number;
  maxHeight: number;
  blocks: Map<string, VoxelBlockType>;
}

export interface VoxelBlockPosition {
  x: number;
  y: number;
  z: number;
}

export interface ChunkOccupancyBuffer {
  width: number;
  height: number;
  depth: number;
  occupancy: Uint8Array;
}

export interface VoxelPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface VoxelSurfaceHitResolution {
  breakPosition: VoxelBlockPosition;
  placePosition: VoxelBlockPosition;
  normal: VoxelBlockPosition;
}

interface VoxelChunkOptions {
  blockSize?: number;
  maxHeight?: number;
}

const DEFAULT_BLOCK_SIZE = 2;
const DEFAULT_MAX_HEIGHT = 8;

function blockKey(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

export function createVoxelChunkData(
  chunkX: number,
  chunkZ: number,
  worldSeed: string,
  options: VoxelChunkOptions = {},
): VoxelChunkData {
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const gridSize = Math.max(4, Math.floor(WORLD_CONFIG.chunkSize / blockSize));
  const blocks = new Map<string, VoxelBlockType>();

  const baseGlobalX = chunkX * gridSize;
  const baseGlobalZ = chunkZ * gridSize;

  for (let x = 0; x < gridSize; x += 1) {
    for (let z = 0; z < gridSize; z += 1) {
      const worldX = baseGlobalX + x;
      const worldZ = baseGlobalZ + z;
      const noise = layeredNoise(worldX, worldZ, worldSeed);
      const ridge = ridgeNoise(worldX, worldZ, worldSeed);
      const height = 2 + Math.floor((noise * 0.72 + ridge * 0.28) * maxHeight);
      const path = isPathCell(worldX, worldZ);

      blocks.set(blockKey(x, 0, z), "stone");
      if (height > 2) {
        blocks.set(blockKey(x, Math.floor(height * 0.5), z), "stone");
      }
      if (height > 1) {
        blocks.set(blockKey(x, height - 1, z), path ? "dirt" : "dirt");
      }
      blocks.set(blockKey(x, height, z), path ? "path" : "grass");
    }
  }

  return {
    chunkX,
    chunkZ,
    worldSeed,
    blockSize,
    gridSize,
    maxHeight,
    blocks,
  };
}

export function listVoxelBlocks(
  chunk: VoxelChunkData,
): Array<VoxelBlockPosition & { type: VoxelBlockType }> {
  const entries: Array<VoxelBlockPosition & { type: VoxelBlockType }> = [];
  for (const [key, type] of chunk.blocks.entries()) {
    const [x, y, z] = key.split(":").map(Number);
    entries.push({ x, y, z, type });
  }
  entries.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  return entries;
}

export function buildChunkOccupancyBuffer(chunk: VoxelChunkData): ChunkOccupancyBuffer {
  const width = chunk.gridSize;
  const depth = chunk.gridSize;
  const height = chunk.maxHeight + 5;
  const occupancy = new Uint8Array(width * height * depth);

  for (const key of chunk.blocks.keys()) {
    const [x, y, z] = key.split(":").map(Number);
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) {
      continue;
    }
    const index = (y * depth * width) + (z * width) + x;
    occupancy[index] = 1;
  }

  return {
    width,
    height,
    depth,
    occupancy,
  };
}

export function hasVoxelBlock(chunk: VoxelChunkData, position: VoxelBlockPosition): boolean {
  return chunk.blocks.has(blockKey(position.x, position.y, position.z));
}

export function setVoxelBlock(
  chunk: VoxelChunkData,
  position: VoxelBlockPosition,
  type: VoxelBlockType,
): void {
  if (!isValidPosition(chunk, position)) {
    return;
  }
  chunk.blocks.set(blockKey(position.x, position.y, position.z), type);
}

export function removeVoxelBlock(chunk: VoxelChunkData, position: VoxelBlockPosition): boolean {
  return chunk.blocks.delete(blockKey(position.x, position.y, position.z));
}

export function localVoxelToChunkSpace(
  chunk: VoxelChunkData,
  position: VoxelBlockPosition,
): { x: number; y: number; z: number } {
  const half = WORLD_CONFIG.chunkSize * 0.5;
  return {
    x: (-half + chunk.blockSize * 0.5) + (position.x * chunk.blockSize),
    y: (position.y * chunk.blockSize) + (chunk.blockSize * 0.5),
    z: (-half + chunk.blockSize * 0.5) + (position.z * chunk.blockSize),
  };
}

export function chunkSpaceToLocalVoxel(
  chunk: VoxelChunkData,
  chunkSpace: { x: number; y: number; z: number },
): VoxelBlockPosition {
  const half = WORLD_CONFIG.chunkSize * 0.5;
  return {
    x: Math.floor((chunkSpace.x + half) / chunk.blockSize),
    y: Math.floor(chunkSpace.y / chunk.blockSize),
    z: Math.floor((chunkSpace.z + half) / chunk.blockSize),
  };
}

export function worldPointToLocalVoxel(
  chunk: VoxelChunkData,
  chunkX: number,
  chunkZ: number,
  worldPoint: VoxelPoint3,
): VoxelBlockPosition {
  const half = WORLD_CONFIG.chunkSize * 0.5;
  const chunkOriginX = chunkX * WORLD_CONFIG.chunkSize;
  const chunkOriginZ = chunkZ * WORLD_CONFIG.chunkSize;
  const chunkSpace = {
    x: worldPoint.x - chunkOriginX,
    y: worldPoint.y,
    z: worldPoint.z - chunkOriginZ,
  };

  return {
    x: Math.floor((chunkSpace.x + half) / chunk.blockSize),
    y: Math.floor(chunkSpace.y / chunk.blockSize),
    z: Math.floor((chunkSpace.z + half) / chunk.blockSize),
  };
}

export function resolveVoxelSurfaceHit(
  chunk: VoxelChunkData,
  chunkX: number,
  chunkZ: number,
  hitPoint: VoxelPoint3,
  hitNormal: VoxelPoint3,
): VoxelSurfaceHitResolution | null {
  const normal = dominantAxisNormal(hitNormal);
  const epsilon = Math.max(0.01, chunk.blockSize * 0.02);
  const breakProbe = {
    x: hitPoint.x - (normal.x * epsilon),
    y: hitPoint.y - (normal.y * epsilon),
    z: hitPoint.z - (normal.z * epsilon),
  };
  const placeProbe = {
    x: hitPoint.x + (normal.x * epsilon),
    y: hitPoint.y + (normal.y * epsilon),
    z: hitPoint.z + (normal.z * epsilon),
  };

  const breakPosition = worldPointToLocalVoxel(chunk, chunkX, chunkZ, breakProbe);
  let placePosition = worldPointToLocalVoxel(chunk, chunkX, chunkZ, placeProbe);
  if (
    placePosition.x === breakPosition.x &&
    placePosition.y === breakPosition.y &&
    placePosition.z === breakPosition.z
  ) {
    placePosition = {
      x: breakPosition.x + normal.x,
      y: breakPosition.y + normal.y,
      z: breakPosition.z + normal.z,
    };
  }

  if (!isValidPosition(chunk, breakPosition) && !isValidPosition(chunk, placePosition)) {
    return null;
  }

  return {
    breakPosition,
    placePosition,
    normal,
  };
}

export function isValidPosition(chunk: VoxelChunkData, position: VoxelBlockPosition): boolean {
  return (
    position.x >= 0 &&
    position.z >= 0 &&
    position.x < chunk.gridSize &&
    position.z < chunk.gridSize &&
    position.y >= 0 &&
    position.y <= chunk.maxHeight + 4
  );
}

export function blockTypeColor(type: VoxelBlockType): string {
  if (type === "grass") {
    return "#67ad4f";
  }
  if (type === "dirt") {
    return "#8f623e";
  }
  if (type === "stone") {
    return "#6d7179";
  }
  if (type === "path") {
    return "#b9a87a";
  }
  return "#7e5f3f";
}

function isPathCell(globalX: number, globalZ: number): boolean {
  const bend = Math.sin((globalZ + 17) * 0.08) * 2.1;
  const laneCenter = 12 + bend;
  const mainPath = Math.abs((globalX % 33) - laneCenter) <= 0.8;
  const crossRoad = Math.abs((globalZ % 41) - 19) <= 0.8;
  return mainPath || crossRoad;
}

function layeredNoise(x: number, z: number, seed: string): number {
  const seedN = seedHash(seed);
  const coarse = Math.sin((x + seedN) * 0.18 + (z - seedN) * 0.11) * 0.5 + 0.5;
  const detail = Math.sin((x - seedN) * 0.59 - (z + seedN) * 0.37) * 0.5 + 0.5;
  return (coarse * 0.68) + (detail * 0.32);
}

function ridgeNoise(x: number, z: number, seed: string): number {
  const seedN = seedHash(seed) * 0.5;
  const ridge = Math.abs(Math.sin((x + seedN) * 0.046) * Math.cos((z - seedN) * 0.053));
  return ridge;
}

function seedHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1024;
}

function dominantAxisNormal(input: VoxelPoint3): VoxelBlockPosition {
  const absX = Math.abs(input.x);
  const absY = Math.abs(input.y);
  const absZ = Math.abs(input.z);

  if (absX >= absY && absX >= absZ) {
    return {
      x: input.x >= 0 ? 1 : -1,
      y: 0,
      z: 0,
    };
  }

  if (absY >= absX && absY >= absZ) {
    return {
      x: 0,
      y: input.y >= 0 ? 1 : -1,
      z: 0,
    };
  }

  return {
    x: 0,
    y: 0,
    z: input.z >= 0 ? 1 : -1,
  };
}
