/// <reference lib="webworker" />

import {
  getChunkMeshBuffersFromOccupancy,
  initializeMmCoreRuntime,
} from "@/lib/wasm/mm-core-bridge";
import type {
  MeshWorkerRequest,
  MeshWorkerResponse,
} from "@/lib/wasm/mm-core-mesh-worker-protocol";

let runtimeInitPromise: Promise<void> | null = null;

function ensureRuntime(): Promise<void> {
  if (!runtimeInitPromise) {
    runtimeInitPromise = initializeMmCoreRuntime().then(() => undefined);
  }
  return runtimeInitPromise;
}

self.addEventListener("message", async (event: MessageEvent<MeshWorkerRequest>) => {
  const message = event.data;
  if (!message || message.kind !== "extract") {
    return;
  }

  try {
    await ensureRuntime();
    const mesh = getChunkMeshBuffersFromOccupancy(
      message.width,
      message.height,
      message.depth,
      message.occupancy,
    );

    const response: MeshWorkerResponse = {
      kind: "extract-result",
      requestId: message.requestId,
      ok: true,
      quads: mesh.quads,
      vertices: mesh.vertices,
      indexCount: mesh.indexCount,
      positions: mesh.positions.buffer as ArrayBuffer,
      normals: mesh.normals.buffer as ArrayBuffer,
      uvs: mesh.uvs.buffer as ArrayBuffer,
      indices: mesh.indices.buffer as ArrayBuffer,
    };

    self.postMessage(response, [
      response.positions,
      response.normals,
      response.uvs,
      response.indices,
    ]);
  } catch (error) {
    const response: MeshWorkerResponse = {
      kind: "extract-result",
      requestId: message.requestId,
      ok: false,
      error: error instanceof Error ? `[mesh-worker] ${error.message}` : "[mesh-worker] mm-core extraction failed",
    };
    self.postMessage(response);
  }
});
