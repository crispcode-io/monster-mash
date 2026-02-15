export interface MeshStats {
  quads: number;
  vertices: number;
  indices: number;
}

export type MmCoreRuntimeMode = "fallback-js" | "wasm";

interface MmCoreRuntime {
  mode: MmCoreRuntimeMode;
  apiVersion(): number;
  meshStatsFromBlockCount(blockCount: number): MeshStats;
  meshStatsFromOccupancy(width: number, height: number, depth: number, occupancy: Uint8Array): MeshStats;
}

const fallbackRuntime: MmCoreRuntime = {
  mode: "fallback-js",
  apiVersion: () => 1,
  meshStatsFromBlockCount: (blockCount: number) => {
    const count = clampNonNegativeInteger(blockCount);
    const quads = count * 6;
    return statsFromQuads(quads);
  },
  meshStatsFromOccupancy: (width: number, height: number, depth: number, occupancy: Uint8Array) => {
    const quads = countExposedQuadsFallback(width, height, depth, occupancy);
    return statsFromQuads(quads);
  },
};

let runtime: MmCoreRuntime = fallbackRuntime;

export async function initializeMmCoreRuntime(): Promise<MmCoreRuntimeMode> {
  const wasmRuntime = await tryInitializeWasmRuntime();
  runtime = wasmRuntime ?? fallbackRuntime;
  return runtime.mode;
}

export function getMmCoreApiVersion(): number {
  return runtime.apiVersion();
}

export function getChunkMeshStats(blockCount: number): MeshStats {
  return runtime.meshStatsFromBlockCount(blockCount);
}

export function getChunkMeshStatsFromOccupancy(
  width: number,
  height: number,
  depth: number,
  occupancy: Uint8Array,
): MeshStats {
  return runtime.meshStatsFromOccupancy(width, height, depth, occupancy);
}

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function statsFromQuads(quads: number): MeshStats {
  return {
    quads,
    vertices: quads * 4,
    indices: quads * 6,
  };
}

function countExposedQuadsFallback(
  width: number,
  height: number,
  depth: number,
  occupancy: Uint8Array,
): number {
  const w = clampNonNegativeInteger(width);
  const h = clampNonNegativeInteger(height);
  const d = clampNonNegativeInteger(depth);
  if (w === 0 || h === 0 || d === 0) {
    return 0;
  }

  let quads = 0;
  for (let y = 0; y < h; y += 1) {
    for (let z = 0; z < d; z += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!isOccupied(occupancy, w, h, d, x, y, z)) {
          continue;
        }
        if (!isOccupied(occupancy, w, h, d, x - 1, y, z)) {
          quads += 1;
        }
        if (!isOccupied(occupancy, w, h, d, x + 1, y, z)) {
          quads += 1;
        }
        if (!isOccupied(occupancy, w, h, d, x, y - 1, z)) {
          quads += 1;
        }
        if (!isOccupied(occupancy, w, h, d, x, y + 1, z)) {
          quads += 1;
        }
        if (!isOccupied(occupancy, w, h, d, x, y, z - 1)) {
          quads += 1;
        }
        if (!isOccupied(occupancy, w, h, d, x, y, z + 1)) {
          quads += 1;
        }
      }
    }
  }

  return quads;
}

function isOccupied(
  occupancy: Uint8Array,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) {
    return false;
  }
  const index = (y * depth * width) + (z * width) + x;
  return index >= 0 && index < occupancy.length && occupancy[index] !== 0;
}

async function tryInitializeWasmRuntime(): Promise<MmCoreRuntime | null> {
  if (typeof WebAssembly === "undefined") {
    return null;
  }

  try {
    const response = await fetch("/wasm/mm_core_rs.wasm", { cache: "no-cache" });
    if (!response.ok) {
      return null;
    }

    const instantiated = await instantiate(response);
    const exports = instantiated.instance.exports as Partial<MmCoreExports>;
    if (
      typeof exports.mm_core_api_version !== "function" ||
      typeof exports.mm_mesh_stats_quads !== "function" ||
      typeof exports.mm_mesh_stats_vertices !== "function" ||
      typeof exports.mm_mesh_stats_indices !== "function" ||
      typeof exports.mm_alloc !== "function" ||
      typeof exports.mm_free !== "function" ||
      typeof exports.mm_mesh_exposed_quads !== "function" ||
      !(exports.memory instanceof WebAssembly.Memory)
    ) {
      return null;
    }

    const core = exports as MmCoreExports;

    return {
      mode: "wasm",
      apiVersion: () => toUnsigned(core.mm_core_api_version()),
      meshStatsFromBlockCount: (blockCount: number) => {
        const count = clampNonNegativeInteger(blockCount);
        return {
          quads: toUnsigned(core.mm_mesh_stats_quads(count)),
          vertices: toUnsigned(core.mm_mesh_stats_vertices(count)),
          indices: toUnsigned(core.mm_mesh_stats_indices(count)),
        };
      },
      meshStatsFromOccupancy: (width: number, height: number, depth: number, occupancy: Uint8Array) => {
        const w = clampNonNegativeInteger(width);
        const h = clampNonNegativeInteger(height);
        const d = clampNonNegativeInteger(depth);
        if (w === 0 || h === 0 || d === 0 || occupancy.length === 0) {
          return statsFromQuads(0);
        }

        const length = occupancy.length;
        const pointer = core.mm_alloc(length);
        if (!pointer) {
          return statsFromQuads(countExposedQuadsFallback(w, h, d, occupancy));
        }

        try {
          const wasmBytes = new Uint8Array(core.memory.buffer, pointer, length);
          wasmBytes.set(occupancy);
          const quads = toUnsigned(core.mm_mesh_exposed_quads(w, h, d, pointer, length));
          return statsFromQuads(quads);
        } finally {
          core.mm_free(pointer, length);
        }
      },
    };
  } catch {
    return null;
  }
}

async function instantiate(response: Response): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  if (typeof WebAssembly.instantiateStreaming === "function") {
    try {
      return await WebAssembly.instantiateStreaming(response, {});
    } catch {
      // Fall back to arrayBuffer path for servers without wasm content-type.
    }
  }

  const bytes = await response.arrayBuffer();
  return WebAssembly.instantiate(bytes, {});
}

function toUnsigned(value: number): number {
  return value >>> 0;
}

interface MmCoreExports {
  memory: WebAssembly.Memory;
  mm_core_api_version(): number;
  mm_alloc(size: number): number;
  mm_free(ptr: number, size: number): void;
  mm_mesh_stats_quads(blockCount: number): number;
  mm_mesh_stats_vertices(blockCount: number): number;
  mm_mesh_stats_indices(blockCount: number): number;
  mm_mesh_exposed_quads(width: number, height: number, depth: number, occupancyPtr: number, occupancyLen: number): number;
}
