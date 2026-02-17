import { describe, expect, it } from "vitest";
import { createWorldInstance, createWorldSeed } from "@/lib/world/world-instance";

describe("world instance generation", () => {
  it("generates normalized seeds", () => {
    const seed = createWorldSeed("Eldergrove Valley");
    expect(seed.startsWith("eldergrove-valley-")).toBe(true);
    expect(seed.length).toBeGreaterThan("eldergrove-valley-".length);
  });

  it("falls back to default prefix for empty source", () => {
    const seed = createWorldSeed("   ");
    expect(seed.startsWith("frontier-")).toBe(true);
  });

  it("creates world instance with stable id shape", () => {
    const world = createWorldInstance("My Realm");
    expect(world.id.startsWith("world-")).toBe(true);
    expect(world.seed.length).toBeGreaterThan(8);
    expect(new Date(world.createdAt).toString()).not.toBe("Invalid Date");
  });
});
