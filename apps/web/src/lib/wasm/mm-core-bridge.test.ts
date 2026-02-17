import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  getChunkMeshBuffersFromOccupancy,
  getChunkMeshStats,
  getChunkMeshStatsFromOccupancy,
  initializeMmCoreRuntime,
  resetMmCoreRuntimeForTests,
} from "@/lib/wasm/mm-core-bridge";

const fallbackEnvKey = "NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK";
const originalFallbackValue = process.env[fallbackEnvKey];

describe("mm core bridge", () => {
  beforeEach(async () => {
    process.env[fallbackEnvKey] = "true";
    resetMmCoreRuntimeForTests();
    await initializeMmCoreRuntime();
  });

  afterAll(() => {
    if (originalFallbackValue === undefined) {
      delete process.env[fallbackEnvKey];
      return;
    }
    process.env[fallbackEnvKey] = originalFallbackValue;
    resetMmCoreRuntimeForTests();
  });

  it("derives mesh stats from block counts", () => {
    const stats = getChunkMeshStats(2);
    expect(stats.quads).toBe(12);
    expect(stats.vertices).toBe(48);
    expect(stats.indices).toBe(72);
  });

  it("derives exposed-face stats from occupancy", () => {
    const oneBlock = new Uint8Array([1]);
    const oneBlockStats = getChunkMeshStatsFromOccupancy(1, 1, 1, oneBlock);
    expect(oneBlockStats.quads).toBe(6);

    const twoAdjacent = new Uint8Array([1, 1]);
    const twoAdjacentStats = getChunkMeshStatsFromOccupancy(2, 1, 1, twoAdjacent);
    expect(twoAdjacentStats.quads).toBe(10);
    expect(twoAdjacentStats.vertices).toBe(40);
    expect(twoAdjacentStats.indices).toBe(60);
  });

  it("extracts mesh buffers from occupancy", () => {
    const oneBlock = new Uint8Array([1]);
    const mesh = getChunkMeshBuffersFromOccupancy(1, 1, 1, oneBlock);

    expect(mesh.quads).toBe(6);
    expect(mesh.vertices).toBe(24);
    expect(mesh.indexCount).toBe(36);
    expect(mesh.positions.length).toBe(72);
    expect(mesh.normals.length).toBe(72);
    expect(mesh.uvs.length).toBe(48);
    expect(mesh.indices.length).toBe(36);
  });

  it("fails initialization when fallback is not explicitly enabled", async () => {
    process.env[fallbackEnvKey] = "false";
    resetMmCoreRuntimeForTests();

    await expect(initializeMmCoreRuntime()).rejects.toThrow("MM core wasm runtime is required");
  });
});
