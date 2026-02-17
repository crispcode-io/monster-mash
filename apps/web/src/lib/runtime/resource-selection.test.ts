import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_RESOURCE_IDS } from "@/lib/runtime/protocol";
import {
  clampRuntimeResourceIndex,
  cycleRuntimeResourceIndex,
  formatRuntimeResourceLabel,
  resolveRuntimeResourceId,
} from "@/lib/runtime/resource-selection";

describe("resource selection", () => {
  it("clamps resource indexes to catalog bounds", () => {
    expect(clampRuntimeResourceIndex(-1)).toBe(0);
    expect(clampRuntimeResourceIndex(999)).toBe(DEFAULT_RUNTIME_RESOURCE_IDS.length - 1);
  });

  it("cycles resource indexes with wraparound", () => {
    expect(cycleRuntimeResourceIndex(0, -1)).toBe(DEFAULT_RUNTIME_RESOURCE_IDS.length - 1);
    expect(cycleRuntimeResourceIndex(DEFAULT_RUNTIME_RESOURCE_IDS.length - 1, 1)).toBe(0);
  });

  it("resolves and formats resource labels", () => {
    expect(resolveRuntimeResourceId(0)).toBe("salvage");
    expect(resolveRuntimeResourceId(999)).toBe(DEFAULT_RUNTIME_RESOURCE_IDS.at(-1));
    expect(formatRuntimeResourceLabel("iron_ore")).toBe("Iron Ore");
  });
});
