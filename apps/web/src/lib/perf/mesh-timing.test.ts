import { describe, expect, it } from "vitest";
import {
  createMeshTimingTracker,
  getChunkMeshTimingAverages,
  percentile,
  recordMeshTiming,
} from "@/lib/perf/mesh-timing";

describe("mesh-timing", () => {
  it("tracks capped samples and computes p95", () => {
    const tracker = createMeshTimingTracker(5);
    recordMeshTiming(tracker, "0:0", 1, 2);
    recordMeshTiming(tracker, "0:0", 3, 4);
    recordMeshTiming(tracker, "0:0", 5, 6);
    recordMeshTiming(tracker, "0:0", 7, 8);
    const rollup = recordMeshTiming(tracker, "0:0", 9, 10);
    recordMeshTiming(tracker, "0:0", 11, 12);

    expect(tracker.extractSamples).toEqual([3, 5, 7, 9, 11]);
    expect(tracker.uploadSamples).toEqual([4, 6, 8, 10, 12]);
    expect(rollup.extractP95Ms).toBe(9);
    expect(rollup.uploadP95Ms).toBe(10);
  });

  it("reports per-chunk averages and tracked chunk count", () => {
    const tracker = createMeshTimingTracker(50);
    recordMeshTiming(tracker, "0:0", 2, 3);
    recordMeshTiming(tracker, "1:0", 5, 7);
    const rollup = recordMeshTiming(tracker, "1:0", 9, 11);

    const chunkAverages = getChunkMeshTimingAverages(tracker, "1:0");
    expect(chunkAverages.extractAvgMs).toBe(7);
    expect(chunkAverages.uploadAvgMs).toBe(9);
    expect(rollup.trackedChunks).toBe(2);
  });

  it("returns zero averages for unknown chunks and empty sample percentile", () => {
    const tracker = createMeshTimingTracker();
    expect(getChunkMeshTimingAverages(tracker, "missing")).toEqual({
      extractAvgMs: 0,
      uploadAvgMs: 0,
    });
    expect(percentile([], 0.95)).toBe(0);
  });
});

