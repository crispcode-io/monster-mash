package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"math/rand/v2"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type joinRuntimeRequest struct {
	WorldSeed string  `json:"worldSeed"`
	PlayerID  string  `json:"playerId"`
	StartX    float64 `json:"startX"`
	StartZ    float64 `json:"startZ"`
}

type clientEnvelope struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type serverEnvelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type runtimeInputState struct {
	MoveX   float64 `json:"moveX"`
	MoveZ   float64 `json:"moveZ"`
	Running bool    `json:"running"`
	Jump    bool    `json:"jump"`
}

type inputPayload struct {
	PlayerID string            `json:"playerId"`
	Input    runtimeInputState `json:"input"`
}

type hotbarSelectPayload struct {
	PlayerID  string `json:"playerId"`
	SlotIndex int    `json:"slotIndex"`
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

type runtimeCombatResult struct {
	ActionID string `json:"actionId"`
	PlayerID string `json:"playerId"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

type runtimeInteractResult struct {
	ActionID string `json:"actionId"`
	PlayerID string `json:"playerId"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

type runtimeCraftResult struct {
	ActionID string `json:"actionId"`
	PlayerID string `json:"playerId"`
	RecipeID string `json:"recipeId"`
	Count    int    `json:"count"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

type runtimeContainerActionResult struct {
	ActionID string `json:"actionId"`
	PlayerID string `json:"playerId"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
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

type botClient struct {
	id        string
	conn      *websocket.Conn
	inbox     chan serverEnvelope
	done      chan error
	mu        sync.Mutex
	snapshot  worldRuntimeSnapshot
	inventory runtimeInventoryState
	hotbar    runtimeHotbarState
}

func main() {
	wsURL := flag.String("ws", "ws://localhost:8787/ws", "world server websocket url")
	clientCount := flag.Int("clients", 2, "number of bot clients")
	worldSeed := flag.String("seed", "default-seed", "world seed to join")
	flag.Parse()

	if *clientCount < 2 {
		fmt.Println("clients must be >= 2")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	bots := make([]*botClient, 0, *clientCount)
	for index := 0; index < *clientCount; index++ {
		playerID := fmt.Sprintf("bot-%d", index+1)
		startX := float64(index) * 0.9
		startZ := float64(index) * 0.7
		client, err := newBotClient(ctx, *wsURL, playerID, *worldSeed, startX, startZ)
		if err != nil {
			fail(err)
		}
		bots = append(bots, client)
	}
	defer func() {
		for _, client := range bots {
			client.close()
		}
	}()

	actor := bots[0]
	target := bots[1]

	if _, err := actor.waitForSnapshot(ctx); err != nil {
		fail(fmt.Errorf("actor snapshot: %w", err))
	}
	if _, err := target.waitForSnapshot(ctx); err != nil {
		fail(fmt.Errorf("target snapshot: %w", err))
	}

	if err := actor.exerciseMovement(ctx); err != nil {
		fail(fmt.Errorf("movement: %w", err))
	}

	if err := actor.selectHotbarSlot(ctx, 1); err != nil {
		fail(fmt.Errorf("hotbar select: %w", err))
	}

	woodCoords := findBreakCoords(0, 29, 2)
	if len(woodCoords) < 2 {
		fail(fmt.Errorf("failed to locate wood break coordinates"))
	}
	for _, coord := range woodCoords {
		if err := actor.breakBlock(ctx, coord); err != nil {
			fail(fmt.Errorf("break block: %w", err))
		}
	}
	if err := actor.waitForInventoryAtLeast(ctx, "wood", 2); err != nil {
		fail(fmt.Errorf("inventory wood: %w", err))
	}
	if err := actor.waitForInventoryAtLeast(ctx, "salvage", 1); err != nil {
		fail(fmt.Errorf("inventory salvage: %w", err))
	}

	if err := actor.placeBlock(ctx, woodCoords[0]); err != nil {
		fail(fmt.Errorf("place block: %w", err))
	}

	if err := actor.attackTarget(ctx, "slot-1-rust-blade", "melee", target.id, "Bot target"); err != nil {
		fail(fmt.Errorf("melee attack: %w", err))
	}
	if err := actor.attackTarget(ctx, "slot-2-ember-bolt", "spell", target.id, "Bot target"); err != nil {
		fail(fmt.Errorf("spell attack: %w", err))
	}
	if err := actor.useBandage(ctx); err != nil {
		fail(fmt.Errorf("bandage: %w", err))
	}

	if err := actor.interactTarget(ctx, target.id, "Bot target"); err != nil {
		fail(fmt.Errorf("interact: %w", err))
	}

	if err := actor.craft(ctx, "craft-charcoal", 1); err != nil {
		fail(fmt.Errorf("craft: %w", err))
	}

	if err := actor.containerDepositWithdraw(ctx, "world:camp-shared", "salvage", 1); err != nil {
		fail(fmt.Errorf("container: %w", err))
	}

	for _, client := range bots {
		_ = client.send("leave", map[string]string{"playerId": client.id})
	}

	fmt.Println("world-bot: scenario complete")
}

func newBotClient(ctx context.Context, wsURL, playerID, worldSeed string, startX, startZ float64) (*botClient, error) {
	conn, err := dialWithRetry(ctx, wsURL)
	if err != nil {
		return nil, err
	}
	client := &botClient{
		id:    playerID,
		conn:  conn,
		inbox: make(chan serverEnvelope, 256),
		done:  make(chan error, 1),
	}
	go client.readLoop()

	if err := client.send("join", joinRuntimeRequest{
		WorldSeed: worldSeed,
		PlayerID:  playerID,
		StartX:    startX,
		StartZ:    startZ,
	}); err != nil {
		client.close()
		return nil, err
	}
	return client, nil
}

func (c *botClient) close() {
	if c.conn != nil {
		_ = c.conn.Close()
	}
}

func (c *botClient) readLoop() {
	for {
		_, payload, err := c.conn.ReadMessage()
		if err != nil {
			c.done <- err
			close(c.done)
			return
		}
		var envelope serverEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			continue
		}
		c.handleEnvelope(envelope)
		select {
		case c.inbox <- envelope:
		default:
		}
	}
}

func (c *botClient) handleEnvelope(envelope serverEnvelope) {
	switch envelope.Type {
	case "snapshot":
		var snapshot worldRuntimeSnapshot
		if json.Unmarshal(envelope.Payload, &snapshot) == nil {
			c.mu.Lock()
			c.snapshot = snapshot
			c.mu.Unlock()
		}
	case "inventory_state":
		var state runtimeInventoryState
		if json.Unmarshal(envelope.Payload, &state) == nil && state.PlayerID == c.id {
			c.mu.Lock()
			c.inventory = state
			c.mu.Unlock()
		}
	case "hotbar_state":
		var state runtimeHotbarState
		if json.Unmarshal(envelope.Payload, &state) == nil && state.PlayerID == c.id {
			c.mu.Lock()
			c.hotbar = state
			c.mu.Unlock()
		}
	}
}

func (c *botClient) send(typ string, payload any) error {
	return c.conn.WriteJSON(clientEnvelope{
		Type:    typ,
		Payload: payload,
	})
}

func (c *botClient) waitForSnapshot(ctx context.Context) (worldRuntimeSnapshot, error) {
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "snapshot" {
			return false
		}
		var snapshot worldRuntimeSnapshot
		if json.Unmarshal(envelope.Payload, &snapshot) != nil {
			return false
		}
		_, ok := snapshot.Players[c.id]
		if !ok {
			return false
		}
		c.mu.Lock()
		c.snapshot = snapshot
		c.mu.Unlock()
		return true
	})
	if err != nil {
		return worldRuntimeSnapshot{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.snapshot, nil
}

func (c *botClient) exerciseMovement(ctx context.Context) error {
	snapshot, err := c.waitForSnapshot(ctx)
	if err != nil {
		return err
	}
	player := snapshot.Players[c.id]
	if err := c.send("input", inputPayload{
		PlayerID: c.id,
		Input: runtimeInputState{
			MoveX:   1,
			MoveZ:   0,
			Running: true,
			Jump:    false,
		},
	}); err != nil {
		return err
	}

	_, err = c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "snapshot" {
			return false
		}
		var next worldRuntimeSnapshot
		if json.Unmarshal(envelope.Payload, &next) != nil {
			return false
		}
		state, ok := next.Players[c.id]
		if !ok {
			return false
		}
		distance := math.Hypot(state.X-player.X, state.Z-player.Z)
		return distance > 0.05
	})
	if err != nil {
		return err
	}

	return c.send("input", inputPayload{
		PlayerID: c.id,
		Input: runtimeInputState{
			MoveX:   0,
			MoveZ:   0,
			Running: false,
			Jump:    false,
		},
	})
}

func (c *botClient) selectHotbarSlot(ctx context.Context, slotIndex int) error {
	if err := c.send("hotbar_select", hotbarSelectPayload{
		PlayerID:  c.id,
		SlotIndex: slotIndex,
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "hotbar_state" {
			return false
		}
		var state runtimeHotbarState
		if json.Unmarshal(envelope.Payload, &state) != nil {
			return false
		}
		return state.PlayerID == c.id && state.SelectedIndex == slotIndex
	})
	return err
}

func (c *botClient) breakBlock(ctx context.Context, coord blockCoord) error {
	if err := c.send("block_action", blockActionPayload{
		PlayerID: c.id,
		Action:   "break",
		ChunkX:   coord.ChunkX,
		ChunkZ:   coord.ChunkZ,
		X:        coord.X,
		Y:        coord.Y,
		Z:        coord.Z,
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "block_delta" {
			return false
		}
		var delta runtimeBlockDelta
		if json.Unmarshal(envelope.Payload, &delta) != nil {
			return false
		}
		return delta.Action == "break" && delta.ChunkX == coord.ChunkX && delta.ChunkZ == coord.ChunkZ && delta.X == coord.X && delta.Y == coord.Y && delta.Z == coord.Z
	})
	return err
}

func (c *botClient) placeBlock(ctx context.Context, coord blockCoord) error {
	if err := c.send("block_action", blockActionPayload{
		PlayerID:  c.id,
		Action:    "place",
		ChunkX:    coord.ChunkX,
		ChunkZ:    coord.ChunkZ,
		X:         coord.X,
		Y:         coord.Y,
		Z:         coord.Z,
		BlockType: "wood",
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "block_delta" {
			return false
		}
		var delta runtimeBlockDelta
		if json.Unmarshal(envelope.Payload, &delta) != nil {
			return false
		}
		return delta.Action == "place" && delta.ChunkX == coord.ChunkX && delta.ChunkZ == coord.ChunkZ && delta.X == coord.X && delta.Y == coord.Y && delta.Z == coord.Z
	})
	return err
}

func (c *botClient) waitForInventoryAtLeast(ctx context.Context, resource string, minimum int) error {
	c.mu.Lock()
	if c.inventory.Resources != nil && c.inventory.Resources[resource] >= minimum {
		c.mu.Unlock()
		return nil
	}
	c.mu.Unlock()
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "inventory_state" {
			return false
		}
		var state runtimeInventoryState
		if json.Unmarshal(envelope.Payload, &state) != nil {
			return false
		}
		if state.PlayerID != c.id {
			return false
		}
		return state.Resources[resource] >= minimum
	})
	return err
}

func (c *botClient) attackTarget(ctx context.Context, slotID, kind, targetID, label string) error {
	actionID := newActionID()
	if err := c.send("combat_action", combatActionPayload{
		PlayerID:    c.id,
		ActionID:    actionID,
		SlotID:      slotID,
		Kind:        kind,
		TargetID:    targetID,
		TargetLabel: label,
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "combat_result" {
			return false
		}
		var result runtimeCombatResult
		if json.Unmarshal(envelope.Payload, &result) != nil {
			return false
		}
		return result.ActionID == actionID && result.PlayerID == c.id && result.Accepted
	})
	return err
}

func (c *botClient) useBandage(ctx context.Context) error {
	actionID := newActionID()
	if err := c.send("combat_action", combatActionPayload{
		PlayerID: c.id,
		ActionID: actionID,
		SlotID:   "slot-4-bandage",
		Kind:     "item",
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "combat_result" {
			return false
		}
		var result runtimeCombatResult
		if json.Unmarshal(envelope.Payload, &result) != nil {
			return false
		}
		return result.ActionID == actionID && result.PlayerID == c.id && result.Accepted
	})
	return err
}

func (c *botClient) interactTarget(ctx context.Context, targetID, label string) error {
	actionID := newActionID()
	if err := c.send("interact_action", interactActionPayload{
		PlayerID:    c.id,
		ActionID:    actionID,
		TargetID:    targetID,
		TargetLabel: label,
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "interact_result" {
			return false
		}
		var result runtimeInteractResult
		if json.Unmarshal(envelope.Payload, &result) != nil {
			return false
		}
		return result.ActionID == actionID && result.PlayerID == c.id && result.Accepted
	})
	return err
}

func (c *botClient) craft(ctx context.Context, recipeID string, count int) error {
	actionID := newActionID()
	if err := c.send("craft_request", craftRequestPayload{
		PlayerID: c.id,
		ActionID: actionID,
		RecipeID: recipeID,
		Count:    count,
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "craft_result" {
			return false
		}
		var result runtimeCraftResult
		if json.Unmarshal(envelope.Payload, &result) != nil {
			return false
		}
		return result.ActionID == actionID && result.PlayerID == c.id && result.Accepted
	})
	return err
}

func (c *botClient) containerDepositWithdraw(ctx context.Context, containerID, resource string, amount int) error {
	depositID := newActionID()
	if err := c.send("container_action", containerActionPayload{
		PlayerID:    c.id,
		ActionID:    depositID,
		ContainerID: containerID,
		Operation:   "deposit",
		ResourceID:  resource,
		Amount:      amount,
	}); err != nil {
		return err
	}
	if _, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "container_result" {
			return false
		}
		var result runtimeContainerActionResult
		if json.Unmarshal(envelope.Payload, &result) != nil {
			return false
		}
		return result.ActionID == depositID && result.PlayerID == c.id && result.Accepted
	}); err != nil {
		return err
	}

	withdrawID := newActionID()
	if err := c.send("container_action", containerActionPayload{
		PlayerID:    c.id,
		ActionID:    withdrawID,
		ContainerID: containerID,
		Operation:   "withdraw",
		ResourceID:  resource,
		Amount:      amount,
	}); err != nil {
		return err
	}
	_, err := c.waitFor(ctx, func(envelope serverEnvelope) bool {
		if envelope.Type != "container_result" {
			return false
		}
		var result runtimeContainerActionResult
		if json.Unmarshal(envelope.Payload, &result) != nil {
			return false
		}
		return result.ActionID == withdrawID && result.PlayerID == c.id && result.Accepted
	})
	return err
}

func (c *botClient) waitFor(ctx context.Context, predicate func(serverEnvelope) bool) (serverEnvelope, error) {
	for {
		select {
		case envelope := <-c.inbox:
			if predicate(envelope) {
				return envelope, nil
			}
		case err := <-c.done:
			if err != nil {
				return serverEnvelope{}, err
			}
			return serverEnvelope{}, fmt.Errorf("connection closed")
		case <-ctx.Done():
			return serverEnvelope{}, ctx.Err()
		}
	}
}

type blockCoord struct {
	ChunkX int
	ChunkZ int
	X      int
	Y      int
	Z      int
}

func findBreakCoords(minRoll, maxRoll int, count int) []blockCoord {
	results := make([]blockCoord, 0, count)
	for x := 1; x <= 18; x++ {
		for z := 1; z <= 18; z++ {
			roll := breakResourceRoll(0, 0, x, 1, z)
			if roll >= minRoll && roll <= maxRoll {
				results = append(results, blockCoord{
					ChunkX: 0,
					ChunkZ: 0,
					X:      x,
					Y:      1,
					Z:      z,
				})
				if len(results) >= count {
					return results
				}
			}
		}
	}
	return results
}

func breakResourceRoll(chunkX int, chunkZ int, x int, y int, z int) int {
	value := (chunkX * 73856093) ^ (chunkZ * 19349663) ^ (x * 83492791) ^ (y * 1237) ^ (z * 29791)
	if value < 0 {
		value = -value
	}
	return value % 100
}

func newActionID() string {
	return fmt.Sprintf("action-%d-%d", time.Now().UnixNano(), rand.IntN(10000))
}

func dialWithRetry(ctx context.Context, wsURL string) (*websocket.Conn, error) {
	if !strings.HasPrefix(wsURL, "ws://") && !strings.HasPrefix(wsURL, "wss://") {
		return nil, fmt.Errorf("invalid ws url: %s", wsURL)
	}
	var lastErr error
	for attempt := 0; attempt < 12; attempt++ {
		dialer := websocket.DefaultDialer
		conn, _, err := dialer.DialContext(ctx, wsURL, nil)
		if err == nil {
			return conn, nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(180 * time.Millisecond):
		}
	}
	return nil, lastErr
}

func fail(err error) {
	fmt.Println(err.Error())
	os.Exit(1)
}
