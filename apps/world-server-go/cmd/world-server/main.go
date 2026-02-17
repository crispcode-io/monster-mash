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
	maxQueuedDirectives       = 128
	defaultDirectiveTTLTicks  = 240
	maxDirectiveTTLTicks      = 2000
	combatReplicationRadius   = 48.0
	snapshotReplicationRadius = 160.0
	chunkGridCells            = 16
	worldChunkSize            = 64.0
	defaultSpawnHintTTLTicks  = 600
	maxSpawnHintTTLTicks      = 4000
)

type combatSlotConfig struct {
	kind           string
	cooldownTicks  int64
	maxRange       float64
	requiresTarget bool
}

var combatSlotConfigs = map[string]combatSlotConfig{
	"slot-1-rust-blade": {kind: "melee", cooldownTicks: 12, maxRange: 3.4, requiresTarget: true},
	"slot-2-ember-bolt": {kind: "spell", cooldownTicks: 20, maxRange: 11.5, requiresTarget: true},
	"slot-3-frost-bind": {kind: "spell", cooldownTicks: 29, maxRange: 8.5, requiresTarget: true},
	"slot-4-bandage":    {kind: "item", cooldownTicks: 42, maxRange: 0, requiresTarget: false},
	"slot-5-bomb":       {kind: "item", cooldownTicks: 33, maxRange: 9.5, requiresTarget: true},
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
		containerStates:    make(map[string]runtimeContainerState),
		eventLog:           make([]worldEvent, 0, maxOpenClawEvents),
		worldFlags:         make(map[string]string),
		storyBeats:         make([]string, 0, 32),
		spawnHints:         make(map[string]spawnHintEntry),
		directiveQueue:     make([]openclawDirective, 0, maxQueuedDirectives),
		directiveSeen:      make(map[string]struct{}),
		clients:            make(map[*clientConn]struct{}),
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

func (h *worldHub) applyCombatAction(payload combatActionPayload) runtimeCombatResult {
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
	result.Tick = h.tick

	if payload.PlayerID == "" || payload.ActionID == "" || payload.SlotID == "" || payload.Kind == "" {
		result.Accepted = false
		result.Reason = "invalid_payload"
		h.recordCombatEventLocked(result)
		return result
	}

	player, ok := h.players[payload.PlayerID]
	if !ok {
		result.Accepted = false
		result.Reason = "player_not_found"
		h.recordCombatEventLocked(result)
		return result
	}

	slotConfig, ok := combatSlotConfigs[payload.SlotID]
	if !ok {
		result.Accepted = false
		result.Reason = "invalid_slot"
		h.recordCombatEventLocked(result)
		return result
	}
	if payload.Kind != slotConfig.kind {
		result.Accepted = false
		result.Reason = "invalid_slot_kind"
		h.recordCombatEventLocked(result)
		return result
	}
	hotbarState := h.ensureHotbarStateLocked(payload.PlayerID)
	slotIndex := hotbarSlotIndex(hotbarState, payload.SlotID)
	if slotIndex < 0 {
		result.Accepted = false
		result.Reason = "slot_not_equipped"
		h.recordCombatEventLocked(result)
		return result
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
			return result
		default:
			result.Accepted = false
			result.Reason = "missing_target"
			h.recordCombatEventLocked(result)
			return result
		}
		distance := math.Hypot(
			sanitizeNumber(*result.TargetWorldX)-player.X,
			sanitizeNumber(*result.TargetWorldZ)-player.Z,
		)
		if slotConfig.maxRange > 0 && distance > slotConfig.maxRange {
			result.Accepted = false
			result.Reason = "target_out_of_range"
			h.recordCombatEventLocked(result)
			return result
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
		return result
	}

	if slotConfig.kind == "item" {
		remaining := hotbarState.StackCounts[slotIndex]
		if remaining <= 0 {
			result.Accepted = false
			result.Reason = "insufficient_item"
			h.recordCombatEventLocked(result)
			return result
		}
		hotbarState.StackCounts[slotIndex] = remaining - 1
		hotbarState.Tick = h.tick
		h.hotbarStates[payload.PlayerID] = cloneHotbarState(hotbarState)
	}

	playerCooldowns[payload.SlotID] = h.tick + slotConfig.cooldownTicks
	result.Accepted = true
	h.recordCombatEventLocked(result)
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
	x, z, resolved := resolveNonPlayerTargetCoordinates(targetID, h.worldSeed)
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

func (h *worldHub) recordWorldEventLocked(eventType string, playerID string, payload map[string]any) {
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

type generatedChunkEntity struct {
	entityType string
	x          float64
	z          float64
}

func resolveNonPlayerTargetCoordinates(targetID string, worldSeed string) (float64, float64, bool) {
	parts := strings.Split(targetID, ":")
	if len(parts) != 4 {
		return 0, 0, false
	}
	chunkX, errX := strconv.Atoi(parts[0])
	chunkZ, errZ := strconv.Atoi(parts[1])
	entityType := parts[2]
	entityIndex, errIndex := strconv.Atoi(parts[3])
	if errX != nil || errZ != nil || errIndex != nil || entityIndex < 0 {
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

			path := isPathCell(globalCellX, globalCellZ)
			moisture := layeredNoise(globalCellX, globalCellZ)

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
						hub.broadcast(serverEnvelope{
							Type:    "block_delta",
							Payload: delta,
						})
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
					result := hub.applyCombatAction(action)
					hub.broadcastCombatResult(result)
					if result.Accepted && action.Kind == "item" {
						if state, ok := hub.hotbarStateForPlayer(action.PlayerID); ok {
							hub.sendToPlayerOwnedRecipients(action.PlayerID, serverEnvelope{
								Type:    "hotbar_state",
								Payload: state,
							})
						}
					}
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

		feed := hub.listWorldEventsSince(since)
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
