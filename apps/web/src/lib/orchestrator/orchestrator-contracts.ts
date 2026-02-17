export type WorldEventType =
  | "world_session_started"
  | "player_enter_chunk"
  | "npc_killed"
  | "quest_completed";

export interface WorldEvent {
  eventId: string;
  worldId: string;
  worldSeed: string;
  playerId: string;
  type: WorldEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export type WorldDirectiveType =
  | "spawn_rule_update"
  | "quest_arc_inject"
  | "npc_memory_patch"
  | "world_state_flag_set"
  | "asset_intent_enqueue";

export interface WorldDirective {
  directiveId: string;
  type: WorldDirectiveType;
  priority: "low" | "normal" | "high";
  payload: Record<string, unknown>;
}

export interface OrchestratorEventAck {
  accepted: boolean;
  directives: WorldDirective[];
}

interface ParseResult<T> {
  value: T | null;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseDirectiveType(value: unknown): WorldDirectiveType | null {
  const token = toString(value);
  if (
    token === "spawn_rule_update" ||
    token === "quest_arc_inject" ||
    token === "npc_memory_patch" ||
    token === "world_state_flag_set" ||
    token === "asset_intent_enqueue"
  ) {
    return token;
  }

  return null;
}

function parseDirective(value: unknown): WorldDirective | null {
  if (!isRecord(value)) {
    return null;
  }

  const directiveId = toString(value.directive_id);
  const type = parseDirectiveType(value.type);
  const priority = toString(value.priority);
  if (!directiveId || !type || (priority !== "low" && priority !== "normal" && priority !== "high")) {
    return null;
  }

  return {
    directiveId,
    type,
    priority,
    payload: isRecord(value.payload) ? value.payload : {},
  };
}

export function parseOrchestratorEventAck(payload: unknown): ParseResult<OrchestratorEventAck> {
  if (!isRecord(payload) || typeof payload.accepted !== "boolean" || !Array.isArray(payload.directives)) {
    return { value: null, error: "orchestrator ack payload missing required fields" };
  }

  const directives: WorldDirective[] = [];
  for (const entry of payload.directives) {
    const parsed = parseDirective(entry);
    if (!parsed) {
      return { value: null, error: "orchestrator ack payload contains invalid directives" };
    }
    directives.push(parsed);
  }

  return {
    value: {
      accepted: payload.accepted,
      directives,
    },
    error: null,
  };
}

export function toWorldEventPayload(event: WorldEvent): Record<string, unknown> {
  return {
    event_id: event.eventId,
    world_id: event.worldId,
    world_seed: event.worldSeed,
    player_id: event.playerId,
    type: event.type,
    occurred_at: event.occurredAt,
    payload: event.payload,
  };
}
