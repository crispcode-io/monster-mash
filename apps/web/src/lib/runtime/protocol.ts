export type RuntimeMode = "local" | "ws";

export interface JoinRuntimeRequest {
  worldSeed: string;
  playerId: string;
  startX: number;
  startZ: number;
}

export interface RuntimeInputState {
  moveX: number;
  moveZ: number;
  running: boolean;
  jump: boolean;
}

export interface RuntimeBlockPosition {
  chunkX: number;
  chunkZ: number;
  x: number;
  y: number;
  z: number;
}

export interface RuntimeBlockActionRequest extends RuntimeBlockPosition {
  action: "break" | "place";
  blockType?: string;
}

export interface RuntimeBlockDelta extends RuntimeBlockPosition {
  action: "break" | "place";
  blockType?: string;
}

export type RuntimeCombatActionKind = "melee" | "spell" | "item";

export const DEFAULT_RUNTIME_HOTBAR_SLOT_IDS = [
  "slot-1-rust-blade",
  "slot-2-ember-bolt",
  "slot-3-frost-bind",
  "slot-4-bandage",
  "slot-5-bomb",
] as const;

export const DEFAULT_RUNTIME_RESOURCE_IDS = [
  "salvage",
  "wood",
  "stone",
  "fiber",
  "coal",
  "iron_ore",
  "iron_ingot",
] as const;

export const WORLD_SHARED_CONTAINER_ID = "world:camp-shared";

export function getPlayerPrivateContainerId(playerId: string): string {
  return `player:${playerId}:stash`;
}

export interface RuntimeHotbarState {
  playerId: string;
  slotIds: string[];
  stackCounts: number[];
  selectedIndex: number;
  tick: number;
}

export interface RuntimeInventoryState {
  playerId: string;
  resources: Record<string, number>;
  tick: number;
}

export interface RuntimeHealthState {
  playerId: string;
  current: number;
  max: number;
  tick: number;
}

export interface RuntimeCraftRequest {
  actionId: string;
  recipeId: string;
  count: number;
}

export interface RuntimeCraftResult {
  actionId: string;
  playerId: string;
  recipeId: string;
  count: number;
  accepted: boolean;
  reason?: string;
  tick: number;
}

export interface RuntimeContainerState {
  containerId: string;
  resources: Record<string, number>;
  tick: number;
}

export interface RuntimeContainerActionRequest {
  actionId: string;
  containerId: string;
  operation: "deposit" | "withdraw";
  resourceId: string;
  amount: number;
}

export interface RuntimeContainerActionResult {
  actionId: string;
  playerId: string;
  containerId: string;
  operation: "deposit" | "withdraw";
  resourceId: string;
  amount: number;
  accepted: boolean;
  reason?: string;
  tick: number;
}

export interface RuntimeWorldFlagState {
  flags: Record<string, string>;
  tick: number;
}

export interface RuntimeWorldEvent {
  seq: number;
  tick: number;
  type: string;
  playerId?: string;
  payload?: Record<string, unknown>;
}

export interface RuntimeSpawnHint {
  hintId: string;
  label: string;
  chunkX: number;
  chunkZ: number;
}

export interface RuntimeDirectiveState {
  storyBeats: string[];
  spawnHints: RuntimeSpawnHint[];
  tick: number;
}

export interface RuntimeCombatActionRequest {
  actionId: string;
  slotId: string;
  kind: RuntimeCombatActionKind;
  targetId?: string;
  targetLabel?: string;
  targetWorldX?: number;
  targetWorldZ?: number;
}

export interface RuntimeCombatResult {
  actionId: string;
  playerId: string;
  slotId: string;
  kind: RuntimeCombatActionKind;
  accepted: boolean;
  reason?: string;
  targetId?: string;
  targetLabel?: string;
  targetWorldX?: number;
  targetWorldZ?: number;
  cooldownRemainingMs?: number;
  tick: number;
}

export interface RuntimeInteractRequest {
  actionId: string;
  targetId?: string;
  targetLabel?: string;
  targetWorldX?: number;
  targetWorldZ?: number;
}

export interface RuntimeInteractResult {
  actionId: string;
  playerId: string;
  accepted: boolean;
  reason?: string;
  targetId?: string;
  targetLabel?: string;
  targetWorldX?: number;
  targetWorldZ?: number;
  message?: string;
  tick: number;
}

export interface RuntimePlayerSnapshot {
  playerId: string;
  x: number;
  z: number;
  speed: number;
}

export interface WorldRuntimeSnapshot {
  worldSeed: string;
  tick: number;
  players: Record<string, RuntimePlayerSnapshot>;
}

export interface WorldRuntimeClient {
  readonly mode: RuntimeMode;
  join(request: JoinRuntimeRequest): void;
  leave(playerId: string): void;
  setInput(playerId: string, input: RuntimeInputState): void;
  submitBlockAction(playerId: string, action: RuntimeBlockActionRequest): void;
  selectHotbarSlot(playerId: string, slotIndex: number): void;
  submitCraftRequest(playerId: string, request: RuntimeCraftRequest): void;
  submitContainerAction(playerId: string, request: RuntimeContainerActionRequest): void;
  submitCombatAction(playerId: string, action: RuntimeCombatActionRequest): void;
  submitInteractAction(playerId: string, action: RuntimeInteractRequest): void;
  subscribe(listener: (snapshot: WorldRuntimeSnapshot) => void): () => void;
  subscribeBlockDeltas(listener: (delta: RuntimeBlockDelta) => void): () => void;
  subscribeHotbarStates(listener: (state: RuntimeHotbarState) => void): () => void;
  subscribeInventoryStates(listener: (state: RuntimeInventoryState) => void): () => void;
  subscribeHealthStates(listener: (state: RuntimeHealthState) => void): () => void;
  subscribeCraftResults(listener: (result: RuntimeCraftResult) => void): () => void;
  subscribeContainerStates(listener: (state: RuntimeContainerState) => void): () => void;
  subscribeContainerResults(listener: (result: RuntimeContainerActionResult) => void): () => void;
  subscribeWorldFlagStates(listener: (state: RuntimeWorldFlagState) => void): () => void;
  subscribeWorldDirectiveStates(listener: (state: RuntimeDirectiveState) => void): () => void;
  subscribeWorldEvents(listener: (event: RuntimeWorldEvent) => void): () => void;
  subscribeCombatResults(listener: (result: RuntimeCombatResult) => void): () => void;
  subscribeInteractResults(listener: (result: RuntimeInteractResult) => void): () => void;
  dispose(): void;
}
