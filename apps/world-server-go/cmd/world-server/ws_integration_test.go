package main

import (
	"encoding/json"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type rawServerEnvelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func TestWebSocketReconnectResumesMovementAndBlockState(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	connA, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial A failed: %v", err)
	}
	defer connA.Close()

	_ = waitForSnapshot(t, connA, func(snapshot worldRuntimeSnapshot) bool {
		return snapshot.Tick == 0
	})

	writeClientEnvelope(t, connA, "join", joinRuntimeRequest{
		WorldSeed: "seed-reconnect",
		PlayerID:  "p-reconnect",
		StartX:    2,
		StartZ:    -3,
	})

	_ = waitForSnapshot(t, connA, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["p-reconnect"]
		return ok
	})

	writeClientEnvelope(t, connA, "input", inputPayload{
		PlayerID: "p-reconnect",
		Input: runtimeInputState{
			MoveX:   1,
			MoveZ:   0,
			Running: false,
		},
	})
	time.Sleep(20 * time.Millisecond)

	hub.advanceOneTick()
	hub.broadcast(serverEnvelope{
		Type:    "snapshot",
		Payload: hub.snapshot(),
	})

	movedSnapshot := waitForSnapshot(t, connA, func(snapshot worldRuntimeSnapshot) bool {
		player, ok := snapshot.Players["p-reconnect"]
		return ok && player.X > 2
	})
	movedPlayer := movedSnapshot.Players["p-reconnect"]

	writeClientEnvelope(t, connA, "block_action", blockActionPayload{
		PlayerID:  "p-reconnect",
		Action:    "place",
		ChunkX:    0,
		ChunkZ:    0,
		X:         3,
		Y:         4,
		Z:         5,
		BlockType: "wood",
	})

	_ = waitForBlockDelta(t, connA, func(delta runtimeBlockDelta) bool {
		return delta.Action == "place" &&
			delta.ChunkX == 0 &&
			delta.ChunkZ == 0 &&
			delta.X == 3 &&
			delta.Y == 4 &&
			delta.Z == 5 &&
			delta.BlockType == "wood"
	})

	if err := connA.Close(); err != nil {
		t.Fatalf("close A failed: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	connB, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial B failed: %v", err)
	}
	defer connB.Close()

	reconnectedSnapshot := waitForSnapshot(t, connB, func(snapshot worldRuntimeSnapshot) bool {
		player, ok := snapshot.Players["p-reconnect"]
		if !ok {
			return false
		}
		return math.Abs(player.X-movedPlayer.X) < 0.01 && math.Abs(player.Z-movedPlayer.Z) < 0.01
	})
	reconnectedPlayer := reconnectedSnapshot.Players["p-reconnect"]

	_ = waitForBlockDelta(t, connB, func(delta runtimeBlockDelta) bool {
		return delta.Action == "place" &&
			delta.ChunkX == 0 &&
			delta.ChunkZ == 0 &&
			delta.X == 3 &&
			delta.Y == 4 &&
			delta.Z == 5 &&
			delta.BlockType == "wood"
	})

	writeClientEnvelope(t, connB, "input", inputPayload{
		PlayerID: "p-reconnect",
		Input: runtimeInputState{
			MoveX:   0,
			MoveZ:   1,
			Running: true,
		},
	})
	time.Sleep(20 * time.Millisecond)

	hub.advanceOneTick()
	hub.broadcast(serverEnvelope{
		Type:    "snapshot",
		Payload: hub.snapshot(),
	})

	nextSnapshot := waitForSnapshot(t, connB, func(snapshot worldRuntimeSnapshot) bool {
		player, ok := snapshot.Players["p-reconnect"]
		if !ok {
			return false
		}
		return snapshot.Tick > reconnectedSnapshot.Tick && player.Z > reconnectedPlayer.Z
	})
	nextPlayer := nextSnapshot.Players["p-reconnect"]

	if !(nextPlayer.Z > reconnectedPlayer.Z) {
		t.Fatalf("expected resumed movement after reconnect, before=%f after=%f", reconnectedPlayer.Z, nextPlayer.Z)
	}
}

func TestCombatReplicationTargetsActorAndNearbyPlayers(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	nearConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial near failed: %v", err)
	}
	defer nearConn.Close()
	farConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial far failed: %v", err)
	}
	defer farConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, nearConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, farConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-combat-repl",
		PlayerID:  "actor",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, nearConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-combat-repl",
		PlayerID:  "near",
		StartX:    8,
		StartZ:    0,
	})
	writeClientEnvelope(t, farConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-combat-repl",
		PlayerID:  "far",
		StartX:    250,
		StartZ:    250,
	})

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["actor"]
		return ok
	})
	_ = waitForSnapshot(t, nearConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["near"]
		return ok
	})
	_ = waitForSnapshot(t, farConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["far"]
		return ok
	})

	writeClientEnvelope(t, actorConn, "combat_action", combatActionPayload{
		PlayerID:     "actor",
		ActionID:     "a-actor-1",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetID:     "npc-1",
		TargetLabel:  "NPC 1",
		TargetWorldX: floatPtr(5),
		TargetWorldZ: floatPtr(0),
	})

	actorResult := waitForCombatResult(t, actorConn, func(result runtimeCombatResult) bool {
		return result.ActionID == "a-actor-1"
	})
	if !actorResult.Accepted {
		t.Fatalf("expected actor result accepted, got %#v", actorResult)
	}

	nearResult := waitForCombatResult(t, nearConn, func(result runtimeCombatResult) bool {
		return result.ActionID == "a-actor-1"
	})
	if !nearResult.Accepted {
		t.Fatalf("expected near result accepted, got %#v", nearResult)
	}

	assertNoCombatResultWithin(t, farConn, 500*time.Millisecond)
}

func TestCombatResultUsesAuthoritativePlayerTargetCoordinates(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	defenderConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial defender failed: %v", err)
	}
	defer defenderConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, defenderConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-combat-authoritative-target",
		PlayerID:  "actor-target",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, defenderConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-combat-authoritative-target",
		PlayerID:  "defender-target",
		StartX:    6,
		StartZ:    0,
	})

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["actor-target"]
		return ok
	})
	_ = waitForSnapshot(t, defenderConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["defender-target"]
		return ok
	})

	writeClientEnvelope(t, actorConn, "combat_action", combatActionPayload{
		PlayerID:     "actor-target",
		ActionID:     "combat-authoritative-target-1",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetID:     "defender-target",
		TargetLabel:  "spoofed",
		TargetWorldX: floatPtr(1),
		TargetWorldZ: floatPtr(1),
	})

	result := waitForCombatResult(t, actorConn, func(result runtimeCombatResult) bool {
		return result.ActionID == "combat-authoritative-target-1"
	})
	if !result.Accepted {
		t.Fatalf("expected accepted combat result, got %#v", result)
	}
	if result.TargetWorldX == nil || result.TargetWorldZ == nil {
		t.Fatalf("expected resolved target coordinates in result, got %#v", result)
	}
	if *result.TargetWorldX != 6 || *result.TargetWorldZ != 0 {
		t.Fatalf("expected defender authoritative coordinates, got x=%v z=%v", *result.TargetWorldX, *result.TargetWorldZ)
	}
}

func TestJoinReplicatesWorldFlagState(t *testing.T) {
	hub := newWorldHub()
	hub.worldFlags["story_phase"] = "chapter_1"
	hub.storyBeats = append(hub.storyBeats, "chapter_started")
	hub.spawnHints["hint-join"] = spawnHintEntry{
		hint: runtimeSpawnHint{
			HintID: "hint-join",
			Label:  "wolf-pack",
			ChunkX: 3,
			ChunkZ: -2,
		},
		expireTick: hub.tick + 1000,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	_ = waitForSnapshot(t, conn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, conn, "join", joinRuntimeRequest{
		WorldSeed: "seed-world-flag-join",
		PlayerID:  "player-world-flag",
		StartX:    0,
		StartZ:    0,
	})

	state := waitForWorldFlagState(t, conn, func(state runtimeWorldFlagState) bool {
		return state.Flags["story_phase"] == "chapter_1"
	})
	if state.Flags["story_phase"] != "chapter_1" {
		t.Fatalf("expected story_phase=chapter_1, got %#v", state.Flags)
	}

	directiveState := waitForWorldDirectiveState(t, conn, func(state runtimeDirectiveState) bool {
		return len(state.StoryBeats) > 0 && len(state.SpawnHints) > 0
	})
	if directiveState.StoryBeats[len(directiveState.StoryBeats)-1] != "chapter_started" {
		t.Fatalf("expected chapter_started story beat, got %#v", directiveState.StoryBeats)
	}
	if directiveState.SpawnHints[0].HintID != "hint-join" {
		t.Fatalf("expected hint-join in directive state, got %#v", directiveState.SpawnHints)
	}
}

func TestCombatAcceptsResolvableNonPlayerTargetTokenWithoutCoordinates(t *testing.T) {
	targetToken, targetX, targetZ, ok := findFirstResolvableTargetToken("seed-non-player-target")
	if !ok {
		t.Fatalf("expected resolvable non-player target token")
	}

	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-non-player-target",
		PlayerID:  "actor-non-player",
		StartX:    targetX,
		StartZ:    targetZ,
	})

	writeClientEnvelope(t, actorConn, "combat_action", combatActionPayload{
		PlayerID: "actor-non-player",
		ActionID: "combat-non-player-token-1",
		SlotID:   "slot-2-ember-bolt",
		Kind:     "spell",
		TargetID: targetToken,
	})

	result := waitForCombatResult(t, actorConn, func(result runtimeCombatResult) bool {
		return result.ActionID == "combat-non-player-token-1"
	})
	if !result.Accepted {
		t.Fatalf("expected non-player target token accepted, got %#v", result)
	}
	if result.TargetWorldX == nil || result.TargetWorldZ == nil {
		t.Fatalf("expected resolved target coordinates, got %#v", result)
	}
	if !nearlyEqual(*result.TargetWorldX, targetX) || !nearlyEqual(*result.TargetWorldZ, targetZ) {
		t.Fatalf("expected resolved coordinates x=%f z=%f, got x=%v z=%v", targetX, targetZ, *result.TargetWorldX, *result.TargetWorldZ)
	}
}

func TestHotbarSelectionReplicatesToOwnerOnly(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	peerConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial peer failed: %v", err)
	}
	defer peerConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-hotbar",
		PlayerID:  "actor-hotbar",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, peerConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-hotbar",
		PlayerID:  "peer-hotbar",
		StartX:    10,
		StartZ:    0,
	})

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["actor-hotbar"]
		return ok
	})
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["peer-hotbar"]
		return ok
	})
	_ = waitForHotbarState(t, actorConn, func(state runtimeHotbarState) bool {
		return state.PlayerID == "actor-hotbar" && state.SelectedIndex == 0
	})

	writeClientEnvelope(t, actorConn, "hotbar_select", hotbarSelectPayload{
		PlayerID:  "actor-hotbar",
		SlotIndex: 3,
	})

	actorState := waitForHotbarState(t, actorConn, func(state runtimeHotbarState) bool {
		return state.PlayerID == "actor-hotbar" && state.SelectedIndex == 3
	})
	if len(actorState.SlotIDs) == 0 || actorState.SlotIDs[actorState.SelectedIndex] != "slot-4-bandage" {
		t.Fatalf("unexpected actor hotbar state: %#v", actorState)
	}

	assertNoHotbarStateForPlayerWithin(t, peerConn, "actor-hotbar", 500*time.Millisecond)
}

func TestItemCombatReplicatesUpdatedHotbarToOwnerOnly(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	peerConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial peer failed: %v", err)
	}
	defer peerConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-item-sync",
		PlayerID:  "actor-item",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, peerConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-item-sync",
		PlayerID:  "peer-item",
		StartX:    8,
		StartZ:    0,
	})

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["actor-item"]
		return ok
	})
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["peer-item"]
		return ok
	})
	_ = waitForHotbarState(t, actorConn, func(state runtimeHotbarState) bool {
		return state.PlayerID == "actor-item" && len(state.StackCounts) > 3 && state.StackCounts[3] == 3
	})

	writeClientEnvelope(t, actorConn, "combat_action", combatActionPayload{
		PlayerID: "actor-item",
		ActionID: "item-use-1",
		SlotID:   "slot-4-bandage",
		Kind:     "item",
	})

	actorResult := waitForCombatResult(t, actorConn, func(result runtimeCombatResult) bool {
		return result.ActionID == "item-use-1"
	})
	if !actorResult.Accepted {
		t.Fatalf("expected item use accepted, got %#v", actorResult)
	}

	actorHotbar := waitForHotbarState(t, actorConn, func(state runtimeHotbarState) bool {
		return state.PlayerID == "actor-item" && len(state.StackCounts) > 3 && state.StackCounts[3] == 2
	})
	if actorHotbar.StackCounts[3] != 2 {
		t.Fatalf("expected actor bandage stack 2, got %#v", actorHotbar.StackCounts)
	}

	assertNoHotbarStateForPlayerWithin(t, peerConn, "actor-item", 500*time.Millisecond)
}

func TestBlockBreakReplicatesInventoryStateToOwnerOnly(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	peerConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial peer failed: %v", err)
	}
	defer peerConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-break-inventory",
		PlayerID:  "actor-break",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, peerConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-break-inventory",
		PlayerID:  "peer-break",
		StartX:    8,
		StartZ:    0,
	})

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["actor-break"]
		return ok
	})
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["peer-break"]
		return ok
	})
	_ = waitForInventoryState(t, actorConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "actor-break" && state.Resources["salvage"] == 0
	})

	writeClientEnvelope(t, actorConn, "block_action", blockActionPayload{
		PlayerID: "actor-break",
		Action:   "break",
		ChunkX:   0,
		ChunkZ:   0,
		X:        1,
		Y:        1,
		Z:        1,
	})

	_ = waitForBlockDelta(t, actorConn, func(delta runtimeBlockDelta) bool {
		return delta.Action == "break" && delta.ChunkX == 0 && delta.ChunkZ == 0 && delta.X == 1 && delta.Y == 1 && delta.Z == 1
	})

	actorInventory := waitForInventoryState(t, actorConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "actor-break" && state.Resources["salvage"] == 1
	})
	if actorInventory.Resources["salvage"] != 1 {
		t.Fatalf("expected actor salvage 1, got %#v", actorInventory.Resources)
	}

	assertNoInventoryStateForPlayerWithin(t, peerConn, "actor-break", 500*time.Millisecond)
}

func TestCraftRequestReplicatesInventoryAndHotbarUpdatesToOwnerOnly(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	peerConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial peer failed: %v", err)
	}
	defer peerConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-craft-sync",
		PlayerID:  "actor-craft",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, peerConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-craft-sync",
		PlayerID:  "peer-craft",
		StartX:    6,
		StartZ:    0,
	})

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["actor-craft"]
		return ok
	})
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["peer-craft"]
		return ok
	})
	_ = waitForInventoryState(t, actorConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "actor-craft" && state.Resources["salvage"] == 0
	})
	if inventoryState, ok := hub.awardInventoryResources("actor-craft", map[string]int{
		"salvage": 4,
		"fiber":   3,
	}); ok {
		hub.broadcast(serverEnvelope{
			Type:    "inventory_state",
			Payload: inventoryState,
		})
	}

	_ = waitForInventoryState(t, actorConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "actor-craft" && state.Resources["salvage"] == 4 && state.Resources["fiber"] == 3
	})

	writeClientEnvelope(t, actorConn, "craft_request", craftRequestPayload{
		PlayerID: "actor-craft",
		ActionID: "craft-sync-1",
		RecipeID: "craft-bandage",
		Count:    1,
	})

	craftResult := waitForCraftResult(t, actorConn, func(result runtimeCraftResult) bool {
		return result.ActionID == "craft-sync-1"
	})
	if !craftResult.Accepted {
		t.Fatalf("expected craft accepted, got %#v", craftResult)
	}

	actorInventory := waitForInventoryState(t, actorConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "actor-craft" && state.Resources["salvage"] == 3 && state.Resources["fiber"] == 1
	})
	if actorInventory.Resources["salvage"] != 3 || actorInventory.Resources["fiber"] != 1 {
		t.Fatalf("expected salvage/fiber consumed, got %#v", actorInventory.Resources)
	}

	assertNoHotbarStateForPlayerWithin(t, peerConn, "actor-craft", 500*time.Millisecond)
	assertNoInventoryStateForPlayerWithin(t, peerConn, "actor-craft", 500*time.Millisecond)
}

func TestSnapshotReplicationScopesFarPlayers(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	nearConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial near failed: %v", err)
	}
	defer nearConn.Close()
	farConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial far failed: %v", err)
	}
	defer farConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, nearConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, farConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-snapshot-interest",
		PlayerID:  "actor-interest",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, nearConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-snapshot-interest",
		PlayerID:  "near-interest",
		StartX:    8,
		StartZ:    0,
	})
	writeClientEnvelope(t, farConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-snapshot-interest",
		PlayerID:  "far-interest",
		StartX:    280,
		StartZ:    280,
	})
	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, hasActor := snapshot.Players["actor-interest"]
		return hasActor
	})
	_ = waitForSnapshot(t, nearConn, func(snapshot worldRuntimeSnapshot) bool {
		_, hasNear := snapshot.Players["near-interest"]
		return hasNear
	})
	_ = waitForSnapshot(t, farConn, func(snapshot worldRuntimeSnapshot) bool {
		_, hasFar := snapshot.Players["far-interest"]
		return hasFar
	})

	hub.advanceOneTick()
	hub.broadcastSnapshots(snapshotReplicationRadius)

	actorSnapshot := waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, hasActor := snapshot.Players["actor-interest"]
		_, hasNear := snapshot.Players["near-interest"]
		_, hasFar := snapshot.Players["far-interest"]
		return snapshot.Tick >= 1 && hasActor && hasNear && !hasFar
	})
	if _, hasFar := actorSnapshot.Players["far-interest"]; hasFar {
		t.Fatalf("did not expect far player in actor snapshot")
	}

	farSnapshot := waitForSnapshot(t, farConn, func(snapshot worldRuntimeSnapshot) bool {
		_, hasActor := snapshot.Players["actor-interest"]
		_, hasNear := snapshot.Players["near-interest"]
		_, hasFar := snapshot.Players["far-interest"]
		return snapshot.Tick >= 1 && hasFar && !hasActor && !hasNear
	})
	if len(farSnapshot.Players) != 1 {
		t.Fatalf("expected far snapshot to include only far player, got %#v", farSnapshot.Players)
	}
}

func TestContainerActionReplicatesStateUpdates(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	actorConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial actor failed: %v", err)
	}
	defer actorConn.Close()
	peerConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial peer failed: %v", err)
	}
	defer peerConn.Close()

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, actorConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-container-sync",
		PlayerID:  "actor-container",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, peerConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-container-sync",
		PlayerID:  "peer-container",
		StartX:    4,
		StartZ:    0,
	})

	_ = waitForSnapshot(t, actorConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["actor-container"]
		return ok
	})
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["peer-container"]
		return ok
	})
	_ = waitForContainerState(t, actorConn, func(state runtimeContainerState) bool {
		return state.ContainerID == worldSharedContainerID && state.Resources["salvage"] == 0
	})

	writeClientEnvelope(t, actorConn, "block_action", blockActionPayload{
		PlayerID: "actor-container",
		Action:   "break",
		ChunkX:   0,
		ChunkZ:   0,
		X:        1,
		Y:        1,
		Z:        1,
	})
	_ = waitForInventoryState(t, actorConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "actor-container" && state.Resources["salvage"] == 1
	})

	writeClientEnvelope(t, actorConn, "container_action", containerActionPayload{
		PlayerID:    "actor-container",
		ActionID:    "container-sync-1",
		ContainerID: worldSharedContainerID,
		Operation:   "deposit",
		ResourceID:  "salvage",
		Amount:      1,
	})

	containerResult := waitForContainerResult(t, actorConn, func(result runtimeContainerActionResult) bool {
		return result.ActionID == "container-sync-1"
	})
	if !containerResult.Accepted {
		t.Fatalf("expected container action accepted, got %#v", containerResult)
	}

	actorInventory := waitForInventoryState(t, actorConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "actor-container" && state.Resources["salvage"] == 0
	})
	if actorInventory.Resources["salvage"] != 0 {
		t.Fatalf("expected inventory salvage consumed to 0, got %#v", actorInventory.Resources)
	}

	peerContainer := waitForContainerState(t, peerConn, func(state runtimeContainerState) bool {
		return state.ContainerID == worldSharedContainerID && state.Resources["salvage"] == 1
	})
	if peerContainer.Resources["salvage"] != 1 {
		t.Fatalf("expected peer container salvage 1, got %#v", peerContainer.Resources)
	}
}

func TestPrivateContainerAccessIsOwnerOnly(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", buildWSHandler(hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	ownerConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial owner failed: %v", err)
	}
	defer ownerConn.Close()
	peerConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial peer failed: %v", err)
	}
	defer peerConn.Close()

	_ = waitForSnapshot(t, ownerConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })
	_ = waitForSnapshot(t, peerConn, func(snapshot worldRuntimeSnapshot) bool { return snapshot.Tick == 0 })

	writeClientEnvelope(t, ownerConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-private-container",
		PlayerID:  "owner-player",
		StartX:    0,
		StartZ:    0,
	})
	writeClientEnvelope(t, peerConn, "join", joinRuntimeRequest{
		WorldSeed: "seed-private-container",
		PlayerID:  "peer-player",
		StartX:    3,
		StartZ:    0,
	})

	_ = waitForSnapshot(t, ownerConn, func(snapshot worldRuntimeSnapshot) bool {
		_, ok := snapshot.Players["owner-player"]
		return ok
	})
	_ = waitForInventoryState(t, ownerConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "owner-player"
	})
	_ = waitForContainerState(t, ownerConn, func(state runtimeContainerState) bool {
		return state.ContainerID == playerPrivateContainerID("owner-player")
	})

	if inventoryState, ok := hub.awardInventoryResources("owner-player", map[string]int{"salvage": 1}); ok {
		hub.broadcast(serverEnvelope{
			Type:    "inventory_state",
			Payload: inventoryState,
		})
	}
	_ = waitForInventoryState(t, ownerConn, func(state runtimeInventoryState) bool {
		return state.PlayerID == "owner-player" && state.Resources["salvage"] == 1
	})

	writeClientEnvelope(t, ownerConn, "container_action", containerActionPayload{
		PlayerID:    "owner-player",
		ActionID:    "private-ok",
		ContainerID: playerPrivateContainerID("owner-player"),
		Operation:   "deposit",
		ResourceID:  "salvage",
		Amount:      1,
	})
	okResult := waitForContainerResult(t, ownerConn, func(result runtimeContainerActionResult) bool {
		return result.ActionID == "private-ok"
	})
	if !okResult.Accepted {
		t.Fatalf("expected owner private container action accepted, got %#v", okResult)
	}

	writeClientEnvelope(t, peerConn, "container_action", containerActionPayload{
		PlayerID:    "peer-player",
		ActionID:    "private-forbidden",
		ContainerID: playerPrivateContainerID("owner-player"),
		Operation:   "withdraw",
		ResourceID:  "salvage",
		Amount:      1,
	})
	forbidden := waitForContainerResult(t, peerConn, func(result runtimeContainerActionResult) bool {
		return result.ActionID == "private-forbidden"
	})
	if forbidden.Accepted || forbidden.Reason != "container_forbidden" {
		t.Fatalf("expected container_forbidden, got %#v", forbidden)
	}
}

func writeClientEnvelope(t *testing.T, conn *websocket.Conn, messageType string, payload any) {
	t.Helper()
	if err := conn.WriteJSON(clientEnvelope{
		Type:    messageType,
		Payload: mustMarshalRawMessage(t, payload),
	}); err != nil {
		t.Fatalf("write %s failed: %v", messageType, err)
	}
}

func mustMarshalRawMessage(t *testing.T, payload any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload failed: %v", err)
	}
	return encoded
}

func waitForSnapshot(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(snapshot worldRuntimeSnapshot) bool,
) worldRuntimeSnapshot {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "snapshot" {
			continue
		}
		var snapshot worldRuntimeSnapshot
		if err := json.Unmarshal(envelope.Payload, &snapshot); err != nil {
			t.Fatalf("decode snapshot failed: %v", err)
		}
		if predicate(snapshot) {
			return snapshot
		}
	}
	t.Fatalf("timed out waiting for matching snapshot")
	return worldRuntimeSnapshot{}
}

func waitForBlockDelta(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(delta runtimeBlockDelta) bool,
) runtimeBlockDelta {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "block_delta" {
			continue
		}
		var delta runtimeBlockDelta
		if err := json.Unmarshal(envelope.Payload, &delta); err != nil {
			t.Fatalf("decode block delta failed: %v", err)
		}
		if predicate(delta) {
			return delta
		}
	}
	t.Fatalf("timed out waiting for matching block delta")
	return runtimeBlockDelta{}
}

func waitForCombatResult(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(result runtimeCombatResult) bool,
) runtimeCombatResult {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "combat_result" {
			continue
		}
		var result runtimeCombatResult
		if err := json.Unmarshal(envelope.Payload, &result); err != nil {
			t.Fatalf("decode combat result failed: %v", err)
		}
		if predicate(result) {
			return result
		}
	}
	t.Fatalf("timed out waiting for matching combat result")
	return runtimeCombatResult{}
}

func waitForHotbarState(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(state runtimeHotbarState) bool,
) runtimeHotbarState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "hotbar_state" {
			continue
		}
		var state runtimeHotbarState
		if err := json.Unmarshal(envelope.Payload, &state); err != nil {
			t.Fatalf("decode hotbar state failed: %v", err)
		}
		if predicate(state) {
			return state
		}
	}
	t.Fatalf("timed out waiting for matching hotbar state")
	return runtimeHotbarState{}
}

func waitForInventoryState(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(state runtimeInventoryState) bool,
) runtimeInventoryState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "inventory_state" {
			continue
		}
		var state runtimeInventoryState
		if err := json.Unmarshal(envelope.Payload, &state); err != nil {
			t.Fatalf("decode inventory state failed: %v", err)
		}
		if predicate(state) {
			return state
		}
	}
	t.Fatalf("timed out waiting for matching inventory state")
	return runtimeInventoryState{}
}

func waitForCraftResult(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(result runtimeCraftResult) bool,
) runtimeCraftResult {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "craft_result" {
			continue
		}
		var result runtimeCraftResult
		if err := json.Unmarshal(envelope.Payload, &result); err != nil {
			t.Fatalf("decode craft result failed: %v", err)
		}
		if predicate(result) {
			return result
		}
	}
	t.Fatalf("timed out waiting for matching craft result")
	return runtimeCraftResult{}
}

func waitForContainerState(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(state runtimeContainerState) bool,
) runtimeContainerState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "container_state" {
			continue
		}
		var state runtimeContainerState
		if err := json.Unmarshal(envelope.Payload, &state); err != nil {
			t.Fatalf("decode container state failed: %v", err)
		}
		if predicate(state) {
			return state
		}
	}
	t.Fatalf("timed out waiting for matching container state")
	return runtimeContainerState{}
}

func waitForWorldFlagState(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(state runtimeWorldFlagState) bool,
) runtimeWorldFlagState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "world_flag_state" {
			continue
		}
		var state runtimeWorldFlagState
		if err := json.Unmarshal(envelope.Payload, &state); err != nil {
			t.Fatalf("decode world flag state failed: %v", err)
		}
		if predicate(state) {
			return state
		}
	}
	t.Fatalf("timed out waiting for matching world flag state")
	return runtimeWorldFlagState{}
}

func waitForWorldDirectiveState(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(state runtimeDirectiveState) bool,
) runtimeDirectiveState {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "world_directive_state" {
			continue
		}
		var state runtimeDirectiveState
		if err := json.Unmarshal(envelope.Payload, &state); err != nil {
			t.Fatalf("decode world directive state failed: %v", err)
		}
		if predicate(state) {
			return state
		}
	}
	t.Fatalf("timed out waiting for matching world directive state")
	return runtimeDirectiveState{}
}

func waitForContainerResult(
	t *testing.T,
	conn *websocket.Conn,
	predicate func(result runtimeContainerActionResult) bool,
) runtimeContainerActionResult {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		envelope, ok := readServerEnvelope(t, conn)
		if !ok {
			continue
		}
		if envelope.Type != "container_result" {
			continue
		}
		var result runtimeContainerActionResult
		if err := json.Unmarshal(envelope.Payload, &result); err != nil {
			t.Fatalf("decode container result failed: %v", err)
		}
		if predicate(result) {
			return result
		}
	}
	t.Fatalf("timed out waiting for matching container result")
	return runtimeContainerActionResult{}
}

func assertNoCombatResultWithin(t *testing.T, conn *websocket.Conn, duration time.Duration) {
	t.Helper()
	assertNoEnvelopeTypeWithin(t, conn, "combat_result", duration)
}

func assertNoEnvelopeTypeWithin(t *testing.T, conn *websocket.Conn, envelopeType string, duration time.Duration) {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(duration)); err != nil {
		t.Fatalf("set read deadline failed: %v", err)
	}
	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return
			}
			netError, ok := err.(net.Error)
			if ok && netError.Timeout() {
				return
			}
			t.Fatalf("read websocket message failed: %v", err)
		}
		var envelope rawServerEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("decode server envelope failed: %v", err)
		}
		if envelope.Type == envelopeType {
			t.Fatalf("unexpected %s received: %s", envelopeType, string(envelope.Payload))
		}
	}
}

func assertNoHotbarStateForPlayerWithin(t *testing.T, conn *websocket.Conn, playerID string, duration time.Duration) {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(duration)); err != nil {
		t.Fatalf("set read deadline failed: %v", err)
	}
	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return
			}
			netError, ok := err.(net.Error)
			if ok && netError.Timeout() {
				return
			}
			t.Fatalf("read websocket message failed: %v", err)
		}
		var envelope rawServerEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("decode server envelope failed: %v", err)
		}
		if envelope.Type != "hotbar_state" {
			continue
		}
		var state runtimeHotbarState
		if err := json.Unmarshal(envelope.Payload, &state); err != nil {
			t.Fatalf("decode hotbar state failed: %v", err)
		}
		if state.PlayerID == playerID {
			t.Fatalf("unexpected hotbar_state for %s received: %s", playerID, string(envelope.Payload))
		}
	}
}

func assertNoInventoryStateForPlayerWithin(t *testing.T, conn *websocket.Conn, playerID string, duration time.Duration) {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(duration)); err != nil {
		t.Fatalf("set read deadline failed: %v", err)
	}
	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return
			}
			netError, ok := err.(net.Error)
			if ok && netError.Timeout() {
				return
			}
			t.Fatalf("read websocket message failed: %v", err)
		}
		var envelope rawServerEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("decode server envelope failed: %v", err)
		}
		if envelope.Type != "inventory_state" {
			continue
		}
		var state runtimeInventoryState
		if err := json.Unmarshal(envelope.Payload, &state); err != nil {
			t.Fatalf("decode inventory state failed: %v", err)
		}
		if state.PlayerID == playerID {
			t.Fatalf("unexpected inventory_state for %s received: %s", playerID, string(envelope.Payload))
		}
	}
}

func readServerEnvelope(t *testing.T, conn *websocket.Conn) (rawServerEnvelope, bool) {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond)); err != nil {
		t.Fatalf("set read deadline failed: %v", err)
	}
	_, payload, err := conn.ReadMessage()
	if err != nil {
		if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
			return rawServerEnvelope{}, false
		}
		netError, ok := err.(net.Error)
		if ok && netError.Timeout() {
			return rawServerEnvelope{}, false
		}
		t.Fatalf("read websocket message failed: %v", err)
	}
	var envelope rawServerEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode server envelope failed: %v", err)
	}
	return envelope, true
}
