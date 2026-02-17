export interface MeshWorkerExtractRequest {
  kind: "extract";
  requestId: number;
  width: number;
  height: number;
  depth: number;
  occupancy: Uint8Array;
}

export interface MeshWorkerExtractSuccess {
  kind: "extract-result";
  requestId: number;
  ok: true;
  quads: number;
  vertices: number;
  indexCount: number;
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
  indices: ArrayBuffer;
}

export interface MeshWorkerExtractFailure {
  kind: "extract-result";
  requestId: number;
  ok: false;
  error: string;
}

export type MeshWorkerRequest = MeshWorkerExtractRequest;
export type MeshWorkerResponse = MeshWorkerExtractSuccess | MeshWorkerExtractFailure;
