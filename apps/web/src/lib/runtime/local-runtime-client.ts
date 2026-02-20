import { AuthoritativeWorldSim } from "@/lib/runtime/authoritative-sim";
import {
  DEFAULT_RUNTIME_HOTBAR_SLOT_IDS,
  DEFAULT_RUNTIME_RESOURCE_IDS,
  RuntimeBlockActionRequest,
  RuntimeBlockDelta,
  RuntimeCombatActionRequest,
  RuntimeCombatResult,
  RuntimeInteractRequest,
  RuntimeInteractResult,
  RuntimeContainerActionRequest,
  RuntimeContainerActionResult,
  RuntimeContainerState,
  RuntimeCraftRequest,
  RuntimeCraftResult,
  RuntimeHotbarState,
  RuntimeHealthState,
  RuntimeInventoryState,
  RuntimeWorldEvent,
  JoinRuntimeRequest,
  RuntimeInputState,
  RuntimeMode,
  RuntimeDirectiveState,
  RuntimeWorldFlagState,
  WORLD_SHARED_CONTAINER_ID,
  WorldRuntimeClient,
  WorldRuntimeSnapshot,
  getPlayerPrivateContainerId,
} from "@/lib/runtime/protocol";

interface CraftIngredient {
  resourceId: string;
  amount: number;
}

interface CraftOutput {
  targetSlotId?: string;
  resourceId?: string;
  amount: number;
}

interface CraftRecipe {
  id: string;
  ingredients: CraftIngredient[];
  output: CraftOutput;
}

interface EntityHealthState {
  targetId: string;
  entityType: "npc" | "wild-mon";
  current: number;
  max: number;
  defeatedUntilTick: number;
  tick: number;
}

const CRAFT_RECIPES = new Map<string, CraftRecipe>([
  [
    "craft-bandage",
    {
      id: "craft-bandage",
      ingredients: [
        { resourceId: "fiber", amount: 2 },
        { resourceId: "salvage", amount: 1 },
      ],
      output: { targetSlotId: "slot-4-bandage", amount: 1 },
    },
  ],
  [
    "craft-bomb",
    {
      id: "craft-bomb",
      ingredients: [
        { resourceId: "coal", amount: 2 },
        { resourceId: "fiber", amount: 1 },
      ],
      output: { targetSlotId: "slot-5-bomb", amount: 1 },
    },
  ],
  [
    "craft-charcoal",
    {
      id: "craft-charcoal",
      ingredients: [{ resourceId: "wood", amount: 2 }],
      output: { resourceId: "coal", amount: 1 },
    },
  ],
  [
    "craft-iron-ingot",
    {
      id: "craft-iron-ingot",
      ingredients: [
        { resourceId: "iron_ore", amount: 2 },
        { resourceId: "coal", amount: 1 },
      ],
      output: { resourceId: "iron_ingot", amount: 1 },
    },
  ],
]);

const DEFAULT_MAX_HEALTH = 10;
const DEFAULT_NPC_HEALTH = 6;
const DEFAULT_WILD_MON_HEALTH = 8;
const ENTITY_RESPAWN_TICKS = 600;

export class LocalRuntimeClient implements WorldRuntimeClient {
  readonly mode: RuntimeMode = "local";

  private readonly sim: AuthoritativeWorldSim;

  private readonly listeners = new Set<(snapshot: WorldRuntimeSnapshot) => void>();

  private readonly blockListeners = new Set<(delta: RuntimeBlockDelta) => void>();

  private readonly hotbarListeners = new Set<(state: RuntimeHotbarState) => void>();

  private readonly inventoryListeners = new Set<(state: RuntimeInventoryState) => void>();

  private readonly healthListeners = new Set<(state: RuntimeHealthState) => void>();

  private readonly worldEventListeners = new Set<(event: RuntimeWorldEvent) => void>();

  private readonly craftListeners = new Set<(result: RuntimeCraftResult) => void>();

  private readonly containerStateListeners = new Set<(state: RuntimeContainerState) => void>();

  private readonly containerResultListeners = new Set<(result: RuntimeContainerActionResult) => void>();

  private readonly combatListeners = new Set<(result: RuntimeCombatResult) => void>();

  private readonly interactListeners = new Set<(result: RuntimeInteractResult) => void>();

  private readonly worldFlagStateListeners = new Set<(state: RuntimeWorldFlagState) => void>();

  private readonly worldDirectiveStateListeners = new Set<(state: RuntimeDirectiveState) => void>();

  private readonly intervalId: number;

  private readonly hotbarStates = new Map<string, RuntimeHotbarState>();

  private readonly inventoryStates = new Map<string, RuntimeInventoryState>();

  private readonly healthStates = new Map<string, RuntimeHealthState>();

  private readonly entityHealthStates = new Map<string, EntityHealthState>();

  private readonly containerStates = new Map<string, RuntimeContainerState>();

  private worldFlagState: RuntimeWorldFlagState = {
    flags: {},
    tick: 0,
  };

  private worldDirectiveState: RuntimeDirectiveState = {
    storyBeats: [],
    spawnHints: [],
    tick: 0,
  };

  constructor(worldSeed: string) {
    this.sim = new AuthoritativeWorldSim(worldSeed);
    this.worldFlagState.tick = this.sim.snapshot().tick;
    this.worldDirectiveState.tick = this.sim.snapshot().tick;
    this.ensureContainerState(WORLD_SHARED_CONTAINER_ID);
    this.intervalId = window.setInterval(() => {
      const snapshot = this.sim.advanceOneTick();
      this.listeners.forEach((listener) => listener(snapshot));
    }, 1000 / this.sim.config.tickRateHz);
  }

  join(request: JoinRuntimeRequest): void {
    this.sim.joinPlayer(request);
    this.ensureHotbarState(request.playerId);
    this.ensureInventoryState(request.playerId);
    this.ensureHealthState(request.playerId);
    this.ensureContainerState(getPlayerPrivateContainerId(request.playerId));
    const snapshot = this.sim.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
    const hotbarState = this.hotbarStates.get(request.playerId);
    if (hotbarState) {
      this.hotbarListeners.forEach((listener) => listener(hotbarState));
    }
    const inventoryState = this.inventoryStates.get(request.playerId);
    if (inventoryState) {
      this.inventoryListeners.forEach((listener) => listener(inventoryState));
    }
    const healthState = this.healthStates.get(request.playerId);
    if (healthState) {
      this.healthListeners.forEach((listener) => listener(healthState));
    }
    for (const containerState of this.containerStates.values()) {
      this.containerStateListeners.forEach((listener) => listener(containerState));
    }
  }

  leave(playerId: string): void {
    this.sim.leavePlayer(playerId);
    this.hotbarStates.delete(playerId);
    this.inventoryStates.delete(playerId);
    this.healthStates.delete(playerId);
    const snapshot = this.sim.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  setInput(playerId: string, input: RuntimeInputState): void {
    this.sim.setInput(playerId, input);
  }

  submitBlockAction(_playerId: string, action: RuntimeBlockActionRequest): void {
    const delta: RuntimeBlockDelta = {
      action: action.action,
      chunkX: action.chunkX,
      chunkZ: action.chunkZ,
      x: action.x,
      y: action.y,
      z: action.z,
      blockType: action.blockType,
    };
    this.blockListeners.forEach((listener) => listener(delta));
    if (action.action === "break") {
      const inventoryState = this.ensureInventoryState(_playerId);
      const grants = breakResourceGrants(action);
      const nextResources = { ...inventoryState.resources };
      let changed = false;
      for (const [resourceId, amount] of Object.entries(grants)) {
        if (amount <= 0) {
          continue;
        }
        nextResources[resourceId] = (nextResources[resourceId] ?? 0) + amount;
        changed = true;
      }
      if (!changed) {
        return;
      }
      const nextState: RuntimeInventoryState = {
        ...inventoryState,
        resources: normalizeResources(nextResources),
        tick: this.sim.snapshot().tick,
      };
      this.inventoryStates.set(_playerId, nextState);
      this.inventoryListeners.forEach((listener) => listener(nextState));
    }
  }

  selectHotbarSlot(playerId: string, slotIndex: number): void {
    const current = this.ensureHotbarState(playerId);
    if (current.slotIds.length === 0) {
      return;
    }
    const nextState: RuntimeHotbarState = {
      ...current,
      stackCounts: [...current.stackCounts],
      selectedIndex: clampHotbarIndex(slotIndex, current.slotIds.length),
      tick: this.sim.snapshot().tick,
    };
    this.hotbarStates.set(playerId, nextState);
    this.hotbarListeners.forEach((listener) => listener(nextState));
  }

  submitCombatAction(playerId: string, action: RuntimeCombatActionRequest): void {
    const hotbarState = this.ensureHotbarState(playerId);
    const slotIndex = hotbarState.slotIds.indexOf(action.slotId);
    const snapshot = this.sim.snapshot();
    const result: RuntimeCombatResult = {
      actionId: action.actionId,
      playerId,
      slotId: action.slotId,
      kind: action.kind,
      accepted: true,
      targetId: action.targetId,
      targetLabel: action.targetLabel,
      targetWorldX: action.targetWorldX,
      targetWorldZ: action.targetWorldZ,
      tick: snapshot.tick,
    };
    let shouldConsumeItem = false;
    if (slotIndex < 0) {
      result.accepted = false;
      result.reason = "slot_not_equipped";
    } else if (action.kind === "item") {
      const remaining = hotbarState.stackCounts[slotIndex] ?? 0;
      if (remaining <= 0) {
        result.accepted = false;
        result.reason = "insufficient_item";
      } else {
        shouldConsumeItem = true;
      }
    }
    if (result.accepted && action.targetId) {
      if (!snapshot.players[action.targetId]) {
        if (!this.isEntityAvailable(action.targetId, snapshot.tick)) {
          result.accepted = false;
          result.reason = "target_defeated";
        }
      }
    }
    if (result.accepted && shouldConsumeItem) {
      const remaining = hotbarState.stackCounts[slotIndex] ?? 0;
      if (remaining > 0) {
        const nextHotbarState: RuntimeHotbarState = {
          ...hotbarState,
          stackCounts: [...hotbarState.stackCounts],
          tick: snapshot.tick,
        };
        nextHotbarState.stackCounts[slotIndex] = remaining - 1;
        this.hotbarStates.set(playerId, nextHotbarState);
        this.hotbarListeners.forEach((listener) => listener(nextHotbarState));
      }
    }
    this.combatListeners.forEach((listener) => listener(result));
    if (result.accepted) {
      this.applyCombatEffect(playerId, action);
    }
  }

  submitInteractAction(playerId: string, action: RuntimeInteractRequest): void {
    const snapshot = this.sim.snapshot();
    const player = snapshot.players[playerId];
    const result: RuntimeInteractResult = {
      actionId: action.actionId,
      playerId,
      accepted: false,
      targetId: action.targetId,
      targetLabel: action.targetLabel,
      targetWorldX: action.targetWorldX,
      targetWorldZ: action.targetWorldZ,
      tick: snapshot.tick,
    };

    if (!player || !action.actionId) {
      result.reason = "invalid_payload";
      this.interactListeners.forEach((listener) => listener(result));
      return;
    }

    const targetX = action.targetWorldX;
    const targetZ = action.targetWorldZ;
    if (typeof targetX !== "number" || typeof targetZ !== "number") {
      result.reason = "missing_target";
      this.interactListeners.forEach((listener) => listener(result));
      return;
    }

    const distance = Math.hypot(targetX - player.x, targetZ - player.z);
    if (distance > 3.4) {
      result.reason = "target_out_of_range";
      this.interactListeners.forEach((listener) => listener(result));
      return;
    }

    result.accepted = true;
    result.message = action.targetLabel ? `${action.targetLabel} acknowledges you.` : "Interaction accepted.";
    this.interactListeners.forEach((listener) => listener(result));
  }

  submitCraftRequest(playerId: string, request: RuntimeCraftRequest): void {
    const inventoryState = this.ensureInventoryState(playerId);
    const result: RuntimeCraftResult = {
      actionId: request.actionId,
      playerId,
      recipeId: request.recipeId,
      count: request.count,
      accepted: false,
      tick: this.sim.snapshot().tick,
    };

    if (request.count <= 0) {
      result.reason = "invalid_payload";
      this.craftListeners.forEach((listener) => listener(result));
      return;
    }
    const recipe = CRAFT_RECIPES.get(request.recipeId);
    if (!recipe) {
      result.reason = "invalid_recipe";
      this.craftListeners.forEach((listener) => listener(result));
      return;
    }

    for (const ingredient of recipe.ingredients) {
      const required = ingredient.amount * request.count;
      const available = inventoryState.resources[ingredient.resourceId] ?? 0;
      if (available < required) {
        result.reason = "insufficient_resources";
        this.craftListeners.forEach((listener) => listener(result));
        return;
      }
    }

    const nextResources = { ...inventoryState.resources };
    for (const ingredient of recipe.ingredients) {
      const required = ingredient.amount * request.count;
      nextResources[ingredient.resourceId] = (nextResources[ingredient.resourceId] ?? 0) - required;
    }

    const nextInventory: RuntimeInventoryState = {
      ...inventoryState,
      resources: normalizeResources(nextResources),
      tick: this.sim.snapshot().tick,
    };
    if (recipe.output.targetSlotId) {
      const hotbarState = this.ensureHotbarState(playerId);
      const targetSlotIndex = hotbarState.slotIds.indexOf(recipe.output.targetSlotId);
      if (targetSlotIndex < 0) {
        result.reason = "craft_target_slot_missing";
        this.craftListeners.forEach((listener) => listener(result));
        return;
      }
      const nextHotbar: RuntimeHotbarState = {
        ...hotbarState,
        stackCounts: [...hotbarState.stackCounts],
        tick: this.sim.snapshot().tick,
      };
      nextHotbar.stackCounts[targetSlotIndex] =
        (nextHotbar.stackCounts[targetSlotIndex] ?? 0) + (recipe.output.amount * request.count);
      this.hotbarStates.set(playerId, nextHotbar);
      this.hotbarListeners.forEach((listener) => listener(nextHotbar));
    }
    if (recipe.output.resourceId) {
      nextInventory.resources[recipe.output.resourceId] =
        (nextInventory.resources[recipe.output.resourceId] ?? 0) + (recipe.output.amount * request.count);
      nextInventory.resources = normalizeResources(nextInventory.resources);
    }
    this.inventoryStates.set(playerId, nextInventory);
    this.inventoryListeners.forEach((listener) => listener(nextInventory));

    result.accepted = true;
    this.craftListeners.forEach((listener) => listener(result));
  }

  submitContainerAction(playerId: string, request: RuntimeContainerActionRequest): void {
    const result: RuntimeContainerActionResult = {
      actionId: request.actionId,
      playerId,
      containerId: request.containerId,
      operation: request.operation,
      resourceId: request.resourceId,
      amount: request.amount,
      accepted: false,
      tick: this.sim.snapshot().tick,
    };
    if (request.amount <= 0 || request.resourceId === "") {
      result.reason = "invalid_payload";
      this.containerResultListeners.forEach((listener) => listener(result));
      return;
    }
    if (!canAccessContainer(playerId, request.containerId)) {
      result.reason = "container_forbidden";
      this.containerResultListeners.forEach((listener) => listener(result));
      return;
    }

    const inventoryState = this.ensureInventoryState(playerId);
    const containerState = this.ensureContainerState(request.containerId);
    const playerAmount = inventoryState.resources[request.resourceId] ?? 0;
    const containerAmount = containerState.resources[request.resourceId] ?? 0;

    if (request.operation === "deposit") {
      if (playerAmount < request.amount) {
        result.reason = "insufficient_resources";
        this.containerResultListeners.forEach((listener) => listener(result));
        return;
      }
      const nextInventory: RuntimeInventoryState = {
        ...inventoryState,
        resources: normalizeResources({
          ...inventoryState.resources,
          [request.resourceId]: playerAmount - request.amount,
        }),
        tick: this.sim.snapshot().tick,
      };
      this.inventoryStates.set(playerId, nextInventory);
      this.inventoryListeners.forEach((listener) => listener(nextInventory));

      const nextContainer: RuntimeContainerState = {
        ...containerState,
        resources: normalizeResources({
          ...containerState.resources,
          [request.resourceId]: containerAmount + request.amount,
        }),
        tick: this.sim.snapshot().tick,
      };
      this.containerStates.set(request.containerId, nextContainer);
      this.containerStateListeners.forEach((listener) => listener(nextContainer));
      result.accepted = true;
      this.containerResultListeners.forEach((listener) => listener(result));
      return;
    }

    if (request.operation === "withdraw") {
      if (containerAmount < request.amount) {
        result.reason = "container_insufficient_resources";
        this.containerResultListeners.forEach((listener) => listener(result));
        return;
      }
      const nextInventory: RuntimeInventoryState = {
        ...inventoryState,
        resources: normalizeResources({
          ...inventoryState.resources,
          [request.resourceId]: playerAmount + request.amount,
        }),
        tick: this.sim.snapshot().tick,
      };
      this.inventoryStates.set(playerId, nextInventory);
      this.inventoryListeners.forEach((listener) => listener(nextInventory));

      const nextContainer: RuntimeContainerState = {
        ...containerState,
        resources: normalizeResources({
          ...containerState.resources,
          [request.resourceId]: containerAmount - request.amount,
        }),
        tick: this.sim.snapshot().tick,
      };
      this.containerStates.set(request.containerId, nextContainer);
      this.containerStateListeners.forEach((listener) => listener(nextContainer));
      result.accepted = true;
      this.containerResultListeners.forEach((listener) => listener(result));
      return;
    }

    result.reason = "invalid_operation";
    this.containerResultListeners.forEach((listener) => listener(result));
  }

  subscribe(listener: (snapshot: WorldRuntimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.sim.snapshot());

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
    for (const state of this.hotbarStates.values()) {
      listener(state);
    }
    return () => {
      this.hotbarListeners.delete(listener);
    };
  }

  subscribeInventoryStates(listener: (state: RuntimeInventoryState) => void): () => void {
    this.inventoryListeners.add(listener);
    for (const state of this.inventoryStates.values()) {
      listener(state);
    }
    return () => {
      this.inventoryListeners.delete(listener);
    };
  }

  subscribeHealthStates(listener: (state: RuntimeHealthState) => void): () => void {
    this.healthListeners.add(listener);
    for (const state of this.healthStates.values()) {
      listener(state);
    }
    return () => {
      this.healthListeners.delete(listener);
    };
  }

  subscribeWorldEvents(listener: (event: RuntimeWorldEvent) => void): () => void {
    this.worldEventListeners.add(listener);
    return () => {
      this.worldEventListeners.delete(listener);
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
    for (const state of this.containerStates.values()) {
      listener(state);
    }
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

  subscribeInteractResults(listener: (result: RuntimeInteractResult) => void): () => void {
    this.interactListeners.add(listener);
    return () => {
      this.interactListeners.delete(listener);
    };
  }

  subscribeWorldFlagStates(listener: (state: RuntimeWorldFlagState) => void): () => void {
    this.worldFlagStateListeners.add(listener);
    listener(this.worldFlagState);
    return () => {
      this.worldFlagStateListeners.delete(listener);
    };
  }

  subscribeWorldDirectiveStates(listener: (state: RuntimeDirectiveState) => void): () => void {
    this.worldDirectiveStateListeners.add(listener);
    listener(this.worldDirectiveState);
    return () => {
      this.worldDirectiveStateListeners.delete(listener);
    };
  }

  dispose(): void {
    window.clearInterval(this.intervalId);
    this.listeners.clear();
    this.blockListeners.clear();
    this.hotbarListeners.clear();
    this.inventoryListeners.clear();
    this.healthListeners.clear();
    this.worldEventListeners.clear();
    this.craftListeners.clear();
    this.containerStateListeners.clear();
    this.containerResultListeners.clear();
    this.combatListeners.clear();
    this.interactListeners.clear();
    this.worldFlagStateListeners.clear();
    this.worldDirectiveStateListeners.clear();
  }

  private ensureHotbarState(playerId: string): RuntimeHotbarState {
    const existing = this.hotbarStates.get(playerId);
    if (existing) {
      if (existing.stackCounts.length !== existing.slotIds.length) {
        const normalized: RuntimeHotbarState = {
          ...existing,
          stackCounts: buildDefaultStackCounts(existing.slotIds),
        };
        this.hotbarStates.set(playerId, normalized);
        return normalized;
      }
      return existing;
    }

    const created: RuntimeHotbarState = {
      playerId,
      slotIds: [...DEFAULT_RUNTIME_HOTBAR_SLOT_IDS],
      stackCounts: buildDefaultStackCounts(DEFAULT_RUNTIME_HOTBAR_SLOT_IDS),
      selectedIndex: 0,
      tick: this.sim.snapshot().tick,
    };
    this.hotbarStates.set(playerId, created);
    return created;
  }

  private ensureInventoryState(playerId: string): RuntimeInventoryState {
    const existing = this.inventoryStates.get(playerId);
    if (existing) {
      if (Object.keys(existing.resources).length !== DEFAULT_RUNTIME_RESOURCE_IDS.length) {
        const normalized: RuntimeInventoryState = {
          ...existing,
          resources: normalizeResources(existing.resources),
        };
        this.inventoryStates.set(playerId, normalized);
        return normalized;
      }
      return existing;
    }
    const created: RuntimeInventoryState = {
      playerId,
      resources: buildDefaultResourceMap(),
      tick: this.sim.snapshot().tick,
    };
    this.inventoryStates.set(playerId, created);
    return created;
  }

  private ensureHealthState(playerId: string): RuntimeHealthState {
    const existing = this.healthStates.get(playerId);
    if (existing) {
      if (!Number.isFinite(existing.max) || existing.max <= 0) {
        const normalized: RuntimeHealthState = {
          ...existing,
          max: DEFAULT_MAX_HEALTH,
          current: Math.min(existing.current, DEFAULT_MAX_HEALTH),
        };
        this.healthStates.set(playerId, normalized);
        return normalized;
      }
      if (existing.current > existing.max) {
        const normalized: RuntimeHealthState = {
          ...existing,
          current: existing.max,
        };
        this.healthStates.set(playerId, normalized);
        return normalized;
      }
      return existing;
    }
    const created: RuntimeHealthState = {
      playerId,
      current: DEFAULT_MAX_HEALTH,
      max: DEFAULT_MAX_HEALTH,
      tick: this.sim.snapshot().tick,
    };
    this.healthStates.set(playerId, created);
    return created;
  }

  private ensureEntityHealthState(targetId: string, tick: number): EntityHealthState | null {
    const parsed = parseTargetId(targetId);
    if (!parsed) {
      return null;
    }
    const baseHealth = resolveEntityBaseHealth(parsed.entityType);
    if (!baseHealth) {
      return null;
    }
    const existing = this.entityHealthStates.get(targetId);
    if (!existing) {
      const created: EntityHealthState = {
        targetId,
        entityType: parsed.entityType,
        current: baseHealth,
        max: baseHealth,
        defeatedUntilTick: 0,
        tick,
      };
      this.entityHealthStates.set(targetId, created);
      return created;
    }
    const next: EntityHealthState = { ...existing };
    if (next.max <= 0) {
      next.max = baseHealth;
    }
    if (next.defeatedUntilTick > 0 && tick >= next.defeatedUntilTick) {
      next.current = next.max;
      next.defeatedUntilTick = 0;
    }
    if (next.current > next.max) {
      next.current = next.max;
    }
    if (next.current < 0) {
      next.current = 0;
    }
    next.tick = tick;
    this.entityHealthStates.set(targetId, next);
    return next;
  }

  private isEntityAvailable(targetId: string, tick: number): boolean {
    if (!parseTargetId(targetId)) {
      return true;
    }
    const state = this.ensureEntityHealthState(targetId, tick);
    if (!state) {
      return true;
    }
    if (state.defeatedUntilTick > tick && state.current <= 0) {
      return false;
    }
    return true;
  }

  private emitWorldEvent(event: RuntimeWorldEvent): void {
    this.worldEventListeners.forEach((listener) => listener(event));
  }

  private applyCombatEffect(playerId: string, action: RuntimeCombatActionRequest): void {
    const effect = resolveCombatEffect(action.slotId);
    if (!effect) {
      return;
    }
    const snapshot = this.sim.snapshot();
    const tick = snapshot.tick;

    if (effect.heal > 0) {
      const state = this.ensureHealthState(playerId);
      const nextCurrent = Math.min(state.max, state.current + effect.heal);
      if (nextCurrent !== state.current) {
        const nextState: RuntimeHealthState = { ...state, current: nextCurrent, tick };
        this.healthStates.set(playerId, nextState);
        this.healthListeners.forEach((listener) => listener(nextState));
      }
    }

    if (effect.damage > 0 && action.targetId) {
      if (snapshot.players[action.targetId]) {
        const state = this.ensureHealthState(action.targetId);
        const nextCurrent = Math.max(0, state.current - effect.damage);
        if (nextCurrent !== state.current) {
          const nextState: RuntimeHealthState = { ...state, current: nextCurrent, tick };
          this.healthStates.set(action.targetId, nextState);
          this.healthListeners.forEach((listener) => listener(nextState));
        }
        return;
      }

      const entityState = this.ensureEntityHealthState(action.targetId, tick);
      if (!entityState) {
        return;
      }
      if (entityState.defeatedUntilTick > tick && entityState.current <= 0) {
        return;
      }
      const nextCurrent = Math.max(0, entityState.current - effect.damage);
      const defeatedNow = entityState.current > 0 && nextCurrent === 0;
      const nextState: EntityHealthState = {
        ...entityState,
        current: nextCurrent,
        defeatedUntilTick: defeatedNow ? tick + ENTITY_RESPAWN_TICKS : entityState.defeatedUntilTick,
        tick,
      };
      this.entityHealthStates.set(action.targetId, nextState);
      if (defeatedNow) {
        const loot = resolveEntityLoot(action.targetId, nextState.entityType, tick);
        const inventoryState = this.ensureInventoryState(playerId);
        const nextResources = { ...inventoryState.resources };
        let changed = false;
        for (const [resourceId, amount] of Object.entries(loot)) {
          if (amount <= 0) {
            continue;
          }
          nextResources[resourceId] = (nextResources[resourceId] ?? 0) + amount;
          changed = true;
        }
        if (changed) {
          const nextInventory: RuntimeInventoryState = {
            ...inventoryState,
            resources: normalizeResources(nextResources),
            tick,
          };
          this.inventoryStates.set(playerId, nextInventory);
          this.inventoryListeners.forEach((listener) => listener(nextInventory));
        }
        this.emitWorldEvent({
          seq: Date.now(),
          tick,
          type: "entity_defeated",
          playerId,
          payload: {
            targetId: action.targetId,
            entityType: nextState.entityType,
            loot,
            respawnTick: nextState.defeatedUntilTick,
          },
        });
      }
    }
  }

  private ensureContainerState(containerId: string): RuntimeContainerState {
    const existing = this.containerStates.get(containerId);
    if (existing) {
      if (Object.keys(existing.resources).length !== DEFAULT_RUNTIME_RESOURCE_IDS.length) {
        const normalized: RuntimeContainerState = {
          ...existing,
          resources: normalizeResources(existing.resources),
        };
        this.containerStates.set(containerId, normalized);
        return normalized;
      }
      return existing;
    }
    const created: RuntimeContainerState = {
      containerId,
      resources: buildDefaultResourceMap(),
      tick: this.sim.snapshot().tick,
    };
    this.containerStates.set(containerId, created);
    return created;
  }
}

function clampHotbarIndex(index: number, slotCount: number): number {
  if (slotCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, slotCount - 1));
}

function buildDefaultStackCounts(slotIds: readonly string[]): number[] {
  return slotIds.map((slotId) => defaultStackCountForSlot(slotId));
}

function defaultStackCountForSlot(slotId: string): number {
  switch (slotId) {
    case "slot-4-bandage":
      return 3;
    case "slot-5-bomb":
      return 2;
    default:
      return 0;
  }
}

function buildDefaultResourceMap(): Record<string, number> {
  const resources: Record<string, number> = {};
  for (const resourceId of DEFAULT_RUNTIME_RESOURCE_IDS) {
    resources[resourceId] = 0;
  }
  return resources;
}

function normalizeResources(input: Record<string, number>): Record<string, number> {
  return {
    ...buildDefaultResourceMap(),
    ...input,
  };
}

function breakResourceGrants(action: RuntimeBlockActionRequest): Record<string, number> {
  const grants: Record<string, number> = { salvage: 1 };
  const roll = breakResourceRoll(action);
  if (roll < 30) {
    grants.wood = (grants.wood ?? 0) + 1;
  } else if (roll < 55) {
    grants.stone = (grants.stone ?? 0) + 1;
  } else if (roll < 75) {
    grants.fiber = (grants.fiber ?? 0) + 1;
  } else if (roll < 90) {
    grants.coal = (grants.coal ?? 0) + 1;
  } else if (roll < 98) {
    grants.iron_ore = (grants.iron_ore ?? 0) + 1;
  } else {
    grants.salvage += 1;
  }
  return grants;
}

function breakResourceRoll(action: RuntimeBlockActionRequest): number {
  let value =
    (action.chunkX * 73856093) ^
    (action.chunkZ * 19349663) ^
    (action.x * 83492791) ^
    (action.y * 1237) ^
    (action.z * 29791);
  if (value < 0) {
    value *= -1;
  }
  return value % 100;
}

function canAccessContainer(playerId: string, containerId: string): boolean {
  if (containerId.startsWith("world:")) {
    return true;
  }
  return containerId === getPlayerPrivateContainerId(playerId);
}

function resolveCombatEffect(slotId: string): { damage: number; heal: number } | null {
  switch (slotId) {
    case "slot-1-rust-blade":
      return { damage: 2, heal: 0 };
    case "slot-2-ember-bolt":
      return { damage: 3, heal: 0 };
    case "slot-3-frost-bind":
      return { damage: 2, heal: 0 };
    case "slot-4-bandage":
      return { damage: 0, heal: 2 };
    case "slot-5-bomb":
      return { damage: 4, heal: 0 };
    default:
      return null;
  }
}

function parseTargetId(targetId: string): { entityType: "npc" | "wild-mon" } | null {
  const parts = targetId.split(":");
  if (parts.length !== 4) {
    return null;
  }
  const entityType = parts[2];
  if (entityType !== "npc" && entityType !== "wild-mon") {
    return null;
  }
  return { entityType };
}

function resolveEntityBaseHealth(entityType: "npc" | "wild-mon"): number {
  return entityType === "npc" ? DEFAULT_NPC_HEALTH : DEFAULT_WILD_MON_HEALTH;
}

function resolveEntityLoot(targetId: string, entityType: "npc" | "wild-mon", tick: number): Record<string, number> {
  const loot: Record<string, number> = { salvage: 1 };
  const seed = numericHash(`${targetId}:${tick}`) % 100;

  if (entityType === "wild-mon") {
    if (seed < 35) {
      loot.fiber = (loot.fiber ?? 0) + 1;
    } else if (seed < 60) {
      loot.coal = (loot.coal ?? 0) + 1;
    } else if (seed < 80) {
      loot.iron_ore = (loot.iron_ore ?? 0) + 1;
    } else {
      loot.salvage = (loot.salvage ?? 0) + 1;
    }
    return loot;
  }

  if (seed < 40) {
    loot.wood = (loot.wood ?? 0) + 1;
  } else if (seed < 70) {
    loot.fiber = (loot.fiber ?? 0) + 1;
  } else {
    loot.salvage = (loot.salvage ?? 0) + 1;
  }
  return loot;
}

function numericHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
