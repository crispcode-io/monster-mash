export interface MeshStats {
  quads: number;
  vertices: number;
  indices: number;
}

export interface ChunkMeshBuffers {
  quads: number;
  vertices: number;
  indexCount: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export type MmCoreRuntimeMode = "fallback-js" | "wasm";

interface MmCoreRuntime {
  mode: MmCoreRuntimeMode;
  apiVersion(): number;
  meshStatsFromBlockCount(blockCount: number): MeshStats;
  meshStatsFromOccupancy(width: number, height: number, depth: number, occupancy: Uint8Array): MeshStats;
  meshBuffersFromOccupancy(width: number, height: number, depth: number, occupancy: Uint8Array): ChunkMeshBuffers;
}

interface FaceDefinition {
  normal: readonly [number, number, number];
  corners: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

const FACE_DEFINITIONS: readonly FaceDefinition[] = [
  {
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    normal: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
];

const FACE_NEIGHBOR_OFFSETS: readonly [number, number, number][] = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

const QUAD_UVS = [0, 0, 0, 1, 1, 1, 1, 0] as const;

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
  meshBuffersFromOccupancy: (width: number, height: number, depth: number, occupancy: Uint8Array) =>
    buildChunkMeshFallback(width, height, depth, occupancy),
};

let runtime: MmCoreRuntime | null = null;

export async function initializeMmCoreRuntime(): Promise<MmCoreRuntimeMode> {
  const wasmRuntime = await tryInitializeWasmRuntime();
  if (wasmRuntime) {
    runtime = wasmRuntime;
    return runtime.mode;
  }

  if (isFallbackAllowed()) {
    runtime = fallbackRuntime;
    return runtime.mode;
  }

  throw new Error(
    "MM core wasm runtime is required but failed to initialize. Build wasm and retry, or set NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK=true for explicit fallback mode.",
  );
}

export function resetMmCoreRuntimeForTests(): void {
  runtime = null;
}

function isFallbackAllowed(): boolean {
  return process.env.NEXT_PUBLIC_MM_CORE_ALLOW_FALLBACK === "true";
}

function requireRuntime(): MmCoreRuntime {
  if (!runtime) {
    throw new Error("MM core runtime is not initialized.");
  }
  return runtime;
}

export function getMmCoreApiVersion(): number {
  return requireRuntime().apiVersion();
}

export function getChunkMeshStats(blockCount: number): MeshStats {
  return requireRuntime().meshStatsFromBlockCount(blockCount);
}

export function getChunkMeshStatsFromOccupancy(
  width: number,
  height: number,
  depth: number,
  occupancy: Uint8Array,
): MeshStats {
  return requireRuntime().meshStatsFromOccupancy(width, height, depth, occupancy);
}

export function getChunkMeshBuffersFromOccupancy(
  width: number,
  height: number,
  depth: number,
  occupancy: Uint8Array,
): ChunkMeshBuffers {
  return requireRuntime().meshBuffersFromOccupancy(width, height, depth, occupancy);
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

function emptyChunkMeshBuffers(): ChunkMeshBuffers {
  return {
    quads: 0,
    vertices: 0,
    indexCount: 0,
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    indices: new Uint32Array(0),
  };
}

function buildChunkMeshFallback(
  width: number,
  height: number,
  depth: number,
  occupancy: Uint8Array,
): ChunkMeshBuffers {
  const w = clampNonNegativeInteger(width);
  const h = clampNonNegativeInteger(height);
  const d = clampNonNegativeInteger(depth);
  if (w === 0 || h === 0 || d === 0 || occupancy.length === 0) {
    return emptyChunkMeshBuffers();
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y < h; y += 1) {
    for (let z = 0; z < d; z += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!isOccupied(occupancy, w, h, d, x, y, z)) {
          continue;
        }

        for (let faceIndex = 0; faceIndex < FACE_DEFINITIONS.length; faceIndex += 1) {
          const [dx, dy, dz] = FACE_NEIGHBOR_OFFSETS[faceIndex];
          if (isOccupied(occupancy, w, h, d, x + dx, y + dy, z + dz)) {
            continue;
          }

          const baseVertex = positions.length / 3;
          const face = FACE_DEFINITIONS[faceIndex];
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
          }
          uvs.push(...QUAD_UVS);
          indices.push(baseVertex, baseVertex + 1, baseVertex + 2, baseVertex, baseVertex + 2, baseVertex + 3);
        }
      }
    }
  }

  return {
    quads: indices.length / 6,
    vertices: positions.length / 3,
    indexCount: indices.length,
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(indices),
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
    const response = await fetch(resolveWasmUrl(), { cache: "no-cache" });
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
      typeof exports.mm_mesh_extract_vertex_count !== "function" ||
      typeof exports.mm_mesh_extract_index_count !== "function" ||
      typeof exports.mm_mesh_extract_positions !== "function" ||
      typeof exports.mm_mesh_extract_normals !== "function" ||
      typeof exports.mm_mesh_extract_uvs !== "function" ||
      typeof exports.mm_mesh_extract_indices !== "function" ||
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
          throw new Error("MM core wasm allocation failed while computing chunk mesh stats.");
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
      meshBuffersFromOccupancy: (width: number, height: number, depth: number, occupancy: Uint8Array) => {
        const w = clampNonNegativeInteger(width);
        const h = clampNonNegativeInteger(height);
        const d = clampNonNegativeInteger(depth);
        if (w === 0 || h === 0 || d === 0 || occupancy.length === 0) {
          return emptyChunkMeshBuffers();
        }

        const occupancyLen = occupancy.length;
        const occupancyPtr = core.mm_alloc(occupancyLen);
        if (!occupancyPtr) {
          throw new Error("MM core wasm allocation failed for occupancy input.");
        }

        let positionsPtr = 0;
        let normalsPtr = 0;
        let uvsPtr = 0;
        let indicesPtr = 0;
        let positionsBytes = 0;
        let normalsBytes = 0;
        let uvsBytes = 0;
        let indicesBytes = 0;

        try {
          const wasmOccupancy = new Uint8Array(core.memory.buffer, occupancyPtr, occupancyLen);
          wasmOccupancy.set(occupancy);

          const vertexCount = toUnsigned(core.mm_mesh_extract_vertex_count(w, h, d, occupancyPtr, occupancyLen));
          const indexCount = toUnsigned(core.mm_mesh_extract_index_count(w, h, d, occupancyPtr, occupancyLen));
          if (vertexCount === 0 || indexCount === 0) {
            return emptyChunkMeshBuffers();
          }

          const positionsLen = vertexCount * 3;
          const normalsLen = vertexCount * 3;
          const uvsLen = vertexCount * 2;
          positionsBytes = positionsLen * Float32Array.BYTES_PER_ELEMENT;
          normalsBytes = normalsLen * Float32Array.BYTES_PER_ELEMENT;
          uvsBytes = uvsLen * Float32Array.BYTES_PER_ELEMENT;
          indicesBytes = indexCount * Uint32Array.BYTES_PER_ELEMENT;

          positionsPtr = core.mm_alloc(positionsBytes);
          normalsPtr = core.mm_alloc(normalsBytes);
          uvsPtr = core.mm_alloc(uvsBytes);
          indicesPtr = core.mm_alloc(indicesBytes);

          if (!positionsPtr || !normalsPtr || !uvsPtr || !indicesPtr) {
            throw new Error("MM core wasm allocation failed for output mesh buffers.");
          }

          const writtenPositions = toUnsigned(
            core.mm_mesh_extract_positions(w, h, d, occupancyPtr, occupancyLen, positionsPtr, positionsLen),
          );
          const writtenNormals = toUnsigned(
            core.mm_mesh_extract_normals(w, h, d, occupancyPtr, occupancyLen, normalsPtr, normalsLen),
          );
          const writtenUvs = toUnsigned(core.mm_mesh_extract_uvs(w, h, d, occupancyPtr, occupancyLen, uvsPtr, uvsLen));
          const writtenIndices = toUnsigned(
            core.mm_mesh_extract_indices(w, h, d, occupancyPtr, occupancyLen, indicesPtr, indexCount),
          );

          if (
            writtenPositions !== positionsLen ||
            writtenNormals !== normalsLen ||
            writtenUvs !== uvsLen ||
            writtenIndices !== indexCount
          ) {
            throw new Error("MM core wasm mesh extraction returned incomplete buffer data.");
          }

          const positions = new Float32Array(core.memory.buffer, positionsPtr, positionsLen).slice();
          const normals = new Float32Array(core.memory.buffer, normalsPtr, normalsLen).slice();
          const uvs = new Float32Array(core.memory.buffer, uvsPtr, uvsLen).slice();
          const indices = new Uint32Array(core.memory.buffer, indicesPtr, indexCount).slice();

          return {
            quads: Math.floor(indexCount / 6),
            vertices: vertexCount,
            indexCount,
            positions,
            normals,
            uvs,
            indices,
          };
        } finally {
          if (indicesPtr && indicesBytes) {
            core.mm_free(indicesPtr, indicesBytes);
          }
          if (uvsPtr && uvsBytes) {
            core.mm_free(uvsPtr, uvsBytes);
          }
          if (normalsPtr && normalsBytes) {
            core.mm_free(normalsPtr, normalsBytes);
          }
          if (positionsPtr && positionsBytes) {
            core.mm_free(positionsPtr, positionsBytes);
          }
          core.mm_free(occupancyPtr, occupancyLen);
        }
      },
    };
  } catch (error) {
    if (shouldLogInitError()) {
      console.error("[mm-core] wasm runtime initialization failed", error);
    }
    return null;
  }
}

async function instantiate(response: Response): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  if (typeof WebAssembly.instantiateStreaming === "function") {
    const fallbackResponse = response.clone();
    try {
      return await WebAssembly.instantiateStreaming(response, {});
    } catch {
      // Fall back to arrayBuffer path for servers without wasm content-type
      // or engines where instantiateStreaming cannot complete.
      const bytes = await fallbackResponse.arrayBuffer();
      return WebAssembly.instantiate(bytes, {});
    }
  }

  const bytes = await response.arrayBuffer();
  return WebAssembly.instantiate(bytes, {});
}

function toUnsigned(value: number): number {
  return value >>> 0;
}

function resolveWasmUrl(): string {
  const override = process.env.NEXT_PUBLIC_MM_CORE_WASM_URL;
  if (override) {
    return override;
  }

  if (typeof document !== "undefined" && document.baseURI) {
    return new URL("wasm/mm_core_rs.wasm", document.baseURI).toString();
  }

  if (typeof location !== "undefined") {
    if (location.protocol !== "blob:" && location.href) {
      return new URL("wasm/mm_core_rs.wasm", location.href).toString();
    }

    if (location.origin && location.origin !== "null") {
      return `${location.origin}/wasm/mm_core_rs.wasm`;
    }
  }

  return "http://localhost/wasm/mm_core_rs.wasm";
}

function shouldLogInitError(): boolean {
  return typeof location !== "undefined";
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
  mm_mesh_extract_vertex_count(
    width: number,
    height: number,
    depth: number,
    occupancyPtr: number,
    occupancyLen: number,
  ): number;
  mm_mesh_extract_index_count(
    width: number,
    height: number,
    depth: number,
    occupancyPtr: number,
    occupancyLen: number,
  ): number;
  mm_mesh_extract_positions(
    width: number,
    height: number,
    depth: number,
    occupancyPtr: number,
    occupancyLen: number,
    outPtr: number,
    outLen: number,
  ): number;
  mm_mesh_extract_normals(
    width: number,
    height: number,
    depth: number,
    occupancyPtr: number,
    occupancyLen: number,
    outPtr: number,
    outLen: number,
  ): number;
  mm_mesh_extract_uvs(
    width: number,
    height: number,
    depth: number,
    occupancyPtr: number,
    occupancyLen: number,
    outPtr: number,
    outLen: number,
  ): number;
  mm_mesh_extract_indices(
    width: number,
    height: number,
    depth: number,
    occupancyPtr: number,
    occupancyLen: number,
    outPtr: number,
    outLen: number,
  ): number;
}
