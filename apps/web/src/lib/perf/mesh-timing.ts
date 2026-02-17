export interface ChunkMeshTimingStats {
  samples: number;
  extractTotalMs: number;
  uploadTotalMs: number;
  lastExtractMs: number;
  lastUploadMs: number;
}

export interface MeshTimingTracker {
  sampleLimit: number;
  extractSamples: number[];
  uploadSamples: number[];
  chunkTimings: Map<string, ChunkMeshTimingStats>;
}

export interface MeshTimingRollup {
  extractAvgMs: number;
  uploadAvgMs: number;
  extractP95Ms: number;
  uploadP95Ms: number;
  trackedChunks: number;
}

export interface MeshTimingAverages {
  extractAvgMs: number;
  uploadAvgMs: number;
}

const DEFAULT_SAMPLE_LIMIT = 120;

export function createMeshTimingTracker(sampleLimit = DEFAULT_SAMPLE_LIMIT): MeshTimingTracker {
  return {
    sampleLimit: Math.max(1, sampleLimit),
    extractSamples: [],
    uploadSamples: [],
    chunkTimings: new Map<string, ChunkMeshTimingStats>(),
  };
}

export function recordMeshTiming(
  tracker: MeshTimingTracker,
  chunkKey: string,
  extractMs: number,
  uploadMs: number,
): MeshTimingRollup {
  pushSample(tracker.extractSamples, sanitizeSample(extractMs), tracker.sampleLimit);
  pushSample(tracker.uploadSamples, sanitizeSample(uploadMs), tracker.sampleLimit);

  const timing = tracker.chunkTimings.get(chunkKey) ?? {
    samples: 0,
    extractTotalMs: 0,
    uploadTotalMs: 0,
    lastExtractMs: 0,
    lastUploadMs: 0,
  };
  timing.samples += 1;
  timing.extractTotalMs += extractMs;
  timing.uploadTotalMs += uploadMs;
  timing.lastExtractMs = extractMs;
  timing.lastUploadMs = uploadMs;
  tracker.chunkTimings.set(chunkKey, timing);

  return {
    extractAvgMs: average(tracker.extractSamples),
    uploadAvgMs: average(tracker.uploadSamples),
    extractP95Ms: percentile(tracker.extractSamples, 0.95),
    uploadP95Ms: percentile(tracker.uploadSamples, 0.95),
    trackedChunks: tracker.chunkTimings.size,
  };
}

export function getChunkMeshTimingAverages(tracker: MeshTimingTracker, chunkKey: string): MeshTimingAverages {
  const timing = tracker.chunkTimings.get(chunkKey);
  if (!timing || timing.samples <= 0) {
    return {
      extractAvgMs: 0,
      uploadAvgMs: 0,
    };
  }

  return {
    extractAvgMs: timing.extractTotalMs / timing.samples,
    uploadAvgMs: timing.uploadTotalMs / timing.samples,
  };
}

export function percentile(samples: number[], pct: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const boundedPct = Math.max(0, Math.min(1, pct));
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * boundedPct) - 1));
  return sorted[index];
}

function pushSample(samples: number[], value: number, sampleLimit: number): void {
  samples.push(value);
  if (samples.length > sampleLimit) {
    samples.splice(0, samples.length - sampleLimit);
  }
}

function average(samples: number[]): number {
  if (samples.length === 0) {
    return 0;
  }
  let total = 0;
  for (const sample of samples) {
    total += sample;
  }
  return total / samples.length;
}

function sanitizeSample(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
