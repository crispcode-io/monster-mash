import {
  RuntimeBlockActionRequest,
  RuntimeBlockDelta,
  RuntimeCombatActionRequest,
  RuntimeCombatActionKind,
  RuntimeCombatResult,
  RuntimeDirectiveState,
  RuntimeCraftRequest,
  RuntimeCraftResult,
  RuntimeContainerActionRequest,
  RuntimeContainerActionResult,
  RuntimeContainerState,
  RuntimeInventoryState,
  RuntimeHotbarState,
  RuntimeWorldFlagState,
  JoinRuntimeRequest,
  RuntimeInputState,
  RuntimeMode,
  WorldRuntimeClient,
  WorldRuntimeSnapshot,
} from "@/lib/runtime/protocol";

interface WsRuntimeClientConfig {
  worldSeed: string;
  url: string;
  reconnectDelayMs?: number;
}

export class WsRuntimeClient implements WorldRuntimeClient {
  readonly mode: RuntimeMode = "ws";

  private readonly worldSeed: string;

  private readonly listeners = new Set<(snapshot: WorldRuntimeSnapshot) => void>();

  private readonly blockListeners = new Set<(delta: RuntimeBlockDelta) => void>();

  private readonly hotbarListeners = new Set<(state: RuntimeHotbarState) => void>();

  private readonly inventoryListeners = new Set<(state: RuntimeInventoryState) => void>();

  private readonly craftListeners = new Set<(result: RuntimeCraftResult) => void>();

  private readonly containerStateListeners = new Set<(state: RuntimeContainerState) => void>();

  private readonly containerResultListeners = new Set<(result: RuntimeContainerActionResult) => void>();

  private readonly combatListeners = new Set<(result: RuntimeCombatResult) => void>();

  private readonly worldFlagStateListeners = new Set<(state: RuntimeWorldFlagState) => void>();

  private readonly worldDirectiveStateListeners = new Set<(state: RuntimeDirectiveState) => void>();

  private socket: WebSocket | null = null;

  private readonly socketUrl: string;

  private readonly reconnectDelayMs: number;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private disposed = false;

  private readonly joinedPlayers = new Map<string, JoinRuntimeRequest>();

  private readonly playerInputs = new Map<string, RuntimeInputState>();

  private fallbackSnapshot: WorldRuntimeSnapshot;

  private fallbackWorldFlagState: RuntimeWorldFlagState;

  private fallbackWorldDirectiveState: RuntimeDirectiveState;

  constructor(config: WsRuntimeClientConfig) {
    this.worldSeed = config.worldSeed;
    this.socketUrl = config.url;
    this.reconnectDelayMs = config.reconnectDelayMs ?? 300;
    this.fallbackSnapshot = {
      worldSeed: config.worldSeed,
      tick: 0,
      players: {},
    };
    this.fallbackWorldFlagState = {
      flags: {},
      tick: 0,
    };
    this.fallbackWorldDirectiveState = {
      storyBeats: [],
      spawnHints: [],
      tick: 0,
    };

    this.connect();
  }

  join(request: JoinRuntimeRequest): void {
    this.joinedPlayers.set(request.playerId, request);
    this.send({
      type: "join",
      payload: request,
    });
  }

  leave(playerId: string): void {
    this.joinedPlayers.delete(playerId);
    this.playerInputs.delete(playerId);
    this.send({
      type: "leave",
      payload: { playerId },
    });
  }

  setInput(playerId: string, input: RuntimeInputState): void {
    this.playerInputs.set(playerId, input);
    this.send({
      type: "input",
      payload: { playerId, input },
    });
  }

  submitBlockAction(playerId: string, action: RuntimeBlockActionRequest): void {
    this.send({
      type: "block_action",
      payload: {
        playerId,
        ...action,
      },
    });
  }

  selectHotbarSlot(playerId: string, slotIndex: number): void {
    this.send({
      type: "hotbar_select",
      payload: {
        playerId,
        slotIndex,
      },
    });
  }

  submitCraftRequest(playerId: string, request: RuntimeCraftRequest): void {
    this.send({
      type: "craft_request",
      payload: {
        playerId,
        ...request,
      },
    });
  }

  submitContainerAction(playerId: string, request: RuntimeContainerActionRequest): void {
    this.send({
      type: "container_action",
      payload: {
        playerId,
        ...request,
      },
    });
  }

  submitCombatAction(playerId: string, action: RuntimeCombatActionRequest): void {
    this.send({
      type: "combat_action",
      payload: {
        playerId,
        ...action,
      },
    });
  }

  subscribe(listener: (snapshot: WorldRuntimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.fallbackSnapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeBlockDeltas(listener: (delta: RuntimeBlockDelta) => void): () => void {
    this.blockListeners.add(listener);
    return () => {
      this.blockListeners.delete(listener);
    };
  }

  subscribeHotbarStates(listener: (state: RuntimeHotbarState) => void): () => void {
    this.hotbarListeners.add(listener);
    return () => {
      this.hotbarListeners.delete(listener);
    };
  }

  subscribeInventoryStates(listener: (state: RuntimeInventoryState) => void): () => void {
    this.inventoryListeners.add(listener);
    return () => {
      this.inventoryListeners.delete(listener);
    };
  }

  subscribeCraftResults(listener: (result: RuntimeCraftResult) => void): () => void {
    this.craftListeners.add(listener);
    return () => {
      this.craftListeners.delete(listener);
    };
  }

  subscribeContainerStates(listener: (state: RuntimeContainerState) => void): () => void {
    this.containerStateListeners.add(listener);
    return () => {
      this.containerStateListeners.delete(listener);
    };
  }

  subscribeContainerResults(listener: (result: RuntimeContainerActionResult) => void): () => void {
    this.containerResultListeners.add(listener);
    return () => {
      this.containerResultListeners.delete(listener);
    };
  }

  subscribeCombatResults(listener: (result: RuntimeCombatResult) => void): () => void {
    this.combatListeners.add(listener);
    return () => {
      this.combatListeners.delete(listener);
    };
  }

  subscribeWorldFlagStates(listener: (state: RuntimeWorldFlagState) => void): () => void {
    this.worldFlagStateListeners.add(listener);
    listener(this.fallbackWorldFlagState);
    return () => {
      this.worldFlagStateListeners.delete(listener);
    };
  }

  subscribeWorldDirectiveStates(listener: (state: RuntimeDirectiveState) => void): () => void {
    this.worldDirectiveStateListeners.add(listener);
    listener(this.fallbackWorldDirectiveState);
    return () => {
      this.worldDirectiveStateListeners.delete(listener);
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.listeners.clear();
    this.blockListeners.clear();
    this.hotbarListeners.clear();
    this.inventoryListeners.clear();
    this.craftListeners.clear();
    this.containerStateListeners.clear();
    this.containerResultListeners.clear();
    this.combatListeners.clear();
    this.worldFlagStateListeners.clear();
    this.worldDirectiveStateListeners.clear();
  }

  private connect(): void {
    if (this.disposed) {
      return;
    }

    try {
      const socket = new WebSocket(this.socketUrl);
      this.socket = socket;

      socket.addEventListener("open", () => {
        if (this.socket !== socket || this.disposed) {
          return;
        }
        this.replaySessionState();
      });

      socket.addEventListener("message", (event) => {
        if (this.socket !== socket || this.disposed) {
          return;
        }
        const parsed = safeParseServerMessage(event.data);
        if (!parsed) {
          return;
        }

        if (parsed.type === "snapshot") {
          if (!shouldAcceptSnapshot(parsed.payload, this.fallbackSnapshot)) {
            return;
          }
          this.fallbackSnapshot = parsed.payload;
          this.listeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "block_delta") {
          this.blockListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "hotbar_state") {
          this.hotbarListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "inventory_state") {
          this.inventoryListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "craft_result") {
          this.craftListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "container_state") {
          this.containerStateListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "container_result") {
          this.containerResultListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "combat_result") {
          this.combatListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "world_flag_state") {
          this.fallbackWorldFlagState = parsed.payload;
          this.worldFlagStateListeners.forEach((listener) => listener(parsed.payload));
          return;
        }

        if (parsed.type === "world_directive_state") {
          this.fallbackWorldDirectiveState = parsed.payload;
          this.worldDirectiveStateListeners.forEach((listener) => listener(parsed.payload));
        }
      });

      socket.addEventListener("close", () => {
        if (this.socket === socket) {
          this.socket = null;
        }
        this.scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (this.socket === socket) {
          this.socket = null;
        }
        this.scheduleReconnect();
      });
    } catch {
      this.socket = null;
      this.scheduleReconnect();
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(payload));
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private replaySessionState(): void {
    const joinedPlayerIds = Array.from(this.joinedPlayers.keys()).sort();
    for (const playerId of joinedPlayerIds) {
      const request = this.joinedPlayers.get(playerId);
      if (!request) {
        continue;
      }
      this.send({
        type: "join",
        payload: request,
      });
    }

    const inputPlayerIds = Array.from(this.playerInputs.keys()).sort();
    for (const playerId of inputPlayerIds) {
      const input = this.playerInputs.get(playerId);
      if (!input) {
        continue;
      }
      this.send({
        type: "input",
        payload: {
          playerId,
          input,
        },
      });
    }
  }
}

type ParsedServerMessage =
  | { type: "snapshot"; payload: WorldRuntimeSnapshot }
  | { type: "block_delta"; payload: RuntimeBlockDelta }
  | { type: "hotbar_state"; payload: RuntimeHotbarState }
  | { type: "inventory_state"; payload: RuntimeInventoryState }
  | { type: "craft_result"; payload: RuntimeCraftResult }
  | { type: "container_state"; payload: RuntimeContainerState }
  | { type: "container_result"; payload: RuntimeContainerActionResult }
  | { type: "combat_result"; payload: RuntimeCombatResult }
  | { type: "world_flag_state"; payload: RuntimeWorldFlagState }
  | { type: "world_directive_state"; payload: RuntimeDirectiveState };

function safeParseServerMessage(raw: unknown): ParsedServerMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const decoded = JSON.parse(raw) as Record<string, unknown> | null;
    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    if (decoded.type === "snapshot" && isRuntimeSnapshot(decoded.payload)) {
      return {
        type: "snapshot",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "block_delta" && isBlockDelta(decoded.payload)) {
      return {
        type: "block_delta",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "hotbar_state" && isHotbarState(decoded.payload)) {
      return {
        type: "hotbar_state",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "inventory_state" && isInventoryState(decoded.payload)) {
      return {
        type: "inventory_state",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "craft_result" && isCraftResult(decoded.payload)) {
      return {
        type: "craft_result",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "container_state" && isContainerState(decoded.payload)) {
      return {
        type: "container_state",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "container_result" && isContainerResult(decoded.payload)) {
      return {
        type: "container_result",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "combat_result" && isCombatResult(decoded.payload)) {
      return {
        type: "combat_result",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "world_flag_state" && isWorldFlagState(decoded.payload)) {
      return {
        type: "world_flag_state",
        payload: decoded.payload,
      };
    }

    if (decoded.type === "world_directive_state" && isWorldDirectiveState(decoded.payload)) {
      return {
        type: "world_directive_state",
        payload: decoded.payload,
      };
    }

    if (isRuntimeSnapshot(decoded)) {
      return {
        type: "snapshot",
        payload: decoded,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function shouldAcceptSnapshot(
  nextSnapshot: WorldRuntimeSnapshot,
  currentSnapshot: WorldRuntimeSnapshot,
): boolean {
  if (nextSnapshot.worldSeed !== currentSnapshot.worldSeed) {
    return false;
  }
  return nextSnapshot.tick >= currentSnapshot.tick;
}

function isRuntimeSnapshot(value: unknown): value is WorldRuntimeSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { tick?: unknown }).tick === "number" &&
    typeof (value as { worldSeed?: unknown }).worldSeed === "string" &&
    typeof (value as { players?: unknown }).players === "object"
  );
}

function isBlockDelta(value: unknown): value is RuntimeBlockDelta {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeBlockDelta>;
  return (
    (payload.action === "break" || payload.action === "place") &&
    typeof payload.chunkX === "number" &&
    typeof payload.chunkZ === "number" &&
    typeof payload.x === "number" &&
    typeof payload.y === "number" &&
    typeof payload.z === "number"
  );
}

function isCombatResult(value: unknown): value is RuntimeCombatResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeCombatResult>;
  return (
    typeof payload.actionId === "string" &&
    typeof payload.playerId === "string" &&
    typeof payload.slotId === "string" &&
    isCombatActionKind(payload.kind) &&
    typeof payload.accepted === "boolean" &&
    typeof payload.tick === "number"
  );
}

function isHotbarState(value: unknown): value is RuntimeHotbarState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeHotbarState>;
  return (
    typeof payload.playerId === "string" &&
    Array.isArray(payload.slotIds) &&
    payload.slotIds.every((slotId) => typeof slotId === "string") &&
    Array.isArray(payload.stackCounts) &&
    payload.stackCounts.every((count) => typeof count === "number") &&
    payload.stackCounts.length === payload.slotIds.length &&
    typeof payload.selectedIndex === "number" &&
    typeof payload.tick === "number"
  );
}

function isInventoryState(value: unknown): value is RuntimeInventoryState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeInventoryState>;
  if (
    typeof payload.playerId !== "string" ||
    typeof payload.tick !== "number" ||
    !payload.resources ||
    typeof payload.resources !== "object"
  ) {
    return false;
  }
  return Object.values(payload.resources).every((count) => typeof count === "number");
}

function isCraftResult(value: unknown): value is RuntimeCraftResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeCraftResult>;
  return (
    typeof payload.actionId === "string" &&
    typeof payload.playerId === "string" &&
    typeof payload.recipeId === "string" &&
    typeof payload.count === "number" &&
    typeof payload.accepted === "boolean" &&
    typeof payload.tick === "number"
  );
}

function isContainerState(value: unknown): value is RuntimeContainerState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeContainerState>;
  if (
    typeof payload.containerId !== "string" ||
    typeof payload.tick !== "number" ||
    !payload.resources ||
    typeof payload.resources !== "object"
  ) {
    return false;
  }
  return Object.values(payload.resources).every((count) => typeof count === "number");
}

function isContainerResult(value: unknown): value is RuntimeContainerActionResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeContainerActionResult>;
  return (
    typeof payload.actionId === "string" &&
    typeof payload.playerId === "string" &&
    typeof payload.containerId === "string" &&
    (payload.operation === "deposit" || payload.operation === "withdraw") &&
    typeof payload.resourceId === "string" &&
    typeof payload.amount === "number" &&
    typeof payload.accepted === "boolean" &&
    typeof payload.tick === "number"
  );
}

function isCombatActionKind(value: unknown): value is RuntimeCombatActionKind {
  return value === "melee" || value === "spell" || value === "item";
}

function isWorldFlagState(value: unknown): value is RuntimeWorldFlagState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeWorldFlagState>;
  if (typeof payload.tick !== "number" || !payload.flags || typeof payload.flags !== "object") {
    return false;
  }
  return Object.values(payload.flags).every((flagValue) => typeof flagValue === "string");
}

function isWorldDirectiveState(value: unknown): value is RuntimeDirectiveState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Partial<RuntimeDirectiveState>;
  return (
    Array.isArray(payload.storyBeats) &&
    payload.storyBeats.every((beat) => typeof beat === "string") &&
    Array.isArray(payload.spawnHints) &&
    payload.spawnHints.every((hint) => isRuntimeSpawnHint(hint)) &&
    typeof payload.tick === "number"
  );
}

function isRuntimeSpawnHint(value: unknown): value is RuntimeDirectiveState["spawnHints"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as RuntimeDirectiveState["spawnHints"][number];
  return (
    typeof payload.hintId === "string" &&
    typeof payload.label === "string" &&
    typeof payload.chunkX === "number" &&
    typeof payload.chunkZ === "number"
  );
}

export const wsRuntimeClientTestUtils = {
  safeParseServerMessage,
  shouldAcceptSnapshot,
};
