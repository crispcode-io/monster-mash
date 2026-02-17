import { describe, expect, it } from "vitest";
import { MockWorldOrchestratorClient } from "@/lib/orchestrator/mock-orchestrator-client";

describe("mock world orchestrator client", () => {
  it("returns directive on player_enter_chunk events", async () => {
    const client = new MockWorldOrchestratorClient();
    const ack = await client.publishEvent({
      eventId: "event-1",
      worldId: "world-1",
      worldSeed: "seed-1",
      playerId: "player-1",
      type: "player_enter_chunk",
      occurredAt: "2026-02-15T00:00:00.000Z",
      payload: { chunkX: 2, chunkZ: 3 },
    });

    expect(ack.accepted).toBe(true);
    expect(ack.directives.length).toBe(1);
    expect(ack.directives[0]?.type).toBe("world_state_flag_set");
  });
});
