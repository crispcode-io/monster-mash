import { describe, expect, it } from "vitest";
import { AuthoritativeWorldSim } from "@/lib/runtime/authoritative-sim";

describe("AuthoritativeWorldSim", () => {
  it("moves player deterministically for identical input sequences", () => {
    const simA = new AuthoritativeWorldSim("seed-1");
    const simB = new AuthoritativeWorldSim("seed-1");

    simA.joinPlayer({ worldSeed: "seed-1", playerId: "p1", startX: 0, startZ: 0 });
    simB.joinPlayer({ worldSeed: "seed-1", playerId: "p1", startX: 0, startZ: 0 });

    for (let tick = 0; tick < 120; tick += 1) {
      const movingForward = tick < 80;
      const movingRight = tick >= 40 && tick < 100;
      const running = tick >= 60;

      const moveX = movingRight ? 1 : 0;
      const moveZ = movingForward ? -1 : 0;

      simA.setInput("p1", { moveX, moveZ, running });
      simB.setInput("p1", { moveX, moveZ, running });

      simA.advanceOneTick();
      simB.advanceOneTick();
    }

    const a = simA.snapshot().players.p1;
    const b = simB.snapshot().players.p1;

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.x).toBeCloseTo(b?.x ?? 0, 8);
    expect(a?.z).toBeCloseTo(b?.z ?? 0, 8);
  });

  it("applies run multiplier", () => {
    const simWalk = new AuthoritativeWorldSim("seed-2");
    const simRun = new AuthoritativeWorldSim("seed-2");

    simWalk.joinPlayer({ worldSeed: "seed-2", playerId: "p1", startX: 0, startZ: 0 });
    simRun.joinPlayer({ worldSeed: "seed-2", playerId: "p1", startX: 0, startZ: 0 });

    for (let i = 0; i < 20; i += 1) {
      simWalk.setInput("p1", { moveX: 1, moveZ: 0, running: false });
      simRun.setInput("p1", { moveX: 1, moveZ: 0, running: true });
      simWalk.advanceOneTick();
      simRun.advanceOneTick();
    }

    const walkX = simWalk.snapshot().players.p1?.x ?? 0;
    const runX = simRun.snapshot().players.p1?.x ?? 0;

    expect(runX).toBeGreaterThan(walkX);
  });
});
