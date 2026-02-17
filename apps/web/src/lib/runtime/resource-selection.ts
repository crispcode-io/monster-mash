import { DEFAULT_RUNTIME_RESOURCE_IDS } from "@/lib/runtime/protocol";

export function clampRuntimeResourceIndex(index: number): number {
  if (DEFAULT_RUNTIME_RESOURCE_IDS.length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, DEFAULT_RUNTIME_RESOURCE_IDS.length - 1));
}

export function cycleRuntimeResourceIndex(currentIndex: number, direction: -1 | 1): number {
  if (DEFAULT_RUNTIME_RESOURCE_IDS.length <= 0) {
    return 0;
  }
  const normalized = clampRuntimeResourceIndex(currentIndex);
  return (normalized + direction + DEFAULT_RUNTIME_RESOURCE_IDS.length) % DEFAULT_RUNTIME_RESOURCE_IDS.length;
}

export function resolveRuntimeResourceId(index: number): string {
  return (
    DEFAULT_RUNTIME_RESOURCE_IDS[clampRuntimeResourceIndex(index)] ?? DEFAULT_RUNTIME_RESOURCE_IDS[0] ?? "salvage"
  );
}

export function formatRuntimeResourceLabel(resourceId: string): string {
  return resourceId
    .split("_")
    .map((part) => (part.length > 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part))
    .join(" ");
}
