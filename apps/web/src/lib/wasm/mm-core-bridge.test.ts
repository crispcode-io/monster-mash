import { describe, expect, it } from "vitest";
import { getChunkMeshStats, getChunkMeshStatsFromOccupancy } from "@/lib/wasm/mm-core-bridge";

describe("mm core bridge", () => {
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
});
