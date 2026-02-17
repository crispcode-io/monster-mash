import {
  OrchestratorEventAck,
  WorldDirective,
  WorldEvent,
} from "@/lib/orchestrator/orchestrator-contracts";
import { WorldOrchestratorClient } from "@/lib/orchestrator/orchestrator-client";

export class MockWorldOrchestratorClient implements WorldOrchestratorClient {
  async publishEvent(event: WorldEvent): Promise<OrchestratorEventAck> {
    const directives: WorldDirective[] = [];

    if (event.type === "player_enter_chunk") {
      directives.push({
        directiveId: `directive:${event.eventId}`,
        type: "world_state_flag_set",
        priority: "normal",
        payload: {
          focus_chunk_x: event.payload.chunkX,
          focus_chunk_z: event.payload.chunkZ,
          reason: "player_frontier_progress",
        },
      });
    }

    return {
      accepted: true,
      directives,
    };
  }
}
