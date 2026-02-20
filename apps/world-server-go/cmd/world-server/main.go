package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type runtimeInputState struct {
	MoveX   float64 `json:"moveX"`
	MoveZ   float64 `json:"moveZ"`
	Running bool    `json:"running"`
	Jump    bool    `json:"jump"`
}

type joinRuntimeRequest struct {
	WorldSeed string  `json:"worldSeed"`
	PlayerID  string  `json:"playerId"`
	StartX    float64 `json:"startX"`
	StartZ    float64 `json:"startZ"`
}

type runtimePlayerSnapshot struct {
	PlayerID string  `json:"playerId"`
	X        float64 `json:"x"`
	Z        float64 `json:"z"`
	Speed    float64 `json:"speed"`
}

type worldRuntimeSnapshot struct {
	WorldSeed string                           `json:"worldSeed"`
	Tick      int64                            `json:"tick"`
	Players   map[string]runtimePlayerSnapshot `json:"players"`
}

type runtimeBlockDelta struct {
	Action    string `json:"action"`
	ChunkX    int    `json:"chunkX"`
	ChunkZ    int    `json:"chunkZ"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Z         int    `json:"z"`
	BlockType string `json:"blockType,omitempty"`
}

type serverEnvelope struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type clientEnvelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type leavePayload struct {
	PlayerID string `json:"playerId"`
}

type inputPayload struct {
	PlayerID string            `json:"playerId"`
	Input    runtimeInputState `json:"input"`
}

type blockActionPayload struct {
	PlayerID  string `json:"playerId"`
	Action    string `json:"action"`
	ChunkX    int    `json:"chunkX"`
	ChunkZ    int    `json:"chunkZ"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Z         int    `json:"z"`
	BlockType string `json:"blockType,omitempty"`
}

type hotbarSelectPayload struct {
	PlayerID  string `json:"playerId"`
	SlotIndex int    `json:"slotIndex"`
}

type craftRequestPayload struct {
	PlayerID string `json:"playerId"`
	ActionID string `json:"actionId"`
	RecipeID string `json:"recipeId"`
	Count    int    `json:"count"`
}

type containerActionPayload struct {
	PlayerID    string `json:"playerId"`
	ActionID    string `json:"actionId"`
	ContainerID string `json:"containerId"`
	Operation   string `json:"operation"`
	ResourceID  string `json:"resourceId"`
	Amount      int    `json:"amount"`
}

type combatActionPayload struct {
	PlayerID     string   `json:"playerId"`
	ActionID     string   `json:"actionId"`
	SlotID       string   `json:"slotId"`
	Kind         string   `json:"kind"`
	TargetID     string   `json:"targetId,omitempty"`
	TargetLabel  string   `json:"targetLabel,omitempty"`
	TargetWorldX *float64 `json:"targetWorldX,omitempty"`
	TargetWorldZ *float64 `json:"targetWorldZ,omitempty"`
}

type interactActionPayload struct {
	PlayerID     string   `json:"playerId"`
	ActionID     string   `json:"actionId"`
	TargetID     string   `json:"targetId,omitempty"`
	TargetLabel  string   `json:"targetLabel,omitempty"`
	TargetWorldX *float64 `json:"targetWorldX,omitempty"`
	TargetWorldZ *float64 `json:"targetWorldZ,omitempty"`
}

type runtimeCombatResult struct {
	ActionID            string   `json:"actionId"`
	PlayerID            string   `json:"playerId"`
	SlotID              string   `json:"slotId"`
	Kind                string   `json:"kind"`
	Accepted            bool     `json:"accepted"`
	Reason              string   `json:"reason,omitempty"`
	TargetID            string   `json:"targetId,omitempty"`
	TargetLabel         string   `json:"targetLabel,omitempty"`
	TargetWorldX        *float64 `json:"targetWorldX,omitempty"`
	TargetWorldZ        *float64 `json:"targetWorldZ,omitempty"`
	CooldownRemainingMs int      `json:"cooldownRemainingMs,omitempty"`
	Tick                int64    `json:"tick"`
}

type runtimeInteractResult struct {
	ActionID     string   `json:"actionId"`
	PlayerID     string   `json:"playerId"`
	Accepted     bool     `json:"accepted"`
	Reason       string   `json:"reason,omitempty"`
	TargetID     string   `json:"targetId,omitempty"`
	TargetLabel  string   `json:"targetLabel,omitempty"`
	TargetWorldX *float64 `json:"targetWorldX,omitempty"`
	TargetWorldZ *float64 `json:"targetWorldZ,omitempty"`
	Message      string   `json:"message,omitempty"`
	Tick         int64    `json:"tick"`
}
type runtimeHotbarState struct {
	PlayerID      string   `json:"playerId"`
	SlotIDs       []string `json:"slotIds"`
	StackCounts   []int    `json:"stackCounts"`
	SelectedIndex int      `json:"selectedIndex"`
	Tick          int64    `json:"tick"`
}

type runtimeInventoryState struct {
	PlayerID  string         `json:"playerId"`
	Resources map[string]int `json:"resources"`
	Tick      int64          `json:"tick"`
}

type runtimeHealthState struct {
	PlayerID string `json:"playerId"`
	Current  int    `json:"current"`
	Max      int    `json:"max"`
	Tick     int64  `json:"tick"`
}

type runtimeEntityHealthState struct {
	TargetID           string `json:"targetId"`
	EntityType         string `json:"entityType"`
	Current            int    `json:"current"`
	Max                int    `json:"max"`
	DefeatedUntilTick  int64  `json:"defeatedUntilTick"`
	Tick               int64  `json:"tick"`
}

type runtimeCraftResult struct {
	ActionID string `json:"actionId"`
	PlayerID string `json:"playerId"`
	RecipeID string `json:"recipeId"`
	Count    int    `json:"count"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
	Tick     int64  `json:"tick"`
}

type runtimeContainerState struct {
	ContainerID string         `json:"containerId"`
	Resources   map[string]int `json:"resources"`
	Tick        int64          `json:"tick"`
}

type runtimeContainerActionResult struct {
	ActionID    string `json:"actionId"`
	PlayerID    string `json:"playerId"`
	ContainerID string `json:"containerId"`
	Operation   string `json:"operation"`
	ResourceID  string `json:"resourceId"`
	Amount      int    `json:"amount"`
	Accepted    bool   `json:"accepted"`
	Reason      string `json:"reason,omitempty"`
	Tick        int64  `json:"tick"`
}

type runtimeWorldFlagState struct {
	Flags map[string]string `json:"flags"`
	Tick  int64             `json:"tick"`
}

type runtimeSpawnHint struct {
	HintID string `json:"hintId"`
	Label  string `json:"label"`
	ChunkX int    `json:"chunkX"`
	ChunkZ int    `json:"chunkZ"`
}

type runtimeDirectiveState struct {
	StoryBeats []string           `json:"storyBeats"`
	SpawnHints []runtimeSpawnHint `json:"spawnHints"`
	Tick       int64              `json:"tick"`
}

type worldDebugState struct {
	Snapshot        worldRuntimeSnapshot    `json:"snapshot"`
	BlockDeltas     []runtimeBlockDelta     `json:"blockDeltas"`
	HotbarStates    []runtimeHotbarState    `json:"hotbarStates"`
	InventoryStates []runtimeInventoryState `json:"inventoryStates"`
	HealthStates    []runtimeHealthState    `json:"healthStates"`
	EntityHealth    []runtimeEntityHealthState `json:"entityHealth"`
	ContainerStates []runtimeContainerState `json:"containerStates"`
	WorldFlags      runtimeWorldFlagState   `json:"worldFlags"`
	DirectiveState  runtimeDirectiveState   `json:"directiveState"`
}

type debugLoadStateAck struct {
	Accepted    bool   `json:"accepted"`
	Reason      string `json:"reason,omitempty"`
	Tick        int64  `json:"tick"`
	PlayerCount int    `json:"playerCount"`
	BlockCount  int    `json:"blockCount"`
}

type spawnHintEntry struct {
	hint       runtimeSpawnHint
	expireTick int64
}

type openclawDirective struct {
	DirectiveID string         `json:"directiveId"`
	WorldSeed   string         `json:"worldSeed"`
	Type        string         `json:"type"`
	Payload     map[string]any `json:"payload"`
	IssuedTick  int64          `json:"issuedTick"`
	ExpireTick  int64          `json:"expireTick"`
}

type openclawDirectiveRequest struct {
	DirectiveID string         `json:"directiveId"`
	WorldSeed   string         `json:"worldSeed"`
	Type        string         `json:"type"`
	TTLTicks    int64          `json:"ttlTicks"`
	Payload     map[string]any `json:"payload"`
}

type openclawDirectiveAck struct {
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
	Queued   int    `json:"queued"`
	Tick     int64  `json:"tick"`
}

type openclawCursor struct {
	Seq       int64
	UpdatedAt time.Time
}

type worldEvent struct {
	Seq      int64          `json:"seq"`
	Tick     int64          `json:"tick"`
	Type     string         `json:"type"`
	PlayerID string         `json:"playerId,omitempty"`
	Payload  map[string]any `json:"payload,omitempty"`
}

type worldEventFeed struct {
	Events []worldEvent `json:"events"`
	Next   int64        `json:"next"`
}

const (
	maxOpenClawEvents         = 512
	maxOpenClawCursors        = 128
	maxQueuedDirectives       = 128
	maxDirectivesPerTick      = 10
	defaultDirectiveTTLTicks  = 240
	maxDirectiveTTLTicks      = 2000
	combatReplicationRadius   = 48.0
	snapshotReplicationRadius = 160.0
	blockDeltaChunkRadius     = 2
	chunkGridCells            = 16
	worldChunkSize            = 64.0
	defaultSpawnHintTTLTicks  = 600
	maxSpawnHintTTLTicks      = 4000
	terrainMaxHeight          = 8
	npcWanderRadiusMin        = 0.6
	npcWanderRadiusMax        = 1.8
	npcWanderSpeedMin         = 0.02
	npcWanderSpeedMax         = 0.06
	npcWanderSwayMin          = 0.8
	npcWanderSwayMax          = 1.4
	interactionRange          = 3.4
	defaultPlayerMaxHealth    = 10
	entityRespawnTicks        = 600
	npcMaxHealth              = 6
	wildMonMaxHealth          = 8
)

type combatSlotConfig struct {
	kind           string
	cooldownTicks  int64
	maxRange       float64
	requiresTarget bool
	damage         int
	heal           int
}

var combatSlotConfigs = map[string]combatSlotConfig{
	"slot-1-rust-blade": {kind: "melee", cooldownTicks: 12, maxRange: 3.4, requiresTarget: true, damage: 2},
	"slot-2-ember-bolt": {kind: "spell", cooldownTicks: 20, maxRange: 11.5, requiresTarget: true, damage: 3},
	"slot-3-frost-bind": {kind: "spell", cooldownTicks: 29, maxRange: 8.5, requiresTarget: true, damage: 2},
	"slot-4-bandage":    {kind: "item", cooldownTicks: 42, maxRange: 0, requiresTarget: false, heal: 2},
	"slot-5-bomb":       {kind: "item", cooldownTicks: 33, maxRange: 9.5, requiresTarget: true, damage: 4},
}

var defaultHotbarSlotIDs = []string{
	"slot-1-rust-blade",
	"slot-2-ember-bolt",
	"slot-3-frost-bind",
	"slot-4-bandage",
	"slot-5-bomb",
}

type craftIngredient struct {
	resourceID string
	amount     int
}

type craftOutput struct {
	targetSlotID string
	resourceID   string
	amount       int
}

type craftRecipeConfig struct {
	id          string
	ingredients []craftIngredient
	output      craftOutput
}

var craftRecipeConfigs = map[string]craftRecipeConfig{
	"craft-bandage": {
		id: "craft-bandage",
		ingredients: []craftIngredient{
			{resourceID: "fiber", amount: 2},
			{resourceID: "salvage", amount: 1},
		},
		output: craftOutput{
			targetSlotID: "slot-4-bandage",
			amount:       1,
		},
	},
	"craft-bomb": {
		id: "craft-bomb",
		ingredients: []craftIngredient{
			{resourceID: "coal", amount: 2},
			{resourceID: "fiber", amount: 1},
		},
		output: craftOutput{
			targetSlotID: "slot-5-bomb",
			amount:       1,
		},
	},
	"craft-charcoal": {
		id: "craft-charcoal",
		ingredients: []craftIngredient{
			{resourceID: "wood", amount: 2},
		},
		output: craftOutput{
			resourceID: "coal",
			amount:     1,
		},
	},
	"craft-iron-ingot": {
		id: "craft-iron-ingot",
		ingredients: []craftIngredient{
			{resourceID: "iron_ore", amount: 2},
			{resourceID: "coal", amount: 1},
		},
		output: craftOutput{
			resourceID: "iron_ingot",
			amount:     1,
		},
	},
}

var runtimeResourceIDs = []string{
	"salvage",
	"wood",
	"stone",
	"fiber",
	"coal",
	"iron_ore",
	"iron_ingot",
}

const worldSharedContainerID = "world:camp-shared"

type playerState struct {
	PlayerID string
	X        float64
	Z        float64
	Input    runtimeInputState
}

type clientConn struct {
	conn      *websocket.Conn
	writeMu   sync.Mutex
	playerIDs map[string]struct{}
}

type worldHub struct {
	mu sync.Mutex

	worldSeed string
	tick      int64

	players            map[string]*playerState
	placed             map[string]string
	removed            map[string]bool
	combatCooldownTick map[string]map[string]int64
	hotbarStates       map[string]runtimeHotbarState
	inventoryStates    map[string]runtimeInventoryState
	healthStates       map[string]runtimeHealthState
	entityHealth       map[string]runtimeEntityHealthState
	containerStates    map[string]runtimeContainerState
	eventSeq           int64
	eventLog           []worldEvent
	worldFlags         map[string]string
	storyBeats         []string
	spawnHints         map[string]spawnHintEntry
	directiveQueue     []openclawDirective
	directiveSeen      map[string]struct{}
	clients            map[*clientConn]struct{}

	tickRateHz    float64
	walkSpeed     float64
	runMultiplier float64

	directiveBudgetTick  int64
	directiveBudgetCount int

	eventCursors map[string]openclawCursor
}

func newWorldHub() *worldHub {
	return &worldHub{
		worldSeed:          "default-seed",
		players:            make(map[string]*playerState),
		placed:             make(map[string]string),
		removed:            make(map[string]bool),
		combatCooldownTick: make(map[string]map[string]int64),
		hotbarStates:       make(map[string]runtimeHotbarState),
		inventoryStates:    make(map[string]runtimeInventoryState),
		healthStates:       make(map[string]runtimeHealthState),
		entityHealth:       make(map[string]runtimeEntityHealthState),
		containerStates:    make(map[string]runtimeContainerState),
		eventLog:           make([]worldEvent, 0, maxOpenClawEvents),
		worldFlags:         make(map[string]string),
		storyBeats:         make([]string, 0, 32),
		spawnHints:         make(map[string]spawnHintEntry),
		directiveQueue:     make([]openclawDirective, 0, maxQueuedDirectives),
		directiveSeen:      make(map[string]struct{}),
		clients:            make(map[*clientConn]struct{}),
		eventCursors:       make(map[string]openclawCursor),
		tickRateHz:         20,
		walkSpeed:          6,
		runMultiplier:      1.35,
	}
}

func (h *worldHub) addClient(client *clientConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = struct{}{}
}

func (h *worldHub) removeClient(client *clientConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, client)
	for playerID := range client.playerIDs {
		if player, ok := h.players[playerID]; ok {
			player.Input = runtimeInputState{}
		}
	}
}

func (h *worldHub) handleJoin(client *clientConn, join joinRuntimeRequest) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if join.WorldSeed != "" {
		h.worldSeed = join.WorldSeed
	}
	if existing, ok := h.players[join.PlayerID]; ok {
		existing.Input = runtimeInputState{}
	} else {
		h.players[join.PlayerID] = &playerState{
			PlayerID: join.PlayerID,
			X:        join.StartX,
			Z:        join.StartZ,
		}
	}
	client.playerIDs[join.PlayerID] = struct{}{}
	h.ensureHotbarStateLocked(join.PlayerID)
	h.ensureInventoryStateLocked(join.PlayerID)
	h.ensureHealthStateLocked(join.PlayerID)
	h.ensureContainerStateLocked(worldSharedContainerID)
	h.ensureContainerStateLocked(playerPrivateContainerID(join.PlayerID))
	h.recordWorldEventLocked("player_joined", join.PlayerID, map[string]any{
		"x": join.StartX,
		"z": join.StartZ,
	})
}

func (h *worldHub) handleLeave(playerID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.players, playerID)
	delete(h.combatCooldownTick, playerID)
	delete(h.hotbarStates, playerID)
	delete(h.inventoryStates, playerID)
	delete(h.healthStates, playerID)
	h.recordWorldEventLocked("player_left", playerID, nil)
}

func (h *worldHub) handleInput(payload inputPayload) {
	h.mu.Lock()
	defer h.mu.Unlock()
	player, ok := h.players[payload.PlayerID]
	if !ok {
		return
	}
	player.Input = runtimeInputState{
		MoveX:   sanitizeNumber(payload.Input.MoveX),
		MoveZ:   sanitizeNumber(payload.Input.MoveZ),
		Running: payload.Input.Running,
		Jump:    payload.Input.Jump,
	}
}

func (h *worldHub) applyBlockAction(payload blockActionPayload) (runtimeBlockDelta, bool) {
	if payload.Action != "break" && payload.Action != "place" {
		return runtimeBlockDelta{}, false
	}
	if payload.Y < 0 || payload.Y > 64 {
		return runtimeBlockDelta{}, false
	}
	if payload.X < 0 || payload.X > 64 || payload.Z < 0 || payload.Z > 64 {
		return runtimeBlockDelta{}, false
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	key := blockKey(payload.ChunkX, payload.ChunkZ, payload.X, payload.Y, payload.Z)

	if payload.Action == "break" {
		delete(h.placed, key)
		h.removed[key] = true
		h.recordWorldEventLocked("block_broken", payload.PlayerID, map[string]any{
			"chunkX": payload.ChunkX,
			"chunkZ": payload.ChunkZ,
			"x":      payload.X,
			"y":      payload.Y,
			"z":      payload.Z,
		})
		return runtimeBlockDelta{
			Action: "break",
			ChunkX: payload.ChunkX,
			ChunkZ: payload.ChunkZ,
			X:      payload.X,
			Y:      payload.Y,
			Z:      payload.Z,
		}, true
	}

	blockType := payload.BlockType
	if blockType == "" {
		blockType = "dirt"
	}
	h.placed[key] = blockType
	delete(h.removed, key)
	h.recordWorldEventLocked("block_placed", payload.PlayerID, map[string]any{
		"chunkX":    payload.ChunkX,
		"chunkZ":    payload.ChunkZ,
		"x":         payload.X,
		"y":         payload.Y,
		"z":         payload.Z,
		"blockType": blockType,
	})
	return runtimeBlockDelta{
		Action:    "place",
		ChunkX:    payload.ChunkX,
		ChunkZ:    payload.ChunkZ,
		X:         payload.X,
		Y:         payload.Y,
		Z:         payload.Z,
		BlockType: blockType,
	}, true
}

func (h *worldHub) applyCombatAction(payload combatActionPayload) (runtimeCombatResult, []runtimeHealthState, []runtimeInventoryState, []worldEvent) {
	result := runtimeCombatResult{
		ActionID:     payload.ActionID,
		PlayerID:     payload.PlayerID,
		SlotID:       payload.SlotID,
		Kind:         payload.Kind,
		TargetID:     strings.TrimSpace(payload.TargetID),
		TargetLabel:  strings.TrimSpace(payload.TargetLabel),
		TargetWorldX: payload.TargetWorldX,
		TargetWorldZ: payload.TargetWorldZ,
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	healthUpdates := make([]runtimeHealthState, 0, 2)
	inventoryUpdates := make([]runtimeInventoryState, 0, 1)
	worldEvents := make([]worldEvent, 0, 1)
	result.Tick = h.tick

	if payload.PlayerID == "" || payload.ActionID == "" || payload.SlotID == "" || payload.Kind == "" {
		result.Accepted = false
		result.Reason = "invalid_payload"
		h.recordCombatEventLocked(result)
		return result, healthUpdates, inventoryUpdates, worldEvents
	}

	player, ok := h.players[payload.PlayerID]
	if !ok {
		result.Accepted = false
		result.Reason = "player_not_found"
		h.recordCombatEventLocked(result)
		return result, healthUpdates, inventoryUpdates, worldEvents
	}

	slotConfig, ok := combatSlotConfigs[payload.SlotID]
	if !ok {
		result.Accepted = false
		result.Reason = "invalid_slot"
		h.recordCombatEventLocked(result)
		return result, healthUpdates, inventoryUpdates, worldEvents
	}
	if payload.Kind != slotConfig.kind {
		result.Accepted = false
		result.Reason = "invalid_slot_kind"
		h.recordCombatEventLocked(result)
		return result, healthUpdates, inventoryUpdates, worldEvents
	}
	hotbarState := h.ensureHotbarStateLocked(payload.PlayerID)
	slotIndex := hotbarSlotIndex(hotbarState, payload.SlotID)
	if slotIndex < 0 {
		result.Accepted = false
		result.Reason = "slot_not_equipped"
		h.recordCombatEventLocked(result)
		return result, healthUpdates, inventoryUpdates, worldEvents
	}
	if slotConfig.requiresTarget {
		resolvedX, resolvedZ, resolvedByServer := h.resolveTargetCoordinatesLocked(payload.PlayerID, result.TargetID)
		switch {
		case resolvedByServer:
			result.TargetWorldX = makeFloat64Ptr(resolvedX)
			result.TargetWorldZ = makeFloat64Ptr(resolvedZ)
			if result.TargetLabel == "" {
				result.TargetLabel = result.TargetID
			}
		case payload.TargetWorldX != nil && payload.TargetWorldZ != nil:
			result.TargetWorldX = makeFloat64Ptr(sanitizeNumber(*payload.TargetWorldX))
			result.TargetWorldZ = makeFloat64Ptr(sanitizeNumber(*payload.TargetWorldZ))
		case result.TargetID != "":
			result.Accepted = false
			result.Reason = "unknown_target"
			h.recordCombatEventLocked(result)
			return result, healthUpdates, inventoryUpdates, worldEvents
		default:
			result.Accepted = false
			result.Reason = "missing_target"
			h.recordCombatEventLocked(result)
			return result, healthUpdates, inventoryUpdates, worldEvents
		}
		distance := math.Hypot(
			sanitizeNumber(*result.TargetWorldX)-player.X,
			sanitizeNumber(*result.TargetWorldZ)-player.Z,
		)
		if slotConfig.maxRange > 0 && distance > slotConfig.maxRange {
			result.Accepted = false
			result.Reason = "target_out_of_range"
			h.recordCombatEventLocked(result)
			return result, healthUpdates, inventoryUpdates, worldEvents
		}
		if result.TargetID != "" {
			if _, ok := h.players[result.TargetID]; !ok {
				if isNonPlayerTargetID(result.TargetID) && !h.isEntityAvailableLocked(result.TargetID) {
					result.Accepted = false
					result.Reason = "target_defeated"
					h.recordCombatEventLocked(result)
					return result, healthUpdates, inventoryUpdates, worldEvents
				}
			}
		}
	}

	playerCooldowns, ok := h.combatCooldownTick[payload.PlayerID]
	if !ok {
		playerCooldowns = make(map[string]int64)
		h.combatCooldownTick[payload.PlayerID] = playerCooldowns
	}

	readyAt := playerCooldowns[payload.SlotID]
	if h.tick < readyAt {
		result.Accepted = false
		result.Reason = "cooldown_active"
		remainingTicks := readyAt - h.tick
		result.CooldownRemainingMs = int(float64(remainingTicks) * (1000.0 / h.tickRateHz))
		h.recordCombatEventLocked(result)
		return result, healthUpdates, inventoryUpdates, worldEvents
	}

	if slotConfig.kind == "item" {
		remaining := hotbarState.StackCounts[slotIndex]
		if remaining <= 0 {
			result.Accepted = false
			result.Reason = "insufficient_item"
			h.recordCombatEventLocked(result)
			return result, healthUpdates, inventoryUpdates, worldEvents
		}
		hotbarState.StackCounts[slotIndex] = remaining - 1
		hotbarState.Tick = h.tick
		h.hotbarStates[payload.PlayerID] = cloneHotbarState(hotbarState)
	}

	playerCooldowns[payload.SlotID] = h.tick + slotConfig.cooldownTicks
	result.Accepted = true
	healthUpdates, inventoryUpdates, worldEvents = h.applyCombatEffectsLocked(result, slotConfig)
	h.recordCombatEventLocked(result)
	return result, healthUpdates, inventoryUpdates, worldEvents
}

func (h *worldHub) applyCombatEffectsLocked(result runtimeCombatResult, slotConfig combatSlotConfig) ([]runtimeHealthState, []runtimeInventoryState, []worldEvent) {
	updates := make([]runtimeHealthState, 0, 2)
	inventoryUpdates := make([]runtimeInventoryState, 0, 1)
	worldEvents := make([]worldEvent, 0, 1)
	if slotConfig.heal > 0 {
		state := h.ensureHealthStateLocked(result.PlayerID)
		next := state.Current + slotConfig.heal
		if next > state.Max {
			next = state.Max
		}
		if next != state.Current {
			state.Current = next
			state.Tick = h.tick
			h.healthStates[result.PlayerID] = cloneHealthState(state)
			updates = append(updates, cloneHealthState(state))
			h.recordWorldEventLocked("player_healed", result.PlayerID, map[string]any{
				"delta":   slotConfig.heal,
				"current": state.Current,
				"max":     state.Max,
			})
		}
	}

	if slotConfig.damage > 0 && result.TargetID != "" {
		if _, ok := h.players[result.TargetID]; ok {
			state := h.ensureHealthStateLocked(result.TargetID)
			next := state.Current - slotConfig.damage
			if next < 0 {
				next = 0
			}
			if next != state.Current {
				state.Current = next
				state.Tick = h.tick
				h.healthStates[result.TargetID] = cloneHealthState(state)
				updates = append(updates, cloneHealthState(state))
				h.recordWorldEventLocked("player_damaged", result.TargetID, map[string]any{
					"delta":   -slotConfig.damage,
					"current": state.Current,
					"max":     state.Max,
					"source":  result.PlayerID,
					"slotId":  result.SlotID,
				})
			}
		} else {
			entityState, ok, defeatedNow := h.applyEntityDamageLocked(result.TargetID, slotConfig.damage)
			if ok {
				h.recordWorldEventLocked("entity_damaged", result.PlayerID, map[string]any{
					"targetId":    entityState.TargetID,
					"entityType":  entityState.EntityType,
					"current":     entityState.Current,
					"max":         entityState.Max,
					"source":      result.PlayerID,
					"slotId":      result.SlotID,
					"respawnTick": entityState.DefeatedUntilTick,
				})
				if defeatedNow {
					loot := resolveEntityLoot(entityState.TargetID, entityState.EntityType, h.tick)
					if inventoryState, changed := h.awardInventoryResourcesLocked(result.PlayerID, loot); changed {
						inventoryUpdates = append(inventoryUpdates, inventoryState)
					}
					eventPayload := map[string]any{
						"targetId":    entityState.TargetID,
						"entityType":  entityState.EntityType,
						"source":      result.PlayerID,
						"slotId":      result.SlotID,
						"respawnTick": entityState.DefeatedUntilTick,
						"loot":        loot,
					}
					event := h.recordWorldEventLocked("entity_defeated", result.PlayerID, eventPayload)
					worldEvents = append(worldEvents, event)
				}
			}
		}
	}

	return updates, inventoryUpdates, worldEvents
}

func (h *worldHub) applyInteractAction(payload interactActionPayload) runtimeInteractResult {
	result := runtimeInteractResult{
		ActionID:     payload.ActionID,
		PlayerID:     payload.PlayerID,
		TargetID:     strings.TrimSpace(payload.TargetID),
		TargetLabel:  strings.TrimSpace(payload.TargetLabel),
		TargetWorldX: payload.TargetWorldX,
		TargetWorldZ: payload.TargetWorldZ,
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	result.Tick = h.tick

	if payload.PlayerID == "" || payload.ActionID == "" {
		result.Accepted = false
		result.Reason = "invalid_payload"
		return result
	}

	player, ok := h.players[payload.PlayerID]
	if !ok {
		result.Accepted = false
		result.Reason = "player_not_found"
		return result
	}

	if result.TargetID != "" {
		resolvedX, resolvedZ, resolvedByServer := h.resolveTargetCoordinatesLocked(payload.PlayerID, result.TargetID)
		if resolvedByServer {
			result.TargetWorldX = makeFloat64Ptr(resolvedX)
			result.TargetWorldZ = makeFloat64Ptr(resolvedZ)
			if result.TargetLabel == "" {
				result.TargetLabel = result.TargetID
			}
		} else if payload.TargetWorldX == nil || payload.TargetWorldZ == nil {
			result.Accepted = false
			result.Reason = "unknown_target"
			return result
		}
	} else if payload.TargetWorldX == nil || payload.TargetWorldZ == nil {
		result.Accepted = false
		result.Reason = "missing_target"
		return result
	}

	if result.TargetWorldX == nil || result.TargetWorldZ == nil {
		result.Accepted = false
		result.Reason = "missing_target"
		return result
	}

	distance := math.Hypot(sanitizeNumber(*result.TargetWorldX)-player.X, sanitizeNumber(*result.TargetWorldZ)-player.Z)
	if distance > interactionRange {
		result.Accepted = false
		result.Reason = "target_out_of_range"
		return result
	}

	result.Accepted = true
	if result.TargetLabel != "" {
		result.Message = result.TargetLabel + " acknowledges you."
	} else {
		result.Message = "Interaction accepted."
	}
	h.recordWorldEventLocked("interaction", payload.PlayerID, map[string]any{
		"targetId":    result.TargetID,
		"targetLabel": result.TargetLabel,
		"distance":    distance,
	})
	return result
}

func (h *worldHub) resolveTargetCoordinatesLocked(actorPlayerID string, targetID string) (float64, float64, bool) {
	if targetID == "" || targetID == actorPlayerID {
		return 0, 0, false
	}
	target, ok := h.players[targetID]
	if ok {
		return target.X, target.Z, true
	}
	x, z, resolved := resolveNonPlayerTargetCoordinates(targetID, h.worldSeed, h.tick, h.tickRateHz)
	if !resolved {
		return 0, 0, false
	}
	return x, z, true
}

func (h *worldHub) applyHotbarSelection(payload hotbarSelectPayload) (runtimeHotbarState, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.players[payload.PlayerID]; !ok {
		return runtimeHotbarState{}, false
	}
	state := h.ensureHotbarStateLocked(payload.PlayerID)
	if payload.SlotIndex < 0 || payload.SlotIndex >= len(state.SlotIDs) {
		return runtimeHotbarState{}, false
	}
	state.SelectedIndex = payload.SlotIndex
	state.Tick = h.tick
	h.hotbarStates[payload.PlayerID] = cloneHotbarState(state)
	h.recordWorldEventLocked("hotbar_selected", payload.PlayerID, map[string]any{
		"slotIndex": payload.SlotIndex,
		"slotId":    state.SlotIDs[payload.SlotIndex],
	})
	return cloneHotbarState(state), true
}

func (h *worldHub) hotbarStateForPlayer(playerID string) (runtimeHotbarState, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.players[playerID]; !ok {
		return runtimeHotbarState{}, false
	}
	state := h.ensureHotbarStateLocked(playerID)
	return cloneHotbarState(state), true
}

func (h *worldHub) ensureHotbarStateLocked(playerID string) runtimeHotbarState {
	state, ok := h.hotbarStates[playerID]
	if !ok {
		state = runtimeHotbarState{
			PlayerID:      playerID,
			SlotIDs:       append([]string{}, defaultHotbarSlotIDs...),
			StackCounts:   buildDefaultHotbarStackCounts(defaultHotbarSlotIDs),
			SelectedIndex: 0,
			Tick:          h.tick,
		}
		h.hotbarStates[playerID] = cloneHotbarState(state)
		return state
	}

	if len(state.SlotIDs) == 0 {
		state.SlotIDs = append([]string{}, defaultHotbarSlotIDs...)
	}
	if len(state.StackCounts) != len(state.SlotIDs) {
		state.StackCounts = buildDefaultHotbarStackCounts(state.SlotIDs)
	}
	if state.SelectedIndex < 0 || state.SelectedIndex >= len(state.SlotIDs) {
		state.SelectedIndex = 0
	}
	state.Tick = h.tick
	h.hotbarStates[playerID] = cloneHotbarState(state)
	return state
}

func cloneHotbarState(state runtimeHotbarState) runtimeHotbarState {
	return runtimeHotbarState{
		PlayerID:      state.PlayerID,
		SlotIDs:       append([]string{}, state.SlotIDs...),
		StackCounts:   append([]int{}, state.StackCounts...),
		SelectedIndex: state.SelectedIndex,
		Tick:          state.Tick,
	}
}

func hotbarSlotIndex(state runtimeHotbarState, slotID string) int {
	for index, candidate := range state.SlotIDs {
		if candidate == slotID {
			return index
		}
	}
	return -1
}

func buildDefaultHotbarStackCounts(slotIDs []string) []int {
	counts := make([]int, len(slotIDs))
	for index, slotID := range slotIDs {
		counts[index] = defaultStackCountForSlot(slotID)
	}
	return counts
}

func defaultStackCountForSlot(slotID string) int {
	switch slotID {
	case "slot-4-bandage":
		return 3
	case "slot-5-bomb":
		return 2
	default:
		return 0
	}
}

func (h *worldHub) inventoryStateForPlayer(playerID string) (runtimeInventoryState, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.players[playerID]; !ok {
		return runtimeInventoryState{}, false
	}
	state := h.ensureInventoryStateLocked(playerID)
	return cloneInventoryState(state), true
}

func (h *worldHub) healthStateForPlayer(playerID string) (runtimeHealthState, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.players[playerID]; !ok {
		return runtimeHealthState{}, false
	}
	state := h.ensureHealthStateLocked(playerID)
	return cloneHealthState(state), true
}

func (h *worldHub) ensureInventoryStateLocked(playerID string) runtimeInventoryState {
	state, ok := h.inventoryStates[playerID]
	if !ok {
		state = runtimeInventoryState{
			PlayerID:  playerID,
			Resources: buildDefaultResourceMap(),
			Tick:      h.tick,
		}
		h.inventoryStates[playerID] = cloneInventoryState(state)
		return state
	}
	state.Resources = normalizeResourceMap(state.Resources)
	state.Tick = h.tick
	h.inventoryStates[playerID] = cloneInventoryState(state)
	return state
}

func (h *worldHub) ensureHealthStateLocked(playerID string) runtimeHealthState {
	state, ok := h.healthStates[playerID]
	if !ok {
		state = runtimeHealthState{
			PlayerID: playerID,
			Current:  defaultPlayerMaxHealth,
			Max:      defaultPlayerMaxHealth,
			Tick:     h.tick,
		}
		h.healthStates[playerID] = cloneHealthState(state)
		return state
	}
	if state.Max <= 0 {
		state.Max = defaultPlayerMaxHealth
	}
	if state.Current > state.Max {
		state.Current = state.Max
	}
	if state.Current < 0 {
		state.Current = 0
	}
	state.Tick = h.tick
	h.healthStates[playerID] = cloneHealthState(state)
	return state
}

func resolveEntityBaseHealth(entityType string) (int, bool) {
	switch entityType {
	case "npc":
		return npcMaxHealth, true
	case "wild-mon":
		return wildMonMaxHealth, true
	default:
		return 0, false
	}
}

func (h *worldHub) ensureEntityHealthLocked(targetID string) (runtimeEntityHealthState, bool) {
	_, _, entityType, _, ok := parseTargetID(targetID)
	if !ok {
		return runtimeEntityHealthState{}, false
	}
	baseHealth, ok := resolveEntityBaseHealth(entityType)
	if !ok {
		return runtimeEntityHealthState{}, false
	}
	state, ok := h.entityHealth[targetID]
	if !ok {
		state = runtimeEntityHealthState{
			TargetID:          targetID,
			EntityType:        entityType,
			Current:           baseHealth,
			Max:               baseHealth,
			DefeatedUntilTick: 0,
			Tick:              h.tick,
		}
		h.entityHealth[targetID] = state
		return state, true
	}
	if state.Max <= 0 {
		state.Max = baseHealth
	}
	if state.DefeatedUntilTick > 0 && h.tick >= state.DefeatedUntilTick {
		state.Current = state.Max
		state.DefeatedUntilTick = 0
	}
	if state.Current > state.Max {
		state.Current = state.Max
	}
	if state.Current < 0 {
		state.Current = 0
	}
	state.Tick = h.tick
	h.entityHealth[targetID] = state
	return state, true
}

func (h *worldHub) isEntityAvailableLocked(targetID string) bool {
	state, ok := h.ensureEntityHealthLocked(targetID)
	if !ok {
		return false
	}
	if state.DefeatedUntilTick > h.tick && state.Current <= 0 {
		return false
	}
	return true
}

func (h *worldHub) applyEntityDamageLocked(targetID string, damage int) (runtimeEntityHealthState, bool, bool) {
	if damage <= 0 {
		return runtimeEntityHealthState{}, false, false
	}
	state, ok := h.ensureEntityHealthLocked(targetID)
	if !ok {
		return runtimeEntityHealthState{}, false, false
	}
	if state.DefeatedUntilTick > h.tick && state.Current <= 0 {
		return state, true, false
	}
	next := state.Current - damage
	if next < 0 {
		next = 0
	}
	defeatedNow := state.Current > 0 && next == 0
	state.Current = next
	state.Tick = h.tick
	if defeatedNow {
		state.DefeatedUntilTick = h.tick + entityRespawnTicks
	}
	h.entityHealth[targetID] = state
	return state, true, defeatedNow
}

func (h *worldHub) awardInventoryResource(playerID string, resource string, amount int) (runtimeInventoryState, bool) {
	if resource == "" || amount <= 0 {
		return runtimeInventoryState{}, false
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.players[playerID]; !ok {
		return runtimeInventoryState{}, false
	}
	state := h.ensureInventoryStateLocked(playerID)
	state.Resources[resource] = state.Resources[resource] + amount
	state.Tick = h.tick
	h.inventoryStates[playerID] = cloneInventoryState(state)
	h.recordWorldEventLocked("inventory_updated", playerID, map[string]any{
		"resource": resource,
		"amount":   amount,
		"total":    state.Resources[resource],
	})
	return cloneInventoryState(state), true
}

func (h *worldHub) awardInventoryResources(playerID string, grants map[string]int) (runtimeInventoryState, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.players[playerID]; !ok {
		return runtimeInventoryState{}, false
	}
	state := h.ensureInventoryStateLocked(playerID)
	changed := false
	for resource, amount := range grants {
		if resource == "" || amount <= 0 {
			continue
		}
		state.Resources[resource] = state.Resources[resource] + amount
		changed = true
		h.recordWorldEventLocked("inventory_updated", playerID, map[string]any{
			"resource": resource,
			"amount":   amount,
			"total":    state.Resources[resource],
		})
	}
	if !changed {
		return runtimeInventoryState{}, false
	}
	state.Tick = h.tick
	h.inventoryStates[playerID] = cloneInventoryState(state)
	return cloneInventoryState(state), true
}

func (h *worldHub) awardInventoryResourcesLocked(playerID string, grants map[string]int) (runtimeInventoryState, bool) {
	if _, ok := h.players[playerID]; !ok {
		return runtimeInventoryState{}, false
	}
	state := h.ensureInventoryStateLocked(playerID)
	changed := false
	for resource, amount := range grants {
		if resource == "" || amount <= 0 {
			continue
		}
		state.Resources[resource] = state.Resources[resource] + amount
		changed = true
	}
	if !changed {
		return runtimeInventoryState{}, false
	}
	state.Tick = h.tick
	h.inventoryStates[playerID] = cloneInventoryState(state)
	return cloneInventoryState(state), true
}

func (h *worldHub) applyCraftRequest(
	payload craftRequestPayload,
) (runtimeCraftResult, *runtimeInventoryState, *runtimeHotbarState) {
	result := runtimeCraftResult{
		ActionID: payload.ActionID,
		PlayerID: payload.PlayerID,
		RecipeID: payload.RecipeID,
		Count:    payload.Count,
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	result.Tick = h.tick

	if payload.PlayerID == "" || payload.ActionID == "" || payload.RecipeID == "" || payload.Count <= 0 {
		result.Accepted = false
		result.Reason = "invalid_payload"
		h.recordCraftEventLocked(result)
		return result, nil, nil
	}
	if _, ok := h.players[payload.PlayerID]; !ok {
		result.Accepted = false
		result.Reason = "player_not_found"
		h.recordCraftEventLocked(result)
		return result, nil, nil
	}

	recipe, ok := craftRecipeConfigs[payload.RecipeID]
	if !ok {
		result.Accepted = false
		result.Reason = "invalid_recipe"
		h.recordCraftEventLocked(result)
		return result, nil, nil
	}

	inventoryState := h.ensureInventoryStateLocked(payload.PlayerID)
	for _, ingredient := range recipe.ingredients {
		requiredTotal := ingredient.amount * payload.Count
		if inventoryState.Resources[ingredient.resourceID] < requiredTotal {
			result.Accepted = false
			result.Reason = "insufficient_resources"
			h.recordCraftEventLocked(result)
			return result, nil, nil
		}
	}

	var hotbarState runtimeHotbarState
	var outputSlotIndex int
	if recipe.output.targetSlotID != "" {
		hotbarState = h.ensureHotbarStateLocked(payload.PlayerID)
		outputSlotIndex = hotbarSlotIndex(hotbarState, recipe.output.targetSlotID)
		if outputSlotIndex < 0 {
			result.Accepted = false
			result.Reason = "craft_target_slot_missing"
			h.recordCraftEventLocked(result)
			return result, nil, nil
		}
	}

	for _, ingredient := range recipe.ingredients {
		requiredTotal := ingredient.amount * payload.Count
		inventoryState.Resources[ingredient.resourceID] = inventoryState.Resources[ingredient.resourceID] - requiredTotal
	}

	inventoryState.Tick = h.tick
	h.inventoryStates[payload.PlayerID] = cloneInventoryState(inventoryState)

	inventoryCopy := cloneInventoryState(inventoryState)
	var hotbarCopy *runtimeHotbarState

	if recipe.output.targetSlotID != "" {
		hotbarState.StackCounts[outputSlotIndex] = hotbarState.StackCounts[outputSlotIndex] + (recipe.output.amount * payload.Count)
		hotbarState.Tick = h.tick
		h.hotbarStates[payload.PlayerID] = cloneHotbarState(hotbarState)
		hotbarSnapshot := cloneHotbarState(hotbarState)
		hotbarCopy = &hotbarSnapshot
	} else if recipe.output.resourceID != "" {
		inventoryState.Resources[recipe.output.resourceID] = inventoryState.Resources[recipe.output.resourceID] + (recipe.output.amount * payload.Count)
		inventoryState.Tick = h.tick
		h.inventoryStates[payload.PlayerID] = cloneInventoryState(inventoryState)
		inventoryCopy = cloneInventoryState(inventoryState)
	}

	result.Accepted = true
	h.recordCraftEventLocked(result)
	return result, &inventoryCopy, hotbarCopy
}

func cloneInventoryState(state runtimeInventoryState) runtimeInventoryState {
	resources := make(map[string]int, len(state.Resources))
	for key, value := range state.Resources {
		resources[key] = value
	}
	return runtimeInventoryState{
		PlayerID:  state.PlayerID,
		Resources: resources,
		Tick:      state.Tick,
	}
}

func cloneHealthState(state runtimeHealthState) runtimeHealthState {
	return runtimeHealthState{
		PlayerID: state.PlayerID,
		Current:  state.Current,
		Max:      state.Max,
		Tick:     state.Tick,
	}
}

func buildDefaultResourceMap() map[string]int {
	resources := make(map[string]int, len(runtimeResourceIDs))
	for _, resourceID := range runtimeResourceIDs {
		resources[resourceID] = 0
	}
	return resources
}

func normalizeResourceMap(resources map[string]int) map[string]int {
	normalized := buildDefaultResourceMap()
	for resourceID, value := range resources {
		if _, exists := normalized[resourceID]; exists {
			normalized[resourceID] = value
		}
	}
	return normalized
}

func cloneResourceMap(resources map[string]int) map[string]int {
	cloned := make(map[string]int, len(resources))
	for key, value := range resources {
		cloned[key] = value
	}
	return cloned
}

func (h *worldHub) containerState(containerID string) (runtimeContainerState, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if containerID == "" {
		return runtimeContainerState{}, false
	}
	state := h.ensureContainerStateLocked(containerID)
	return cloneContainerState(state), true
}

func (h *worldHub) ensureContainerStateLocked(containerID string) runtimeContainerState {
	state, ok := h.containerStates[containerID]
	if !ok {
		state = runtimeContainerState{
			ContainerID: containerID,
			Resources:   buildDefaultResourceMap(),
			Tick:        h.tick,
		}
		h.containerStates[containerID] = cloneContainerState(state)
		return state
	}
	state.Resources = normalizeResourceMap(state.Resources)
	state.Tick = h.tick
	h.containerStates[containerID] = cloneContainerState(state)
	return state
}

func cloneContainerState(state runtimeContainerState) runtimeContainerState {
	resources := make(map[string]int, len(state.Resources))
	for key, value := range state.Resources {
		resources[key] = value
	}
	return runtimeContainerState{
		ContainerID: state.ContainerID,
		Resources:   resources,
		Tick:        state.Tick,
	}
}

func playerPrivateContainerID(playerID string) string {
	return "player:" + playerID + ":stash"
}

func canAccessContainer(playerID string, containerID string) bool {
	if strings.HasPrefix(containerID, "world:") {
		return true
	}
	prefix := "player:"
	suffix := ":stash"
	if strings.HasPrefix(containerID, prefix) && strings.HasSuffix(containerID, suffix) {
		owner := strings.TrimSuffix(strings.TrimPrefix(containerID, prefix), suffix)
		return owner == playerID
	}
	return false
}

func (h *worldHub) applyContainerAction(
	payload containerActionPayload,
) (runtimeContainerActionResult, *runtimeInventoryState, *runtimeContainerState) {
	result := runtimeContainerActionResult{
		ActionID:    payload.ActionID,
		PlayerID:    payload.PlayerID,
		ContainerID: payload.ContainerID,
		Operation:   payload.Operation,
		ResourceID:  payload.ResourceID,
		Amount:      payload.Amount,
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	result.Tick = h.tick

	if payload.PlayerID == "" || payload.ActionID == "" || payload.ContainerID == "" || payload.ResourceID == "" || payload.Amount <= 0 {
		result.Accepted = false
		result.Reason = "invalid_payload"
		h.recordContainerEventLocked(result)
		return result, nil, nil
	}
	if _, ok := h.players[payload.PlayerID]; !ok {
		result.Accepted = false
		result.Reason = "player_not_found"
		h.recordContainerEventLocked(result)
		return result, nil, nil
	}
	if !canAccessContainer(payload.PlayerID, payload.ContainerID) {
		result.Accepted = false
		result.Reason = "container_forbidden"
		h.recordContainerEventLocked(result)
		return result, nil, nil
	}
	if payload.Operation != "deposit" && payload.Operation != "withdraw" {
		result.Accepted = false
		result.Reason = "invalid_operation"
		h.recordContainerEventLocked(result)
		return result, nil, nil
	}

	inventoryState := h.ensureInventoryStateLocked(payload.PlayerID)
	containerState := h.ensureContainerStateLocked(payload.ContainerID)

	playerAmount := inventoryState.Resources[payload.ResourceID]
	containerAmount := containerState.Resources[payload.ResourceID]

	if payload.Operation == "deposit" {
		if playerAmount < payload.Amount {
			result.Accepted = false
			result.Reason = "insufficient_resources"
			h.recordContainerEventLocked(result)
			return result, nil, nil
		}
		inventoryState.Resources[payload.ResourceID] = playerAmount - payload.Amount
		containerState.Resources[payload.ResourceID] = containerAmount + payload.Amount
	} else {
		if containerAmount < payload.Amount {
			result.Accepted = false
			result.Reason = "container_insufficient_resources"
			h.recordContainerEventLocked(result)
			return result, nil, nil
		}
		inventoryState.Resources[payload.ResourceID] = playerAmount + payload.Amount
		containerState.Resources[payload.ResourceID] = containerAmount - payload.Amount
	}

	inventoryState.Tick = h.tick
	containerState.Tick = h.tick
	h.inventoryStates[payload.PlayerID] = cloneInventoryState(inventoryState)
	h.containerStates[payload.ContainerID] = cloneContainerState(containerState)
	result.Accepted = true
	h.recordContainerEventLocked(result)

	inventoryCopy := cloneInventoryState(inventoryState)
	containerCopy := cloneContainerState(containerState)
	return result, &inventoryCopy, &containerCopy
}

func (h *worldHub) recordCombatEventLocked(result runtimeCombatResult) {
	eventType := "combat_rejected"
	if result.Accepted {
		eventType = "combat_confirmed"
	}
	payload := map[string]any{
		"actionId": result.ActionID,
		"slotId":   result.SlotID,
		"kind":     result.Kind,
	}
	if result.Reason != "" {
		payload["reason"] = result.Reason
	}
	if result.TargetID != "" {
		payload["targetId"] = result.TargetID
	}
	if result.TargetLabel != "" {
		payload["targetLabel"] = result.TargetLabel
	}
	if result.CooldownRemainingMs > 0 {
		payload["cooldownRemainingMs"] = result.CooldownRemainingMs
	}
	h.recordWorldEventLocked(eventType, result.PlayerID, payload)
}

func (h *worldHub) recordCraftEventLocked(result runtimeCraftResult) {
	eventType := "craft_rejected"
	if result.Accepted {
		eventType = "craft_completed"
	}
	payload := map[string]any{
		"actionId": result.ActionID,
		"recipeId": result.RecipeID,
		"count":    result.Count,
	}
	if result.Reason != "" {
		payload["reason"] = result.Reason
	}
	h.recordWorldEventLocked(eventType, result.PlayerID, payload)
}

func (h *worldHub) recordContainerEventLocked(result runtimeContainerActionResult) {
	eventType := "container_action_rejected"
	if result.Accepted {
		eventType = "container_action_applied"
	}
	payload := map[string]any{
		"actionId":    result.ActionID,
		"containerId": result.ContainerID,
		"operation":   result.Operation,
		"resourceId":  result.ResourceID,
		"amount":      result.Amount,
	}
	if result.Reason != "" {
		payload["reason"] = result.Reason
	}
	h.recordWorldEventLocked(eventType, result.PlayerID, payload)
}

func (h *worldHub) recordWorldEventLocked(eventType string, playerID string, payload map[string]any) worldEvent {
	h.eventSeq++
	event := worldEvent{
		Seq:      h.eventSeq,
		Tick:     h.tick,
		Type:     eventType,
		PlayerID: playerID,
		Payload:  payload,
	}
	h.eventLog = append(h.eventLog, event)
	if len(h.eventLog) > maxOpenClawEvents {
		h.eventLog = h.eventLog[len(h.eventLog)-maxOpenClawEvents:]
	}
	return event
}

func (h *worldHub) ingestDirective(request openclawDirectiveRequest) openclawDirectiveAck {
	h.mu.Lock()
	defer h.mu.Unlock()

	ack := openclawDirectiveAck{
		Accepted: false,
		Queued:   len(h.directiveQueue),
		Tick:     h.tick,
	}

	if request.DirectiveID == "" || request.Type == "" {
		ack.Reason = "invalid_payload"
		return ack
	}
	if request.WorldSeed != "" && request.WorldSeed != h.worldSeed {
		ack.Reason = "world_seed_mismatch"
		return ack
	}
	if !isAllowedDirectiveType(request.Type) {
		ack.Reason = "directive_type_blocked"
		return ack
	}
	if _, exists := h.directiveSeen[request.DirectiveID]; exists {
		ack.Accepted = true
		ack.Reason = "duplicate_ignored"
		return ack
	}
	if h.directiveBudgetTick != h.tick {
		h.directiveBudgetTick = h.tick
		h.directiveBudgetCount = 0
	}
	if h.directiveBudgetCount >= maxDirectivesPerTick {
		ack.Reason = "directive_rate_limited"
		return ack
	}
	if len(h.directiveQueue) >= maxQueuedDirectives {
		ack.Reason = "directive_queue_full"
		return ack
	}

	ttl := request.TTLTicks
	if ttl <= 0 {
		ttl = defaultDirectiveTTLTicks
	}
	if ttl > maxDirectiveTTLTicks {
		ttl = maxDirectiveTTLTicks
	}

	directive := openclawDirective{
		DirectiveID: request.DirectiveID,
		WorldSeed:   h.worldSeed,
		Type:        request.Type,
		Payload:     request.Payload,
		IssuedTick:  h.tick,
		ExpireTick:  h.tick + ttl,
	}

	h.directiveSeen[directive.DirectiveID] = struct{}{}
	h.directiveQueue = append(h.directiveQueue, directive)
	h.directiveBudgetCount++
	ack.Accepted = true
	ack.Queued = len(h.directiveQueue)
	h.recordWorldEventLocked("directive_queued", "openclaw", map[string]any{
		"directiveId": directive.DirectiveID,
		"type":        directive.Type,
		"expireTick":  directive.ExpireTick,
	})
	return ack
}

func (h *worldHub) listWorldEventsSince(seq int64) worldEventFeed {
	h.mu.Lock()
	defer h.mu.Unlock()

	events := make([]worldEvent, 0, len(h.eventLog))
	for _, event := range h.eventLog {
		if event.Seq > seq {
			events = append(events, event)
		}
	}

	return worldEventFeed{
		Events: events,
		Next:   h.eventSeq + 1,
	}
}

func (h *worldHub) listWorldEventsForCursor(seq int64, cursor string, limit int) worldEventFeed {
	h.mu.Lock()
	defer h.mu.Unlock()

	if cursor != "" && seq == 0 {
		if entry, ok := h.eventCursors[cursor]; ok {
			seq = entry.Seq
		}
	}

	events := make([]worldEvent, 0, len(h.eventLog))
	for _, event := range h.eventLog {
		if event.Seq > seq {
			events = append(events, event)
		}
	}

	if limit > 0 && len(events) > limit {
		events = events[:limit]
	}

	if cursor != "" {
		nextSeq := seq
		if len(events) > 0 {
			nextSeq = events[len(events)-1].Seq
		}
		h.eventCursors[cursor] = openclawCursor{
			Seq:       nextSeq,
			UpdatedAt: time.Now(),
		}
		h.pruneEventCursorsLocked()
	}

	return worldEventFeed{
		Events: events,
		Next:   h.eventSeq + 1,
	}
}

func (h *worldHub) pruneEventCursorsLocked() {
	if len(h.eventCursors) <= maxOpenClawCursors {
		return
	}
	type cursorEntry struct {
		id string
		at time.Time
	}
	entries := make([]cursorEntry, 0, len(h.eventCursors))
	for id, entry := range h.eventCursors {
		entries = append(entries, cursorEntry{id: id, at: entry.UpdatedAt})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].at.Before(entries[j].at)
	})
	for len(entries) > maxOpenClawCursors {
		delete(h.eventCursors, entries[0].id)
		entries = entries[1:]
	}
}

func (h *worldHub) applyDirectiveBudgetLocked() bool {
	if len(h.directiveQueue) == 0 {
		return false
	}

	limit := 8
	if len(h.directiveQueue) < limit {
		limit = len(h.directiveQueue)
	}

	directiveStateChanged := false
	remaining := make([]openclawDirective, 0, len(h.directiveQueue))
	for index, directive := range h.directiveQueue {
		if directive.ExpireTick <= h.tick {
			h.recordWorldEventLocked("directive_expired", "openclaw", map[string]any{
				"directiveId": directive.DirectiveID,
				"type":        directive.Type,
			})
			continue
		}
		if index >= limit {
			remaining = append(remaining, directive)
			continue
		}

		switch directive.Type {
		case "set_world_flag":
			key, _ := directive.Payload["key"].(string)
			value, _ := directive.Payload["value"].(string)
			if key != "" {
				if current, exists := h.worldFlags[key]; !exists || current != value {
					directiveStateChanged = true
				}
				h.worldFlags[key] = value
			}
		case "emit_story_beat":
			beat, _ := directive.Payload["beat"].(string)
			beat = strings.TrimSpace(beat)
			if beat != "" {
				h.storyBeats = append(h.storyBeats, beat)
				if len(h.storyBeats) > 32 {
					h.storyBeats = h.storyBeats[len(h.storyBeats)-32:]
				}
				directiveStateChanged = true
			}
		case "spawn_hint":
			hintID, _ := directive.Payload["hintId"].(string)
			hintID = strings.TrimSpace(hintID)
			if hintID == "" {
				hintID = directive.DirectiveID
			}
			action, _ := directive.Payload["action"].(string)
			action = strings.TrimSpace(strings.ToLower(action))
			if action == "remove" {
				if _, exists := h.spawnHints[hintID]; exists {
					delete(h.spawnHints, hintID)
					directiveStateChanged = true
				}
				break
			}

			chunkX, okX := intFromAny(directive.Payload["chunkX"])
			chunkZ, okZ := intFromAny(directive.Payload["chunkZ"])
			if okX && okZ {
				label, _ := directive.Payload["label"].(string)
				label = strings.TrimSpace(label)
				if label == "" {
					label = "spawn_hint"
				}
				ttlTicks, hasTTL := intFromAny(directive.Payload["ttlTicks"])
				if !hasTTL || ttlTicks <= 0 {
					ttlTicks = defaultSpawnHintTTLTicks
				}
				if ttlTicks > maxSpawnHintTTLTicks {
					ttlTicks = maxSpawnHintTTLTicks
				}
				nextHint := runtimeSpawnHint{
					HintID: hintID,
					Label:  label,
					ChunkX: chunkX,
					ChunkZ: chunkZ,
				}
				nextEntry := spawnHintEntry{
					hint:       nextHint,
					expireTick: h.tick + int64(ttlTicks),
				}
				if current, exists := h.spawnHints[hintID]; !exists || current != nextEntry {
					directiveStateChanged = true
				}
				h.spawnHints[hintID] = nextEntry
			}
		}

		h.recordWorldEventLocked("directive_applied", "openclaw", map[string]any{
			"directiveId": directive.DirectiveID,
			"type":        directive.Type,
		})
	}

	h.directiveQueue = remaining
	return directiveStateChanged
}

func (h *worldHub) snapshot() worldRuntimeSnapshot {
	h.mu.Lock()
	defer h.mu.Unlock()

	return h.snapshotLocked()
}

func (h *worldHub) snapshotForClient(client *clientConn, radius float64) worldRuntimeSnapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.snapshotForClientLocked(client, radius)
}

func (h *worldHub) snapshotLocked() worldRuntimeSnapshot {
	players := make(map[string]runtimePlayerSnapshot, len(h.players))
	for playerID, state := range h.players {
		players[playerID] = h.runtimePlayerSnapshotFromStateLocked(state)
	}

	return worldRuntimeSnapshot{
		WorldSeed: h.worldSeed,
		Tick:      h.tick,
		Players:   players,
	}
}

func (h *worldHub) snapshotForClientLocked(client *clientConn, radius float64) worldRuntimeSnapshot {
	players := make(map[string]runtimePlayerSnapshot)
	if len(h.players) == 0 {
		return worldRuntimeSnapshot{
			WorldSeed: h.worldSeed,
			Tick:      h.tick,
			Players:   players,
		}
	}

	anchors := make([]*playerState, 0, len(client.playerIDs))
	for playerID := range client.playerIDs {
		player, ok := h.players[playerID]
		if ok {
			anchors = append(anchors, player)
		}
	}

	// Before join (or when no anchored player exists), send global snapshot.
	if len(client.playerIDs) == 0 || len(anchors) == 0 {
		return h.snapshotLocked()
	}

	for playerID, state := range h.players {
		if _, owned := client.playerIDs[playerID]; owned {
			players[playerID] = h.runtimePlayerSnapshotFromStateLocked(state)
			continue
		}
		for _, anchor := range anchors {
			if math.Hypot(state.X-anchor.X, state.Z-anchor.Z) <= radius {
				players[playerID] = h.runtimePlayerSnapshotFromStateLocked(state)
				break
			}
		}
	}

	return worldRuntimeSnapshot{
		WorldSeed: h.worldSeed,
		Tick:      h.tick,
		Players:   players,
	}
}

func (h *worldHub) runtimePlayerSnapshotFromStateLocked(state *playerState) runtimePlayerSnapshot {
	moveX, moveZ := normalize(state.Input.MoveX, state.Input.MoveZ)
	speed := 0.0
	if moveX != 0 || moveZ != 0 {
		multiplier := 1.0
		if state.Input.Running {
			multiplier = h.runMultiplier
		}
		speed = h.walkSpeed * multiplier
	}
	return runtimePlayerSnapshot{
		PlayerID: state.PlayerID,
		X:        state.X,
		Z:        state.Z,
		Speed:    speed,
	}
}

func (h *worldHub) advanceOneTick() bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.tick++
	deltaSeconds := 1.0 / h.tickRateHz
	for _, state := range h.players {
		moveX, moveZ := normalize(state.Input.MoveX, state.Input.MoveZ)
		speed := h.walkSpeed
		if state.Input.Running {
			speed *= h.runMultiplier
		}
		state.X += moveX * speed * deltaSeconds
		state.Z += moveZ * speed * deltaSeconds
	}
	stateChanged := h.pruneExpiredSpawnHintsLocked()
	if h.applyDirectiveBudgetLocked() {
		stateChanged = true
	}
	return stateChanged
}

func (h *worldHub) worldFlagState() runtimeWorldFlagState {
	h.mu.Lock()
	defer h.mu.Unlock()
	flags := make(map[string]string, len(h.worldFlags))
	for key, value := range h.worldFlags {
		flags[key] = value
	}
	return runtimeWorldFlagState{
		Flags: flags,
		Tick:  h.tick,
	}
}

func (h *worldHub) worldDirectiveState() runtimeDirectiveState {
	h.mu.Lock()
	defer h.mu.Unlock()

	storyBeats := append([]string{}, h.storyBeats...)
	hintIDs := make([]string, 0, len(h.spawnHints))
	for hintID := range h.spawnHints {
		hintIDs = append(hintIDs, hintID)
	}
	sort.Strings(hintIDs)
	spawnHints := make([]runtimeSpawnHint, 0, len(hintIDs))
	for _, hintID := range hintIDs {
		spawnHints = append(spawnHints, h.spawnHints[hintID].hint)
	}

	return runtimeDirectiveState{
		StoryBeats: storyBeats,
		SpawnHints: spawnHints,
		Tick:       h.tick,
	}
}

func (h *worldHub) pruneExpiredSpawnHintsLocked() bool {
	changed := false
	for hintID, entry := range h.spawnHints {
		if entry.expireTick <= h.tick {
			delete(h.spawnHints, hintID)
			changed = true
		}
	}
	return changed
}

func (h *worldHub) exportState() worldDebugState {
	h.mu.Lock()
	defer h.mu.Unlock()

	players := make(map[string]runtimePlayerSnapshot, len(h.players))
	for playerID, state := range h.players {
		moveX, moveZ := normalize(state.Input.MoveX, state.Input.MoveZ)
		speed := 0.0
		if moveX != 0 || moveZ != 0 {
			multiplier := 1.0
			if state.Input.Running {
				multiplier = h.runMultiplier
			}
			speed = h.walkSpeed * multiplier
		}
		players[playerID] = runtimePlayerSnapshot{
			PlayerID: playerID,
			X:        state.X,
			Z:        state.Z,
			Speed:    speed,
		}
	}

	blockDeltas := make([]runtimeBlockDelta, 0, len(h.placed)+len(h.removed))
	for key, blockType := range h.placed {
		chunkX, chunkZ, x, y, z := parseBlockKey(key)
		blockDeltas = append(blockDeltas, runtimeBlockDelta{
			Action:    "place",
			ChunkX:    chunkX,
			ChunkZ:    chunkZ,
			X:         x,
			Y:         y,
			Z:         z,
			BlockType: blockType,
		})
	}
	for key := range h.removed {
		chunkX, chunkZ, x, y, z := parseBlockKey(key)
		blockDeltas = append(blockDeltas, runtimeBlockDelta{
			Action: "break",
			ChunkX: chunkX,
			ChunkZ: chunkZ,
			X:      x,
			Y:      y,
			Z:      z,
		})
	}
	sort.Slice(blockDeltas, func(left int, right int) bool {
		return compareBlockDelta(blockDeltas[left], blockDeltas[right]) < 0
	})

	hotbarPlayerIDs := make([]string, 0, len(h.hotbarStates))
	for playerID := range h.hotbarStates {
		hotbarPlayerIDs = append(hotbarPlayerIDs, playerID)
	}
	sort.Strings(hotbarPlayerIDs)
	hotbarStates := make([]runtimeHotbarState, 0, len(hotbarPlayerIDs))
	for _, playerID := range hotbarPlayerIDs {
		hotbarStates = append(hotbarStates, cloneHotbarState(h.hotbarStates[playerID]))
	}

	inventoryPlayerIDs := make([]string, 0, len(h.inventoryStates))
	for playerID := range h.inventoryStates {
		inventoryPlayerIDs = append(inventoryPlayerIDs, playerID)
	}
	sort.Strings(inventoryPlayerIDs)
	inventoryStates := make([]runtimeInventoryState, 0, len(inventoryPlayerIDs))
	for _, playerID := range inventoryPlayerIDs {
		state := h.inventoryStates[playerID]
		inventoryStates = append(inventoryStates, runtimeInventoryState{
			PlayerID:  state.PlayerID,
			Resources: cloneResourceMap(state.Resources),
			Tick:      state.Tick,
		})
	}

	healthPlayerIDs := make([]string, 0, len(h.healthStates))
	for playerID := range h.healthStates {
		healthPlayerIDs = append(healthPlayerIDs, playerID)
	}
	sort.Strings(healthPlayerIDs)
	healthStates := make([]runtimeHealthState, 0, len(healthPlayerIDs))
	for _, playerID := range healthPlayerIDs {
		state := h.healthStates[playerID]
		healthStates = append(healthStates, runtimeHealthState{
			PlayerID: state.PlayerID,
			Current:  state.Current,
			Max:      state.Max,
			Tick:     state.Tick,
		})
	}

	entityHealthIDs := make([]string, 0, len(h.entityHealth))
	for targetID := range h.entityHealth {
		entityHealthIDs = append(entityHealthIDs, targetID)
	}
	sort.Strings(entityHealthIDs)
	entityHealth := make([]runtimeEntityHealthState, 0, len(entityHealthIDs))
	for _, targetID := range entityHealthIDs {
		state := h.entityHealth[targetID]
		entityHealth = append(entityHealth, runtimeEntityHealthState{
			TargetID:          state.TargetID,
			EntityType:        state.EntityType,
			Current:           state.Current,
			Max:               state.Max,
			DefeatedUntilTick: state.DefeatedUntilTick,
			Tick:              state.Tick,
		})
	}

	containerIDs := make([]string, 0, len(h.containerStates))
	for containerID := range h.containerStates {
		containerIDs = append(containerIDs, containerID)
	}
	sort.Strings(containerIDs)
	containerStates := make([]runtimeContainerState, 0, len(containerIDs))
	for _, containerID := range containerIDs {
		state := h.containerStates[containerID]
		containerStates = append(containerStates, runtimeContainerState{
			ContainerID: state.ContainerID,
			Resources:   cloneResourceMap(state.Resources),
			Tick:        state.Tick,
		})
	}

	flags := make(map[string]string, len(h.worldFlags))
	for key, value := range h.worldFlags {
		flags[key] = value
	}

	storyBeats := append([]string{}, h.storyBeats...)
	hintIDs := make([]string, 0, len(h.spawnHints))
	for hintID := range h.spawnHints {
		hintIDs = append(hintIDs, hintID)
	}
	sort.Strings(hintIDs)
	spawnHints := make([]runtimeSpawnHint, 0, len(hintIDs))
	for _, hintID := range hintIDs {
		entry := h.spawnHints[hintID]
		if entry.expireTick <= h.tick {
			continue
		}
		spawnHints = append(spawnHints, entry.hint)
	}

	return worldDebugState{
		Snapshot: worldRuntimeSnapshot{
			WorldSeed: h.worldSeed,
			Tick:      h.tick,
			Players:   players,
		},
		BlockDeltas:     blockDeltas,
		HotbarStates:    hotbarStates,
		InventoryStates: inventoryStates,
		HealthStates:    healthStates,
		EntityHealth:    entityHealth,
		ContainerStates: containerStates,
		WorldFlags: runtimeWorldFlagState{
			Flags: flags,
			Tick:  h.tick,
		},
		DirectiveState: runtimeDirectiveState{
			StoryBeats: storyBeats,
			SpawnHints: spawnHints,
			Tick:       h.tick,
		},
	}
}

func (h *worldHub) importState(state worldDebugState) (debugLoadStateAck, error) {
	worldSeed := strings.TrimSpace(state.Snapshot.WorldSeed)
	if worldSeed == "" {
		return debugLoadStateAck{}, fmt.Errorf("invalid_world_seed")
	}
	if state.Snapshot.Tick < 0 {
		return debugLoadStateAck{}, fmt.Errorf("invalid_tick")
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	nextPlayers := make(map[string]*playerState, len(state.Snapshot.Players))
	for playerID, snapshot := range state.Snapshot.Players {
		cleanPlayerID := strings.TrimSpace(playerID)
		if cleanPlayerID == "" {
			continue
		}
		nextPlayers[cleanPlayerID] = &playerState{
			PlayerID: cleanPlayerID,
			X:        sanitizeNumber(snapshot.X),
			Z:        sanitizeNumber(snapshot.Z),
			Input:    runtimeInputState{},
		}
	}

	nextPlaced := make(map[string]string, len(state.BlockDeltas))
	nextRemoved := make(map[string]bool, len(state.BlockDeltas))
	for _, delta := range state.BlockDeltas {
		if delta.Action != "place" && delta.Action != "break" {
			continue
		}
		if delta.X < 0 || delta.X > 64 || delta.Z < 0 || delta.Z > 64 || delta.Y < 0 || delta.Y > 64 {
			continue
		}
		key := blockKey(delta.ChunkX, delta.ChunkZ, delta.X, delta.Y, delta.Z)
		if delta.Action == "break" {
			delete(nextPlaced, key)
			nextRemoved[key] = true
			continue
		}
		blockType := strings.TrimSpace(delta.BlockType)
		if blockType == "" {
			blockType = "dirt"
		}
		nextPlaced[key] = blockType
		delete(nextRemoved, key)
	}

	nextHotbar := make(map[string]runtimeHotbarState, len(state.HotbarStates))
	for _, hotbarState := range state.HotbarStates {
		playerID := strings.TrimSpace(hotbarState.PlayerID)
		if playerID == "" {
			continue
		}
		slotIDs := append([]string{}, hotbarState.SlotIDs...)
		if len(slotIDs) == 0 {
			slotIDs = append([]string{}, defaultHotbarSlotIDs...)
		}
		stackCounts := append([]int{}, hotbarState.StackCounts...)
		if len(stackCounts) != len(slotIDs) {
			stackCounts = buildDefaultHotbarStackCounts(slotIDs)
		}
		selectedIndex := hotbarState.SelectedIndex
		if selectedIndex < 0 || selectedIndex >= len(slotIDs) {
			selectedIndex = 0
		}
		tick := hotbarState.Tick
		if tick < 0 {
			tick = state.Snapshot.Tick
		}
		nextHotbar[playerID] = runtimeHotbarState{
			PlayerID:      playerID,
			SlotIDs:       slotIDs,
			StackCounts:   stackCounts,
			SelectedIndex: selectedIndex,
			Tick:          tick,
		}
	}

	nextInventory := make(map[string]runtimeInventoryState, len(state.InventoryStates))
	for _, inventoryState := range state.InventoryStates {
		playerID := strings.TrimSpace(inventoryState.PlayerID)
		if playerID == "" {
			continue
		}
		tick := inventoryState.Tick
		if tick < 0 {
			tick = state.Snapshot.Tick
		}
		nextInventory[playerID] = runtimeInventoryState{
			PlayerID:  playerID,
			Resources: normalizeResourceMap(inventoryState.Resources),
			Tick:      tick,
		}
	}

	nextHealth := make(map[string]runtimeHealthState, len(state.HealthStates))
	for _, healthState := range state.HealthStates {
		playerID := strings.TrimSpace(healthState.PlayerID)
		if playerID == "" {
			continue
		}
		max := healthState.Max
		if max <= 0 {
			max = defaultPlayerMaxHealth
		}
		current := healthState.Current
		if current < 0 {
			current = 0
		}
		if current > max {
			current = max
		}
		tick := healthState.Tick
		if tick < 0 {
			tick = state.Snapshot.Tick
		}
		nextHealth[playerID] = runtimeHealthState{
			PlayerID: playerID,
			Current:  current,
			Max:      max,
			Tick:     tick,
		}
	}

	nextEntityHealth := make(map[string]runtimeEntityHealthState, len(state.EntityHealth))
	for _, entityState := range state.EntityHealth {
		targetID := strings.TrimSpace(entityState.TargetID)
		if targetID == "" {
			continue
		}
		_, _, entityType, _, ok := parseTargetID(targetID)
		if !ok {
			continue
		}
		baseHealth, ok := resolveEntityBaseHealth(entityType)
		if !ok {
			continue
		}
		max := entityState.Max
		if max <= 0 {
			max = baseHealth
		}
		current := entityState.Current
		if current < 0 {
			current = 0
		}
		if current > max {
			current = max
		}
		defeatedUntil := entityState.DefeatedUntilTick
		if defeatedUntil < 0 {
			defeatedUntil = 0
		}
		tick := entityState.Tick
		if tick < 0 {
			tick = state.Snapshot.Tick
		}
		nextEntityHealth[targetID] = runtimeEntityHealthState{
			TargetID:          targetID,
			EntityType:        entityType,
			Current:           current,
			Max:               max,
			DefeatedUntilTick: defeatedUntil,
			Tick:              tick,
		}
	}

	nextContainers := make(map[string]runtimeContainerState, len(state.ContainerStates))
	for _, containerState := range state.ContainerStates {
		containerID := strings.TrimSpace(containerState.ContainerID)
		if containerID == "" {
			continue
		}
		tick := containerState.Tick
		if tick < 0 {
			tick = state.Snapshot.Tick
		}
		nextContainers[containerID] = runtimeContainerState{
			ContainerID: containerID,
			Resources:   normalizeResourceMap(containerState.Resources),
			Tick:        tick,
		}
	}

	nextWorldFlags := make(map[string]string, len(state.WorldFlags.Flags))
	for key, value := range state.WorldFlags.Flags {
		cleanKey := strings.TrimSpace(key)
		if cleanKey == "" {
			continue
		}
		nextWorldFlags[cleanKey] = value
	}

	nextStoryBeats := make([]string, 0, len(state.DirectiveState.StoryBeats))
	for _, beat := range state.DirectiveState.StoryBeats {
		cleanBeat := strings.TrimSpace(beat)
		if cleanBeat == "" {
			continue
		}
		nextStoryBeats = append(nextStoryBeats, cleanBeat)
	}
	if len(nextStoryBeats) > 32 {
		nextStoryBeats = nextStoryBeats[len(nextStoryBeats)-32:]
	}

	nextSpawnHints := make(map[string]spawnHintEntry, len(state.DirectiveState.SpawnHints))
	for _, spawnHint := range state.DirectiveState.SpawnHints {
		hintID := strings.TrimSpace(spawnHint.HintID)
		if hintID == "" {
			continue
		}
		label := strings.TrimSpace(spawnHint.Label)
		if label == "" {
			label = "spawn_hint"
		}
		nextSpawnHints[hintID] = spawnHintEntry{
			hint: runtimeSpawnHint{
				HintID: hintID,
				Label:  label,
				ChunkX: spawnHint.ChunkX,
				ChunkZ: spawnHint.ChunkZ,
			},
			expireTick: state.Snapshot.Tick + maxSpawnHintTTLTicks,
		}
	}

	h.worldSeed = worldSeed
	h.tick = state.Snapshot.Tick
	h.players = nextPlayers
	h.placed = nextPlaced
	h.removed = nextRemoved
	h.combatCooldownTick = make(map[string]map[string]int64)
	h.hotbarStates = nextHotbar
	h.inventoryStates = nextInventory
	h.healthStates = nextHealth
	h.entityHealth = nextEntityHealth
	h.containerStates = nextContainers
	h.worldFlags = nextWorldFlags
	h.storyBeats = nextStoryBeats
	h.spawnHints = nextSpawnHints
	h.directiveQueue = make([]openclawDirective, 0, maxQueuedDirectives)
	h.directiveSeen = make(map[string]struct{})
	h.eventSeq = 0
	h.eventLog = make([]worldEvent, 0, maxOpenClawEvents)

	h.ensureContainerStateLocked(worldSharedContainerID)
	for playerID := range h.players {
		h.ensureHotbarStateLocked(playerID)
		h.ensureInventoryStateLocked(playerID)
		h.ensureHealthStateLocked(playerID)
		h.ensureContainerStateLocked(playerPrivateContainerID(playerID))
	}

	h.recordWorldEventLocked("debug_state_loaded", "debug", map[string]any{
		"playerCount": len(h.players),
		"blockCount":  len(h.placed) + len(h.removed),
	})

	return debugLoadStateAck{
		Accepted:    true,
		Tick:        h.tick,
		PlayerCount: len(h.players),
		BlockCount:  len(h.placed) + len(h.removed),
	}, nil
}

func (h *worldHub) listBlockDeltas() []runtimeBlockDelta {
	h.mu.Lock()
	defer h.mu.Unlock()

	deltas := make([]runtimeBlockDelta, 0, len(h.placed)+len(h.removed))
	for key, blockType := range h.placed {
		chunkX, chunkZ, x, y, z := parseBlockKey(key)
		deltas = append(deltas, runtimeBlockDelta{
			Action:    "place",
			ChunkX:    chunkX,
			ChunkZ:    chunkZ,
			X:         x,
			Y:         y,
			Z:         z,
			BlockType: blockType,
		})
	}
	for key := range h.removed {
		chunkX, chunkZ, x, y, z := parseBlockKey(key)
		deltas = append(deltas, runtimeBlockDelta{
			Action: "break",
			ChunkX: chunkX,
			ChunkZ: chunkZ,
			X:      x,
			Y:      y,
			Z:      z,
		})
	}
	sort.Slice(deltas, func(left int, right int) bool {
		return compareBlockDelta(deltas[left], deltas[right]) < 0
	})
	return deltas
}

func compareBlockDelta(left runtimeBlockDelta, right runtimeBlockDelta) int {
	if left.ChunkX != right.ChunkX {
		return left.ChunkX - right.ChunkX
	}
	if left.ChunkZ != right.ChunkZ {
		return left.ChunkZ - right.ChunkZ
	}
	if left.X != right.X {
		return left.X - right.X
	}
	if left.Y != right.Y {
		return left.Y - right.Y
	}
	if left.Z != right.Z {
		return left.Z - right.Z
	}

	leftActionOrder := blockActionOrder(left.Action)
	rightActionOrder := blockActionOrder(right.Action)
	if leftActionOrder != rightActionOrder {
		return leftActionOrder - rightActionOrder
	}

	switch {
	case left.BlockType < right.BlockType:
		return -1
	case left.BlockType > right.BlockType:
		return 1
	default:
		return 0
	}
}

func blockActionOrder(action string) int {
	if action == "place" {
		return 0
	}
	if action == "break" {
		return 1
	}
	return 2
}

func breakResourceGrants(payload blockActionPayload) map[string]int {
	grants := map[string]int{
		"salvage": 1,
	}
	roll := breakResourceRoll(payload)
	switch {
	case roll < 30:
		grants["wood"] = grants["wood"] + 1
	case roll < 55:
		grants["stone"] = grants["stone"] + 1
	case roll < 75:
		grants["fiber"] = grants["fiber"] + 1
	case roll < 90:
		grants["coal"] = grants["coal"] + 1
	case roll < 98:
		grants["iron_ore"] = grants["iron_ore"] + 1
	default:
		grants["salvage"] = grants["salvage"] + 1
	}
	return grants
}

func breakResourceRoll(payload blockActionPayload) int {
	value := (payload.ChunkX * 73856093) ^ (payload.ChunkZ * 19349663) ^ (payload.X * 83492791) ^ (payload.Y * 1237) ^ (payload.Z * 29791)
	if value < 0 {
		value = -value
	}
	return value % 100
}

func resolveEntityLoot(targetID string, entityType string, tick int64) map[string]int {
	grants := map[string]int{
		"salvage": 1,
	}
	rollSeed := hashStringFNV(fmt.Sprintf("%s:%d", targetID, tick))
	roll := int(rollSeed % 100)

	switch entityType {
	case "wild-mon":
		switch {
		case roll < 35:
			grants["fiber"] = grants["fiber"] + 1
		case roll < 60:
			grants["coal"] = grants["coal"] + 1
		case roll < 80:
			grants["iron_ore"] = grants["iron_ore"] + 1
		default:
			grants["salvage"] = grants["salvage"] + 1
		}
	case "npc":
		switch {
		case roll < 40:
			grants["wood"] = grants["wood"] + 1
		case roll < 70:
			grants["fiber"] = grants["fiber"] + 1
		default:
			grants["salvage"] = grants["salvage"] + 1
		}
	}

	return grants
}

type generatedChunkEntity struct {
	entityType string
	x          float64
	z          float64
}

func parseTargetID(targetID string) (int, int, string, int, bool) {
	parts := strings.Split(targetID, ":")
	if len(parts) != 4 {
		return 0, 0, "", 0, false
	}
	chunkX, errX := strconv.Atoi(parts[0])
	chunkZ, errZ := strconv.Atoi(parts[1])
	entityType := parts[2]
	entityIndex, errIndex := strconv.Atoi(parts[3])
	if errX != nil || errZ != nil || errIndex != nil || entityIndex < 0 {
		return 0, 0, "", 0, false
	}
	return chunkX, chunkZ, entityType, entityIndex, true
}

func isNonPlayerTargetID(targetID string) bool {
	_, _, entityType, _, ok := parseTargetID(targetID)
	if !ok {
		return false
	}
	return entityType == "npc" || entityType == "wild-mon"
}

func resolveNonPlayerTargetCoordinates(targetID string, worldSeed string, tick int64, tickRateHz float64) (float64, float64, bool) {
	chunkX, chunkZ, entityType, entityIndex, ok := parseTargetID(targetID)
	if !ok {
		return 0, 0, false
	}
	if entityType != "npc" && entityType != "wild-mon" {
		return 0, 0, false
	}

	entities := generateChunkEntitiesForTargetResolution(chunkX, chunkZ, worldSeed)
	if entityIndex >= len(entities) {
		return 0, 0, false
	}
	entity := entities[entityIndex]
	if entity.entityType != entityType {
		return 0, 0, false
	}
	worldX := (float64(chunkX) * worldChunkSize) + entity.x
	worldZ := (float64(chunkZ) * worldChunkSize) + entity.z
	if entityType == "npc" || entityType == "wild-mon" {
		offsetX, offsetZ := resolveNpcWanderOffset(targetID, tick, tickRateHz)
		worldX += offsetX
		worldZ += offsetZ
	}
	return worldX, worldZ, true
}

func generateChunkEntitiesForTargetResolution(chunkX int, chunkZ int, worldSeed string) []generatedChunkEntity {
	rng := makeMulberry32(hashChunkSeed(chunkX, chunkZ, worldSeed))
	tileSize := worldChunkSize / float64(chunkGridCells)
	halfChunk := worldChunkSize * 0.5
	entities := make([]generatedChunkEntity, 0, 96)

	baseGlobalCellX := chunkX * chunkGridCells
	baseGlobalCellZ := chunkZ * chunkGridCells

	for cellX := 0; cellX < chunkGridCells; cellX++ {
		for cellZ := 0; cellZ < chunkGridCells; cellZ++ {
			globalCellX := baseGlobalCellX + cellX
			globalCellZ := baseGlobalCellZ + cellZ
			localX := ((float64(cellX) + 0.5) * tileSize) - halfChunk
			localZ := ((float64(cellZ) + 0.5) * tileSize) - halfChunk

			terrain := sampleTerrain(globalCellX, globalCellZ, worldSeed, terrainMaxHeight)
			path := terrain.path
			moisture := terrain.moisture

			if path {
				// path tile branch (no rng usage)
			} else if moisture > 0.78 {
				// water tile branch (no rng usage)
			} else if moisture > 0.55 && rng() > 0.76 {
				// flowers tile branch (consumes one rng call)
			}

			if !path && moisture <= 0.78 {
				roll := rng()
				if roll > 0.965 {
					entities = append(entities, generatedChunkEntity{
						entityType: "wild-mon",
						x:          localX + randomCellOffset(rng, tileSize),
						z:          localZ + randomCellOffset(rng, tileSize),
					})
					_ = 0.95 + (rng() * 0.22)      // scale
					_ = int(math.Floor(rng() * 3)) // variant
				} else if roll > 0.935 {
					entities = append(entities, generatedChunkEntity{
						entityType: "tree",
						x:          localX + randomCellOffset(rng, tileSize*0.75),
						z:          localZ + randomCellOffset(rng, tileSize*0.75),
					})
					_ = 1 + (rng() * 0.4)          // scale
					_ = int(math.Floor(rng() * 3)) // variant
				} else if roll > 0.91 {
					entities = append(entities, generatedChunkEntity{
						entityType: "rock",
						x:          localX + randomCellOffset(rng, tileSize*0.65),
						z:          localZ + randomCellOffset(rng, tileSize*0.65),
					})
					_ = 0.9 + (rng() * 0.45)       // scale
					_ = int(math.Floor(rng() * 2)) // variant
				}
			} else if path && rng() > 0.985 {
				entities = append(entities, generatedChunkEntity{
					entityType: "npc",
					x:          localX,
					z:          localZ,
				})
				_ = 0.95 + (rng() * 0.15)      // scale
				_ = int(math.Floor(rng() * 2)) // variant
			}
		}
	}

	if rng() > 0.54 {
		fenceWidth := 3 + int(math.Floor(rng()*3))
		fenceHeight := 3 + int(math.Floor(rng()*3))
		startX := 1 + int(math.Floor(rng()*float64(chunkGridCells-fenceWidth-2)))
		startZ := 1 + int(math.Floor(rng()*float64(chunkGridCells-fenceHeight-2)))

		for dx := 0; dx < fenceWidth; dx++ {
			entities = append(entities, buildFenceEntity(startX+dx, startZ, tileSize, halfChunk))
			entities = append(entities, buildFenceEntity(startX+dx, startZ+fenceHeight, tileSize, halfChunk))
		}
		for dz := 1; dz < fenceHeight; dz++ {
			entities = append(entities, buildFenceEntity(startX, startZ+dz, tileSize, halfChunk))
			entities = append(entities, buildFenceEntity(startX+fenceWidth, startZ+dz, tileSize, halfChunk))
		}
	}

	return entities
}

func buildFenceEntity(cellX int, cellZ int, tileSize float64, halfChunk float64) generatedChunkEntity {
	return generatedChunkEntity{
		entityType: "fence",
		x:          ((float64(cellX) + 0.5) * tileSize) - halfChunk,
		z:          ((float64(cellZ) + 0.5) * tileSize) - halfChunk,
	}
}

func randomCellOffset(rng func() float64, tileSize float64) float64 {
	return (rng() - 0.5) * tileSize * 0.68
}

func isPathCell(globalCellX int, globalCellZ int) bool {
	bend := math.Sin((float64(globalCellZ)+18)*0.09) * 2.4
	laneCenter := 8 + bend
	vertical := math.Abs(math.Mod(float64(globalCellX), float64(chunkGridCells))-laneCenter) <= 1.2
	crossRoad := math.Abs(math.Mod(float64(globalCellZ), 29)-12) <= 1.1
	return vertical || crossRoad
}

func layeredNoise(x int, z int) float64 {
	coarse := (math.Sin(float64(x)*0.19+float64(z)*0.11) * 0.5) + 0.5
	detail := (math.Sin(float64(x)*0.63-float64(z)*0.53) * 0.5) + 0.5
	return (coarse * 0.72) + (detail * 0.28)
}

func hashChunkSeed(chunkX int, chunkZ int, worldSeed string) uint32 {
	hash := uint32(2166136261)
	payload := worldSeed + ":" + intToString(chunkX) + ":" + intToString(chunkZ)
	for index := 0; index < len(payload); index++ {
		hash ^= uint32(payload[index])
		hash *= 16777619
	}
	return hash
}

func makeMulberry32(seed uint32) func() float64 {
	state := seed
	return func() float64 {
		state += 0x6d2b79f5
		temp := imul32(state^(state>>15), 1|state)
		temp ^= temp + imul32(temp^(temp>>7), 61|temp)
		return float64(temp^(temp>>14)) / 4294967296.0
	}
}

func imul32(left uint32, right uint32) uint32 {
	return uint32(int32(left) * int32(right))
}

type terrainSample struct {
	height      float64
	heightIndex int
	moisture    float64
	ridge       float64
	path        bool
	pathMask    float64
}

func sampleTerrain(cellX int, cellZ int, worldSeed string, maxHeight int) terrainSample {
	seed := hashStringFNV(worldSeed)
	base := fbmNoise(float64(cellX)*0.06, float64(cellZ)*0.06, seed, 4, 0.5, 2.0)
	ridge := ridgeNoise(float64(cellX)*0.11, float64(cellZ)*0.11, seed)
	slope := fbmNoise(float64(cellX)*0.02-11, float64(cellZ)*0.02+7, seed, 2, 0.55, 2.0)
	pathMask := resolvePathMask(cellX, cellZ)

	height := 2 + ((base * 0.62) + (ridge * 0.22) + (slope * 0.16)) * float64(maxHeight)
	height -= pathMask * 1.25
	if height < 1 {
		height = 1
	}

	moisture := fbmNoise(float64(cellX)*0.08+17, float64(cellZ)*0.05-9, seed, 3, 0.5, 2.0)
	heightIndex := int(math.Floor(height))
	if heightIndex < 1 {
		heightIndex = 1
	} else if heightIndex > maxHeight {
		heightIndex = maxHeight
	}

	return terrainSample{
		height:      height,
		heightIndex: heightIndex,
		moisture:    moisture,
		ridge:       ridge,
		path:        pathMask > 0.45,
		pathMask:    pathMask,
	}
}

func resolvePathMask(cellX int, cellZ int) float64 {
	bend := math.Sin((float64(cellZ)+18)*0.09) * 2.4
	laneCenter := 8 + bend
	laneOffset := math.Abs(modFloat(float64(cellX), 16)-laneCenter)
	laneMask := smoothFalloff(laneOffset, 0.4, 2.2)

	crossOffset := math.Abs(modFloat(float64(cellZ), 29) - 12)
	crossMask := smoothFalloff(crossOffset, 0.45, 2.1)

	if laneMask > crossMask {
		return laneMask
	}
	return crossMask
}

func smoothFalloff(distance float64, inner float64, outer float64) float64 {
	if distance <= inner {
		return 1
	}
	if distance >= outer {
		return 0
	}
	t := (distance - inner) / (outer - inner)
	return 1 - smoothStep(t)
}

func smoothStep(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value * value * (3 - 2*value)
}

func modFloat(value float64, modulus float64) float64 {
	result := math.Mod(value, modulus)
	if result < 0 {
		result += modulus
	}
	return result
}

func fbmNoise(
	x float64,
	z float64,
	seed uint32,
	octaves int,
	persistence float64,
	lacunarity float64,
) float64 {
	amplitude := 0.5
	frequency := 1.0
	value := 0.0
	max := 0.0
	for i := 0; i < octaves; i++ {
		value += amplitude * valueNoise(x*frequency, z*frequency, seed)
		max += amplitude
		amplitude *= persistence
		frequency *= lacunarity
	}
	if max > 0 {
		return value / max
	}
	return 0
}

func ridgeNoise(x float64, z float64, seed uint32) float64 {
	base := valueNoise(x, z, seed)
	return 1 - math.Abs(base*2-1)
}

func valueNoise(x float64, z float64, seed uint32) float64 {
	x0 := math.Floor(x)
	z0 := math.Floor(z)
	x1 := x0 + 1
	z1 := z0 + 1

	sx := smoothStep(x - x0)
	sz := smoothStep(z - z0)

	n00 := hash2d(int(x0), int(z0), seed)
	n10 := hash2d(int(x1), int(z0), seed)
	n01 := hash2d(int(x0), int(z1), seed)
	n11 := hash2d(int(x1), int(z1), seed)

	ix0 := lerp(n00, n10, sx)
	ix1 := lerp(n01, n11, sx)
	return lerp(ix0, ix1, sz)
}

func hash2d(x int, z int, seed uint32) float64 {
	h := seed ^ imul32(uint32(int32(x)), 374761393) ^ imul32(uint32(int32(z)), 668265263)
	h = imul32(h^(h>>13), 1274126177)
	h ^= h >> 16
	return float64(h) / 4294967295.0
}

func lerp(left float64, right float64, t float64) float64 {
	return left + (right-left)*t
}

func hashStringFNV(payload string) uint32 {
	hash := uint32(2166136261)
	for index := 0; index < len(payload); index++ {
		hash ^= uint32(payload[index])
		hash *= 16777619
	}
	return hash
}

func resolveNpcWanderOffset(targetID string, tick int64, tickRateHz float64) (float64, float64) {
	if tickRateHz <= 0 {
		tickRateHz = 20
	}
	seedA := hashStringFNV(targetID + ":a")
	seedB := hashStringFNV(targetID + ":b")
	seedC := hashStringFNV(targetID + ":c")
	unitA := float64(seedA%1000) / 1000.0
	unitB := float64(seedB%1000) / 1000.0
	unitC := float64(seedC%1000) / 1000.0

	radius := npcWanderRadiusMin + (unitA * (npcWanderRadiusMax - npcWanderRadiusMin))
	speedCycles := npcWanderSpeedMin + (unitB * (npcWanderSpeedMax - npcWanderSpeedMin))
	sway := npcWanderSwayMin + (unitC * (npcWanderSwayMax - npcWanderSwayMin))
	phaseA := unitA * math.Pi * 2
	phaseB := unitC * math.Pi * 2

	seconds := float64(tick) / tickRateHz
	angle := seconds * speedCycles * math.Pi * 2
	return math.Cos(angle+phaseA) * radius, math.Sin(angle*sway+phaseB) * radius * 0.7
}

func (h *worldHub) broadcast(envelope serverEnvelope) {
	h.mu.Lock()
	clients := make([]*clientConn, 0, len(h.clients))
	for client := range h.clients {
		clients = append(clients, client)
	}
	h.mu.Unlock()

	for _, client := range clients {
		if err := client.writeJSON(envelope); err != nil {
			log.Printf("world-server: write error: %v", err)
			_ = client.conn.Close()
			h.removeClient(client)
		}
	}
}

func (h *worldHub) broadcastSnapshots(radius float64) {
	h.mu.Lock()
	snapshots := make(map[*clientConn]worldRuntimeSnapshot, len(h.clients))
	for client := range h.clients {
		snapshots[client] = h.snapshotForClientLocked(client, radius)
	}
	h.mu.Unlock()

	for client, snapshot := range snapshots {
		h.sendToClient(client, serverEnvelope{
			Type:    "snapshot",
			Payload: snapshot,
		})
	}
}

func (h *worldHub) broadcastCombatResult(result runtimeCombatResult) {
	recipients := h.selectCombatRecipients(result.PlayerID, combatReplicationRadius)
	envelope := serverEnvelope{
		Type:    "combat_result",
		Payload: result,
	}
	for _, client := range recipients {
		h.sendToClient(client, envelope)
	}
}

func (h *worldHub) broadcastBlockDelta(delta runtimeBlockDelta) {
	recipients := h.selectBlockDeltaRecipients(delta.ChunkX, delta.ChunkZ, blockDeltaChunkRadius)
	envelope := serverEnvelope{
		Type:    "block_delta",
		Payload: delta,
	}
	for _, client := range recipients {
		h.sendToClient(client, envelope)
	}
}

func (h *worldHub) selectCombatRecipients(playerID string, radius float64) []*clientConn {
	h.mu.Lock()
	defer h.mu.Unlock()

	recipients := make(map[*clientConn]struct{}, len(h.clients))
	actor, actorPresent := h.players[playerID]

	for client := range h.clients {
		for clientPlayerID := range client.playerIDs {
			if clientPlayerID == playerID {
				recipients[client] = struct{}{}
				break
			}
			if !actorPresent {
				continue
			}
			player, ok := h.players[clientPlayerID]
			if !ok {
				continue
			}
			if math.Hypot(player.X-actor.X, player.Z-actor.Z) <= radius {
				recipients[client] = struct{}{}
				break
			}
		}
	}

	result := make([]*clientConn, 0, len(recipients))
	for client := range recipients {
		result = append(result, client)
	}
	return result
}

func (h *worldHub) selectBlockDeltaRecipients(chunkX int, chunkZ int, radius int) []*clientConn {
	h.mu.Lock()
	defer h.mu.Unlock()

	recipients := make(map[*clientConn]struct{}, len(h.clients))

	for client := range h.clients {
		for clientPlayerID := range client.playerIDs {
			player, ok := h.players[clientPlayerID]
			if !ok {
				continue
			}
			playerChunkX := int(math.Floor(player.X / worldChunkSize))
			playerChunkZ := int(math.Floor(player.Z / worldChunkSize))
			if math.Abs(float64(playerChunkX-chunkX)) <= float64(radius) &&
				math.Abs(float64(playerChunkZ-chunkZ)) <= float64(radius) {
				recipients[client] = struct{}{}
				break
			}
		}
	}

	result := make([]*clientConn, 0, len(recipients))
	for client := range recipients {
		result = append(result, client)
	}
	return result
}

func (h *worldHub) selectPlayerOwnedRecipients(playerID string) []*clientConn {
	h.mu.Lock()
	defer h.mu.Unlock()

	recipients := make([]*clientConn, 0, 2)
	for client := range h.clients {
		if _, owned := client.playerIDs[playerID]; owned {
			recipients = append(recipients, client)
		}
	}
	return recipients
}

func (h *worldHub) sendToPlayerOwnedRecipients(playerID string, envelope serverEnvelope) {
	recipients := h.selectPlayerOwnedRecipients(playerID)
	for _, client := range recipients {
		h.sendToClient(client, envelope)
	}
}

func (h *worldHub) sendToClient(client *clientConn, envelope serverEnvelope) {
	if err := client.writeJSON(envelope); err != nil {
		log.Printf("world-server: client write error: %v", err)
		_ = client.conn.Close()
		h.removeClient(client)
	}
}

func (c *clientConn) writeJSON(value any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteJSON(value)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

func buildWSHandler(hub *worldHub) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		conn, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			log.Printf("world-server: ws upgrade failed: %v", err)
			return
		}

		client := &clientConn{
			conn:      conn,
			playerIDs: make(map[string]struct{}),
		}
		hub.addClient(client)
		defer func() {
			hub.removeClient(client)
			_ = conn.Close()
		}()

		hub.sendToClient(client, serverEnvelope{
			Type:    "snapshot",
			Payload: hub.snapshotForClient(client, snapshotReplicationRadius),
		})

		for _, delta := range hub.listBlockDeltas() {
			hub.sendToClient(client, serverEnvelope{
				Type:    "block_delta",
				Payload: delta,
			})
		}

		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var envelope clientEnvelope
			if err := json.Unmarshal(payload, &envelope); err != nil {
				continue
			}

			switch envelope.Type {
			case "join":
				var join joinRuntimeRequest
				if json.Unmarshal(envelope.Payload, &join) == nil {
					hub.handleJoin(client, join)
					hub.sendToClient(client, serverEnvelope{
						Type:    "snapshot",
						Payload: hub.snapshotForClient(client, snapshotReplicationRadius),
					})
					if hotbarState, ok := hub.hotbarStateForPlayer(join.PlayerID); ok {
						hub.sendToClient(client, serverEnvelope{
							Type:    "hotbar_state",
							Payload: hotbarState,
						})
					}
					if inventoryState, ok := hub.inventoryStateForPlayer(join.PlayerID); ok {
						hub.sendToClient(client, serverEnvelope{
							Type:    "inventory_state",
							Payload: inventoryState,
						})
					}
					if healthState, ok := hub.healthStateForPlayer(join.PlayerID); ok {
						hub.sendToClient(client, serverEnvelope{
							Type:    "health_state",
							Payload: healthState,
						})
					}
					if containerState, ok := hub.containerState(worldSharedContainerID); ok {
						hub.sendToClient(client, serverEnvelope{
							Type:    "container_state",
							Payload: containerState,
						})
					}
					if containerState, ok := hub.containerState(playerPrivateContainerID(join.PlayerID)); ok {
						hub.sendToClient(client, serverEnvelope{
							Type:    "container_state",
							Payload: containerState,
						})
					}
					hub.sendToClient(client, serverEnvelope{
						Type:    "world_flag_state",
						Payload: hub.worldFlagState(),
					})
					hub.sendToClient(client, serverEnvelope{
						Type:    "world_directive_state",
						Payload: hub.worldDirectiveState(),
					})
				}
			case "leave":
				var leave leavePayload
				if json.Unmarshal(envelope.Payload, &leave) == nil {
					hub.handleLeave(leave.PlayerID)
				}
			case "input":
				var input inputPayload
				if json.Unmarshal(envelope.Payload, &input) == nil {
					hub.handleInput(input)
				}
			case "block_action":
				var action blockActionPayload
				if json.Unmarshal(envelope.Payload, &action) == nil {
					if delta, ok := hub.applyBlockAction(action); ok {
						hub.broadcastBlockDelta(delta)
						if action.Action == "break" {
							if inventoryState, changed := hub.awardInventoryResources(action.PlayerID, breakResourceGrants(action)); changed {
								hub.sendToPlayerOwnedRecipients(inventoryState.PlayerID, serverEnvelope{
									Type:    "inventory_state",
									Payload: inventoryState,
								})
							}
						}
					}
				}
			case "combat_action":
				var action combatActionPayload
				if json.Unmarshal(envelope.Payload, &action) == nil {
					result, healthUpdates, inventoryUpdates, worldEvents := hub.applyCombatAction(action)
					hub.broadcastCombatResult(result)
					for _, state := range healthUpdates {
						hub.sendToPlayerOwnedRecipients(state.PlayerID, serverEnvelope{
							Type:    "health_state",
							Payload: state,
						})
					}
					for _, state := range inventoryUpdates {
						hub.sendToPlayerOwnedRecipients(state.PlayerID, serverEnvelope{
							Type:    "inventory_state",
							Payload: state,
						})
					}
					if len(worldEvents) > 0 {
						recipients := hub.selectCombatRecipients(result.PlayerID, combatReplicationRadius)
						for _, event := range worldEvents {
							for _, client := range recipients {
								hub.sendToClient(client, serverEnvelope{
									Type:    "world_event",
									Payload: event,
								})
							}
						}
					}
					if result.Accepted && action.Kind == "item" {
						if state, ok := hub.hotbarStateForPlayer(action.PlayerID); ok {
							hub.sendToPlayerOwnedRecipients(action.PlayerID, serverEnvelope{
								Type:    "hotbar_state",
								Payload: state,
							})
						}
					}
				}
			case "interact_action":
				var action interactActionPayload
				if json.Unmarshal(envelope.Payload, &action) == nil {
					result := hub.applyInteractAction(action)
					hub.sendToPlayerOwnedRecipients(action.PlayerID, serverEnvelope{
						Type:    "interact_result",
						Payload: result,
					})
				}
			case "hotbar_select":
				var action hotbarSelectPayload
				if json.Unmarshal(envelope.Payload, &action) == nil {
					if _, owned := client.playerIDs[action.PlayerID]; !owned {
						continue
					}
					if state, ok := hub.applyHotbarSelection(action); ok {
						hub.sendToPlayerOwnedRecipients(action.PlayerID, serverEnvelope{
							Type:    "hotbar_state",
							Payload: state,
						})
					}
				}
			case "craft_request":
				var craft craftRequestPayload
				if json.Unmarshal(envelope.Payload, &craft) == nil {
					if _, owned := client.playerIDs[craft.PlayerID]; !owned {
						continue
					}
					result, inventoryState, hotbarState := hub.applyCraftRequest(craft)
					hub.sendToPlayerOwnedRecipients(craft.PlayerID, serverEnvelope{
						Type:    "craft_result",
						Payload: result,
					})
					if inventoryState != nil {
						hub.sendToPlayerOwnedRecipients(craft.PlayerID, serverEnvelope{
							Type:    "inventory_state",
							Payload: *inventoryState,
						})
					}
					if hotbarState != nil {
						hub.sendToPlayerOwnedRecipients(craft.PlayerID, serverEnvelope{
							Type:    "hotbar_state",
							Payload: *hotbarState,
						})
					}
				}
			case "container_action":
				var action containerActionPayload
				if json.Unmarshal(envelope.Payload, &action) == nil {
					if _, owned := client.playerIDs[action.PlayerID]; !owned {
						continue
					}
					result, inventoryState, containerState := hub.applyContainerAction(action)
					hub.sendToPlayerOwnedRecipients(action.PlayerID, serverEnvelope{
						Type:    "container_result",
						Payload: result,
					})
					if inventoryState != nil {
						hub.sendToPlayerOwnedRecipients(action.PlayerID, serverEnvelope{
							Type:    "inventory_state",
							Payload: *inventoryState,
						})
					}
					if containerState != nil {
						if ownerPlayerID, isPrivate := privateContainerOwner(containerState.ContainerID); isPrivate {
							hub.sendToPlayerOwnedRecipients(ownerPlayerID, serverEnvelope{
								Type:    "container_state",
								Payload: *containerState,
							})
						} else {
							hub.broadcast(serverEnvelope{
								Type:    "container_state",
								Payload: *containerState,
							})
						}
					}
				}
			}
		}
	}
}

func main() {
	addr := flag.String("addr", ":8787", "listen address")
	flag.Parse()

	hub := newWorldHub()
	go runTickLoop(hub)

	http.HandleFunc("/ws", buildWSHandler(hub))
	http.HandleFunc("/openclaw/directives", buildDirectiveHandler(hub))
	http.HandleFunc("/openclaw/events", buildEventFeedHandler(hub))
	http.HandleFunc("/debug/state", buildDebugStateHandler(hub))
	http.HandleFunc("/debug/load-state", buildDebugLoadStateHandler(hub))

	log.Printf("world-server: listening on %s", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Fatalf("world-server: listen failed: %v", err)
	}
}

func buildDirectiveHandler(hub *worldHub) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		defer request.Body.Close()

		var payload openclawDirectiveRequest
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writer.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(writer).Encode(openclawDirectiveAck{
				Accepted: false,
				Reason:   "invalid_json",
			})
			return
		}

		ack := hub.ingestDirective(payload)
		statusCode := http.StatusAccepted
		if !ack.Accepted && ack.Reason != "duplicate_ignored" {
			statusCode = http.StatusBadRequest
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(statusCode)
		_ = json.NewEncoder(writer).Encode(ack)
	}
}

func buildEventFeedHandler(hub *worldHub) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		since := int64(0)
		rawSince := request.URL.Query().Get("since")
		if rawSince != "" {
			parsed, err := strconv.ParseInt(rawSince, 10, 64)
			if err != nil || parsed < 0 {
				writer.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(writer).Encode(map[string]string{
					"error": "invalid_since",
				})
				return
			}
			since = parsed
		}

		limit := 0
		rawLimit := request.URL.Query().Get("limit")
		if rawLimit != "" {
			parsed, err := strconv.Atoi(rawLimit)
			if err != nil || parsed < 1 || parsed > maxOpenClawEvents {
				writer.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(writer).Encode(map[string]string{
					"error": "invalid_limit",
				})
				return
			}
			limit = parsed
		}

		cursor := strings.TrimSpace(request.URL.Query().Get("cursor"))
		feed := hub.listWorldEventsForCursor(since, cursor, limit)
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(writer).Encode(feed)
	}
}

func buildDebugStateHandler(hub *worldHub) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		state := hub.exportState()
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(writer).Encode(state)
	}
}

func buildDebugLoadStateHandler(hub *worldHub) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		defer request.Body.Close()

		var payload worldDebugState
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			writer.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(writer).Encode(debugLoadStateAck{
				Accepted: false,
				Reason:   "invalid_json",
			})
			return
		}

		ack, err := hub.importState(payload)
		if err != nil {
			writer.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(writer).Encode(debugLoadStateAck{
				Accepted: false,
				Reason:   err.Error(),
			})
			return
		}

		hub.broadcastSnapshots(snapshotReplicationRadius)
		for _, delta := range hub.listBlockDeltas() {
			hub.broadcast(serverEnvelope{
				Type:    "block_delta",
				Payload: delta,
			})
		}
		state := hub.exportState()
		for _, hotbarState := range state.HotbarStates {
			hub.sendToPlayerOwnedRecipients(hotbarState.PlayerID, serverEnvelope{
				Type:    "hotbar_state",
				Payload: hotbarState,
			})
		}
		for _, inventoryState := range state.InventoryStates {
			hub.sendToPlayerOwnedRecipients(inventoryState.PlayerID, serverEnvelope{
				Type:    "inventory_state",
				Payload: inventoryState,
			})
		}
		for _, containerState := range state.ContainerStates {
			if ownerPlayerID, isPrivate := privateContainerOwner(containerState.ContainerID); isPrivate {
				hub.sendToPlayerOwnedRecipients(ownerPlayerID, serverEnvelope{
					Type:    "container_state",
					Payload: containerState,
				})
				continue
			}
			hub.broadcast(serverEnvelope{
				Type:    "container_state",
				Payload: containerState,
			})
		}
		hub.broadcast(serverEnvelope{
			Type:    "world_flag_state",
			Payload: state.WorldFlags,
		})
		hub.broadcast(serverEnvelope{
			Type:    "world_directive_state",
			Payload: state.DirectiveState,
		})

		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(writer).Encode(ack)
	}
}

func runTickLoop(hub *worldHub) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		directiveStateChanged := hub.advanceOneTick()
		hub.broadcastSnapshots(snapshotReplicationRadius)
		if directiveStateChanged {
			hub.broadcast(serverEnvelope{
				Type:    "world_flag_state",
				Payload: hub.worldFlagState(),
			})
			hub.broadcast(serverEnvelope{
				Type:    "world_directive_state",
				Payload: hub.worldDirectiveState(),
			})
		}
	}
}

func privateContainerOwner(containerID string) (string, bool) {
	prefix := "player:"
	suffix := ":stash"
	if !strings.HasPrefix(containerID, prefix) || !strings.HasSuffix(containerID, suffix) {
		return "", false
	}
	owner := strings.TrimSuffix(strings.TrimPrefix(containerID, prefix), suffix)
	if owner == "" {
		return "", false
	}
	return owner, true
}

func normalize(x float64, z float64) (float64, float64) {
	length := math.Hypot(x, z)
	if length <= 0 {
		return 0, 0
	}
	return x / length, z / length
}

func sanitizeNumber(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return value
}

func intFromAny(value any) (int, bool) {
	switch cast := value.(type) {
	case int:
		return cast, true
	case int32:
		return int(cast), true
	case int64:
		return int(cast), true
	case float64:
		if math.IsNaN(cast) || math.IsInf(cast, 0) {
			return 0, false
		}
		return int(math.Round(cast)), true
	case json.Number:
		parsed, err := cast.Int64()
		if err != nil {
			return 0, false
		}
		return int(parsed), true
	default:
		return 0, false
	}
}

func makeFloat64Ptr(value float64) *float64 {
	result := value
	return &result
}

func isAllowedDirectiveType(directiveType string) bool {
	switch directiveType {
	case "set_world_flag", "emit_story_beat", "spawn_hint":
		return true
	default:
		return false
	}
}

func blockKey(chunkX int, chunkZ int, x int, y int, z int) string {
	return encodeInt(chunkX) + ":" + encodeInt(chunkZ) + ":" + encodeInt(x) + ":" + encodeInt(y) + ":" + encodeInt(z)
}

func parseBlockKey(key string) (int, int, int, int, int) {
	parts := make([]int, 0, 5)
	start := 0
	for idx := 0; idx <= len(key); idx++ {
		if idx != len(key) && key[idx] != ':' {
			continue
		}
		parts = append(parts, decodeInt(key[start:idx]))
		start = idx + 1
	}
	if len(parts) != 5 {
		return 0, 0, 0, 0, 0
	}
	return parts[0], parts[1], parts[2], parts[3], parts[4]
}

func encodeInt(value int) string {
	return json.Number(intToString(value)).String()
}

func decodeInt(value string) int {
	sign := 1
	result := 0
	for index, ch := range value {
		if index == 0 && ch == '-' {
			sign = -1
			continue
		}
		if ch < '0' || ch > '9' {
			return 0
		}
		result = (result * 10) + int(ch-'0')
	}
	return result * sign
}

func intToString(value int) string {
	if value == 0 {
		return "0"
	}

	sign := ""
	if value < 0 {
		sign = "-"
		value = -value
	}

	buffer := make([]byte, 0, 12)
	for value > 0 {
		buffer = append(buffer, byte('0'+(value%10)))
		value /= 10
	}

	for left, right := 0, len(buffer)-1; left < right; left, right = left+1, right-1 {
		buffer[left], buffer[right] = buffer[right], buffer[left]
	}

	return sign + string(buffer)
}
