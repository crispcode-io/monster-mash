import { describe, expect, it } from "vitest";
import {
  buildChunkOccupancyBuffer,
  chunkSpaceToLocalVoxel,
  createVoxelChunkData,
  hasVoxelBlock,
  listVoxelBlocks,
  localVoxelToChunkSpace,
  removeVoxelBlock,
  resolveVoxelSurfaceHit,
  setVoxelBlock,
  worldPointToLocalVoxel,
} from "@/lib/voxel/voxel-world";

describe("voxel world", () => {
  it("generates deterministic chunk blocks", () => {
    const a = createVoxelChunkData(3, -2, "seed-123");
    const b = createVoxelChunkData(3, -2, "seed-123");

    expect(listVoxelBlocks(a)).toEqual(listVoxelBlocks(b));
  });

  it("supports block placement and removal", () => {
    const chunk = createVoxelChunkData(0, 0, "seed-abc");
    const position = { x: 1, y: 5, z: 1 };

    setVoxelBlock(chunk, position, "wood");
    expect(hasVoxelBlock(chunk, position)).toBe(true);

    expect(removeVoxelBlock(chunk, position)).toBe(true);
    expect(hasVoxelBlock(chunk, position)).toBe(false);
  });

  it("converts between local voxel and chunk-space coordinates", () => {
    const chunk = createVoxelChunkData(0, 0, "seed-xyz", { blockSize: 2 });
    const original = { x: 7, y: 4, z: 11 };

    const world = localVoxelToChunkSpace(chunk, original);
    const roundtrip = chunkSpaceToLocalVoxel(chunk, world);
    expect(roundtrip).toEqual(original);
  });

  it("builds chunk occupancy buffers for mesh generation", () => {
    const chunk = createVoxelChunkData(0, 0, "seed-occ", { maxHeight: 6 });
    setVoxelBlock(chunk, { x: 1, y: 2, z: 3 }, "wood");

    const buffer = buildChunkOccupancyBuffer(chunk);
    const index = (2 * buffer.depth * buffer.width) + (3 * buffer.width) + 1;
    expect(buffer.width).toBe(chunk.gridSize);
    expect(buffer.depth).toBe(chunk.gridSize);
    expect(buffer.height).toBe(chunk.maxHeight + 5);
    expect(buffer.occupancy[index]).toBe(1);
  });

  it("converts world points to local voxel positions", () => {
    const chunk = createVoxelChunkData(2, -1, "seed-world", { blockSize: 2 });
    const chunkSize = chunk.gridSize * chunk.blockSize;
    const original = { x: 3, y: 2, z: 4 };
    const chunkSpace = localVoxelToChunkSpace(chunk, original);
    const centerWorld = {
      x: (chunk.chunkX * chunkSize) + chunkSpace.x,
      y: chunkSpace.y,
      z: (chunk.chunkZ * chunkSize) + chunkSpace.z,
    };

    expect(worldPointToLocalVoxel(chunk, 2, -1, centerWorld)).toEqual({
      x: original.x,
      y: 2,
      z: original.z,
    });
  });

  it("resolves break/place positions from a surface hit", () => {
    const chunk = createVoxelChunkData(0, 0, "seed-hit", { blockSize: 2 });
    const hit = resolveVoxelSurfaceHit(
      chunk,
      0,
      0,
      { x: 0, y: 4, z: 0 },
      { x: 0.1, y: 0.9, z: 0.1 },
    );

    expect(hit).toBeTruthy();
    expect(hit?.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(hit?.breakPosition).toEqual({ x: 16, y: 1, z: 16 });
    expect(hit?.placePosition).toEqual({ x: 16, y: 2, z: 16 });
  });
});
