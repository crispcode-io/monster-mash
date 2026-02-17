import type { ChunkMeshBuffers } from "@/lib/wasm/mm-core-bridge";
import type {
  MeshWorkerRequest,
  MeshWorkerResponse,
} from "@/lib/wasm/mm-core-mesh-worker-protocol";

interface PendingRequest {
  resolve(value: ChunkMeshBuffers): void;
  reject(reason?: unknown): void;
}

export class MmCoreMeshWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;

  constructor() {
    this.worker = new Worker(
      new URL("./mm-core-mesh-worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.addEventListener("message", (event: MessageEvent<MeshWorkerResponse>) => {
      this.onMessage(event.data);
    });
    this.worker.addEventListener("error", (event) => {
      const error = event.error ?? new Error(event.message);
      this.rejectAll(error);
    });
    this.worker.addEventListener("messageerror", () => {
      this.rejectAll(new Error("MM core mesh worker message error."));
    });
  }

  extract(
    width: number,
    height: number,
    depth: number,
    occupancy: Uint8Array,
  ): Promise<ChunkMeshBuffers> {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const request: MeshWorkerRequest = {
      kind: "extract",
      requestId,
      width,
      height,
      depth,
      occupancy: occupancy.slice(),
    };

    return new Promise<ChunkMeshBuffers>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  dispose(): void {
    this.rejectAll(new Error("MM core mesh worker disposed."));
    this.worker.terminate();
  }

  private onMessage(message: MeshWorkerResponse): void {
    if (!message || message.kind !== "extract-result") {
      return;
    }

    const pending = this.pending.get(message.requestId);
    if (!pending) {
      return;
    }
    this.pending.delete(message.requestId);

    if (!message.ok) {
      pending.reject(new Error(message.error));
      return;
    }

    pending.resolve({
      quads: message.quads,
      vertices: message.vertices,
      indexCount: message.indexCount,
      positions: new Float32Array(message.positions),
      normals: new Float32Array(message.normals),
      uvs: new Float32Array(message.uvs),
      indices: new Uint32Array(message.indices),
    });
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
