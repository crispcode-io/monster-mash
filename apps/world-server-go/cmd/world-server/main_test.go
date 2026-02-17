package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestListBlockDeltasSortsDeterministically(t *testing.T) {
	hub := newWorldHub()
	hub.placed[blockKey(0, 0, 1, 10, 1)] = "dirt"
	hub.placed[blockKey(-1, 2, 0, 5, 0)] = "stone"
	hub.placed[blockKey(0, 0, 1, 9, 1)] = "grass"
	hub.removed[blockKey(-1, 2, 0, 4, 0)] = true
	hub.removed[blockKey(0, 0, 1, 10, 0)] = true

	actual := hub.listBlockDeltas()
	expected := []runtimeBlockDelta{
		{Action: "break", ChunkX: -1, ChunkZ: 2, X: 0, Y: 4, Z: 0},
		{Action: "place", ChunkX: -1, ChunkZ: 2, X: 0, Y: 5, Z: 0, BlockType: "stone"},
		{Action: "place", ChunkX: 0, ChunkZ: 0, X: 1, Y: 9, Z: 1, BlockType: "grass"},
		{Action: "break", ChunkX: 0, ChunkZ: 0, X: 1, Y: 10, Z: 0},
		{Action: "place", ChunkX: 0, ChunkZ: 0, X: 1, Y: 10, Z: 1, BlockType: "dirt"},
	}

	if !reflect.DeepEqual(expected, actual) {
		t.Fatalf("unexpected block delta order\nexpected: %#v\nactual: %#v", expected, actual)
	}
}

func TestListBlockDeltasOrderIsStableAcrossCalls(t *testing.T) {
	hub := newWorldHub()
	hub.placed[blockKey(5, -2, 7, 9, 1)] = "stone"
	hub.placed[blockKey(5, -2, 7, 8, 1)] = "dirt"
	hub.removed[blockKey(5, -2, 7, 8, 1)] = true
	hub.removed[blockKey(-3, 4, 0, 0, 0)] = true

	first := hub.listBlockDeltas()
	for index := 0; index < 20; index++ {
		next := hub.listBlockDeltas()
		if !reflect.DeepEqual(first, next) {
			t.Fatalf("listBlockDeltas not stable on iteration %d\nfirst: %#v\nnext: %#v", index, first, next)
		}
	}
}

func TestApplyCombatActionEnforcesCooldownBySlot(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-combat",
		PlayerID:  "p1",
		StartX:    0,
		StartZ:    0,
	})

	first := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "p1",
		ActionID:     "a-1",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetWorldX: floatPtr(4),
		TargetWorldZ: floatPtr(0),
	})
	if !first.Accepted {
		t.Fatalf("expected first action accepted, got %#v", first)
	}

	second := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "p1",
		ActionID:     "a-2",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetWorldX: floatPtr(4),
		TargetWorldZ: floatPtr(0),
	})
	if second.Accepted {
		t.Fatalf("expected second action rejected by cooldown, got %#v", second)
	}
	if second.Reason != "cooldown_active" {
		t.Fatalf("expected cooldown_active reason, got %q", second.Reason)
	}
	if second.CooldownRemainingMs <= 0 {
		t.Fatalf("expected positive cooldown remaining, got %d", second.CooldownRemainingMs)
	}

	for tick := 0; tick < 20; tick++ {
		hub.advanceOneTick()
	}

	third := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "p1",
		ActionID:     "a-3",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetWorldX: floatPtr(4),
		TargetWorldZ: floatPtr(0),
	})
	if !third.Accepted {
		t.Fatalf("expected action accepted after cooldown, got %#v", third)
	}
}

func TestApplyCombatActionRejectsUnknownPlayerAndInvalidSlot(t *testing.T) {
	hub := newWorldHub()

	unknownPlayer := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "missing",
		ActionID:     "a-1",
		SlotID:       "slot-1-rust-blade",
		Kind:         "melee",
		TargetWorldX: floatPtr(2),
		TargetWorldZ: floatPtr(2),
	})
	if unknownPlayer.Accepted || unknownPlayer.Reason != "player_not_found" {
		t.Fatalf("expected player_not_found, got %#v", unknownPlayer)
	}

	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-combat",
		PlayerID:  "p2",
		StartX:    0,
		StartZ:    0,
	})

	invalidSlot := hub.applyCombatAction(combatActionPayload{
		PlayerID: "p2",
		ActionID: "a-2",
		SlotID:   "slot-invalid",
		Kind:     "spell",
	})
	if invalidSlot.Accepted || invalidSlot.Reason != "invalid_slot" {
		t.Fatalf("expected invalid_slot, got %#v", invalidSlot)
	}
}

func TestApplyCombatActionValidatesKindAndTargetRange(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-combat",
		PlayerID:  "p3",
		StartX:    0,
		StartZ:    0,
	})

	missingTarget := hub.applyCombatAction(combatActionPayload{
		PlayerID: "p3",
		ActionID: "a-missing",
		SlotID:   "slot-1-rust-blade",
		Kind:     "melee",
	})
	if missingTarget.Accepted || missingTarget.Reason != "missing_target" {
		t.Fatalf("expected missing_target, got %#v", missingTarget)
	}

	outOfRange := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "p3",
		ActionID:     "a-range",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetWorldX: floatPtr(200),
		TargetWorldZ: floatPtr(0),
	})
	if outOfRange.Accepted || outOfRange.Reason != "target_out_of_range" {
		t.Fatalf("expected target_out_of_range, got %#v", outOfRange)
	}

	invalidKind := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "p3",
		ActionID:     "a-kind",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "item",
		TargetWorldX: floatPtr(4),
		TargetWorldZ: floatPtr(1),
	})
	if invalidKind.Accepted || invalidKind.Reason != "invalid_slot_kind" {
		t.Fatalf("expected invalid_slot_kind, got %#v", invalidKind)
	}

	bandage := hub.applyCombatAction(combatActionPayload{
		PlayerID: "p3",
		ActionID: "a-self",
		SlotID:   "slot-4-bandage",
		Kind:     "item",
	})
	if !bandage.Accepted {
		t.Fatalf("expected slot-4-bandage accepted without target, got %#v", bandage)
	}

	hub.hotbarStates["p3"] = runtimeHotbarState{
		PlayerID:      "p3",
		SlotIDs:       []string{"slot-4-bandage"},
		StackCounts:   []int{3},
		SelectedIndex: 0,
		Tick:          hub.tick,
	}
	notEquipped := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "p3",
		ActionID:     "a-no-equip",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetWorldX: floatPtr(2),
		TargetWorldZ: floatPtr(0),
	})
	if notEquipped.Accepted || notEquipped.Reason != "slot_not_equipped" {
		t.Fatalf("expected slot_not_equipped, got %#v", notEquipped)
	}
}

func TestApplyCombatActionResolvesPlayerTargetCoordinatesAuthoritatively(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-combat-target-resolve",
		PlayerID:  "attacker",
		StartX:    0,
		StartZ:    0,
	})
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-combat-target-resolve",
		PlayerID:  "defender",
		StartX:    7,
		StartZ:    0,
	})

	result := hub.applyCombatAction(combatActionPayload{
		PlayerID:     "attacker",
		ActionID:     "resolve-1",
		SlotID:       "slot-2-ember-bolt",
		Kind:         "spell",
		TargetID:     "defender",
		TargetLabel:  "spoofed label",
		TargetWorldX: floatPtr(1),
		TargetWorldZ: floatPtr(1),
	})
	if !result.Accepted {
		t.Fatalf("expected target-resolved action accepted, got %#v", result)
	}
	if result.TargetWorldX == nil || result.TargetWorldZ == nil {
		t.Fatalf("expected resolved target coordinates, got %#v", result)
	}
	if *result.TargetWorldX != 7 || *result.TargetWorldZ != 0 {
		t.Fatalf("expected authoritative defender coordinates, got x=%v z=%v", *result.TargetWorldX, *result.TargetWorldZ)
	}
}

func TestApplyCombatActionRejectsUnknownTargetWithoutCoordinates(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-combat-target-missing",
		PlayerID:  "attacker",
		StartX:    0,
		StartZ:    0,
	})

	result := hub.applyCombatAction(combatActionPayload{
		PlayerID: "attacker",
		ActionID: "unknown-target-1",
		SlotID:   "slot-2-ember-bolt",
		Kind:     "spell",
		TargetID: "ghost-player",
	})
	if result.Accepted || result.Reason != "unknown_target" {
		t.Fatalf("expected unknown_target rejection, got %#v", result)
	}
}

func TestApplyCombatActionResolvesNonPlayerTargetTokenCoordinates(t *testing.T) {
	targetToken, targetX, targetZ, ok := findFirstResolvableTargetToken("default-seed")
	if !ok {
		t.Fatalf("expected at least one resolvable non-player target token")
	}

	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "default-seed",
		PlayerID:  "attacker",
		StartX:    targetX,
		StartZ:    targetZ,
	})

	result := hub.applyCombatAction(combatActionPayload{
		PlayerID: "attacker",
		ActionID: "non-player-token-1",
		SlotID:   "slot-2-ember-bolt",
		Kind:     "spell",
		TargetID: targetToken,
	})
	if !result.Accepted {
		t.Fatalf("expected non-player target token accepted, got %#v", result)
	}
	if result.TargetWorldX == nil || result.TargetWorldZ == nil {
		t.Fatalf("expected target coordinates in result, got %#v", result)
	}
	if !nearlyEqual(*result.TargetWorldX, targetX) || !nearlyEqual(*result.TargetWorldZ, targetZ) {
		t.Fatalf("expected resolved target coordinates x=%f z=%f, got x=%v z=%v", targetX, targetZ, *result.TargetWorldX, *result.TargetWorldZ)
	}
}

func TestSelectCombatRecipientsUsesActorAndNearbyPlayers(t *testing.T) {
	hub := newWorldHub()
	actorClient := &clientConn{playerIDs: map[string]struct{}{"actor": {}}}
	nearClient := &clientConn{playerIDs: map[string]struct{}{"near": {}}}
	farClient := &clientConn{playerIDs: map[string]struct{}{"far": {}}}
	hub.clients[actorClient] = struct{}{}
	hub.clients[nearClient] = struct{}{}
	hub.clients[farClient] = struct{}{}
	hub.players["actor"] = &playerState{PlayerID: "actor", X: 0, Z: 0}
	hub.players["near"] = &playerState{PlayerID: "near", X: 12, Z: -5}
	hub.players["far"] = &playerState{PlayerID: "far", X: 300, Z: 300}

	recipients := hub.selectCombatRecipients("actor", combatReplicationRadius)
	if !containsClient(recipients, actorClient) {
		t.Fatalf("expected actor client in recipients")
	}
	if !containsClient(recipients, nearClient) {
		t.Fatalf("expected nearby client in recipients")
	}
	if containsClient(recipients, farClient) {
		t.Fatalf("did not expect far client in recipients")
	}
}

func TestSnapshotForClientScopesFarPlayers(t *testing.T) {
	hub := newWorldHub()
	actorClient := &clientConn{playerIDs: map[string]struct{}{"actor": {}}}
	hub.players["actor"] = &playerState{PlayerID: "actor", X: 0, Z: 0}
	hub.players["near"] = &playerState{PlayerID: "near", X: 12, Z: 4}
	hub.players["far"] = &playerState{PlayerID: "far", X: 320, Z: 320}

	snapshot := hub.snapshotForClient(actorClient, snapshotReplicationRadius)
	if _, ok := snapshot.Players["actor"]; !ok {
		t.Fatalf("expected actor in client snapshot")
	}
	if _, ok := snapshot.Players["near"]; !ok {
		t.Fatalf("expected near player in client snapshot")
	}
	if _, ok := snapshot.Players["far"]; ok {
		t.Fatalf("did not expect far player in client snapshot")
	}
}

func TestSnapshotForClientWithoutAnchorsReturnsGlobalSnapshot(t *testing.T) {
	hub := newWorldHub()
	hub.players["p-a"] = &playerState{PlayerID: "p-a", X: 0, Z: 0}
	hub.players["p-b"] = &playerState{PlayerID: "p-b", X: 999, Z: 999}

	joiningClient := &clientConn{playerIDs: map[string]struct{}{}}
	snapshot := hub.snapshotForClient(joiningClient, snapshotReplicationRadius)
	if len(snapshot.Players) != 2 {
		t.Fatalf("expected global snapshot for unanchored client, got players=%d", len(snapshot.Players))
	}
}

func TestPrivateContainerOwner(t *testing.T) {
	owner, ok := privateContainerOwner("player:tester:stash")
	if !ok || owner != "tester" {
		t.Fatalf("expected tester private container owner, got owner=%q ok=%t", owner, ok)
	}

	if _, ok := privateContainerOwner("world:camp-shared"); ok {
		t.Fatalf("expected world container to have no private owner")
	}
	if _, ok := privateContainerOwner("player::stash"); ok {
		t.Fatalf("expected empty private owner to be rejected")
	}
}

func TestHotbarSelectionAndSnapshotState(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-hotbar",
		PlayerID:  "p-hotbar",
		StartX:    1,
		StartZ:    1,
	})

	state, ok := hub.hotbarStateForPlayer("p-hotbar")
	if !ok {
		t.Fatalf("expected hotbar state after join")
	}
	if len(state.SlotIDs) != len(defaultHotbarSlotIDs) {
		t.Fatalf("unexpected slot count: got=%d want=%d", len(state.SlotIDs), len(defaultHotbarSlotIDs))
	}
	if state.SelectedIndex != 0 {
		t.Fatalf("expected initial selected index 0, got %d", state.SelectedIndex)
	}
	if len(state.StackCounts) != len(state.SlotIDs) {
		t.Fatalf("expected stack counts per slot, got=%d slots=%d", len(state.StackCounts), len(state.SlotIDs))
	}
	if state.StackCounts[3] != 3 || state.StackCounts[4] != 2 {
		t.Fatalf("unexpected initial item stacks: %#v", state.StackCounts)
	}

	selectedState, selected := hub.applyHotbarSelection(hotbarSelectPayload{
		PlayerID:  "p-hotbar",
		SlotIndex: 2,
	})
	if !selected {
		t.Fatalf("expected hotbar selection accepted")
	}
	if selectedState.SelectedIndex != 2 {
		t.Fatalf("expected selected index 2, got %d", selectedState.SelectedIndex)
	}

	if _, ok := hub.applyHotbarSelection(hotbarSelectPayload{
		PlayerID:  "p-hotbar",
		SlotIndex: 999,
	}); ok {
		t.Fatalf("expected invalid index selection rejected")
	}
	if _, ok := hub.applyHotbarSelection(hotbarSelectPayload{
		PlayerID:  "missing",
		SlotIndex: 1,
	}); ok {
		t.Fatalf("expected missing player selection rejected")
	}
}

func TestApplyCombatActionConsumesItemStacks(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-item-consume",
		PlayerID:  "p-item",
		StartX:    0,
		StartZ:    0,
	})

	for castIndex := 0; castIndex < 3; castIndex++ {
		hub.tick += 100
		result := hub.applyCombatAction(combatActionPayload{
			PlayerID: "p-item",
			ActionID: "item-cast-" + intToString(castIndex),
			SlotID:   "slot-4-bandage",
			Kind:     "item",
		})
		if !result.Accepted {
			t.Fatalf("expected item action accepted at cast %d, got %#v", castIndex, result)
		}
	}

	state, ok := hub.hotbarStateForPlayer("p-item")
	if !ok {
		t.Fatalf("expected hotbar state for player")
	}
	if state.StackCounts[3] != 0 {
		t.Fatalf("expected bandage stack drained to 0, got %d", state.StackCounts[3])
	}

	hub.tick += 100
	depleted := hub.applyCombatAction(combatActionPayload{
		PlayerID: "p-item",
		ActionID: "item-cast-empty",
		SlotID:   "slot-4-bandage",
		Kind:     "item",
	})
	if depleted.Accepted || depleted.Reason != "insufficient_item" {
		t.Fatalf("expected insufficient_item after depletion, got %#v", depleted)
	}
}

func TestAwardInventoryResourceTracksTotals(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-inventory",
		PlayerID:  "p-inventory",
		StartX:    0,
		StartZ:    0,
	})

	initial, ok := hub.inventoryStateForPlayer("p-inventory")
	if !ok {
		t.Fatalf("expected inventory state for joined player")
	}
	if initial.Resources["salvage"] != 0 {
		t.Fatalf("expected initial salvage 0, got %d", initial.Resources["salvage"])
	}

	updated, changed := hub.awardInventoryResource("p-inventory", "salvage", 3)
	if !changed {
		t.Fatalf("expected inventory award accepted")
	}
	if updated.Resources["salvage"] != 3 {
		t.Fatalf("expected salvage total 3, got %d", updated.Resources["salvage"])
	}

	if _, changed := hub.awardInventoryResource("missing", "salvage", 1); changed {
		t.Fatalf("expected unknown player award rejected")
	}
	if _, changed := hub.awardInventoryResource("p-inventory", "salvage", 0); changed {
		t.Fatalf("expected zero-amount award rejected")
	}
}

func TestApplyCraftRequestConsumesResourcesAndUpdatesHotbar(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-craft",
		PlayerID:  "p-craft",
		StartX:    0,
		StartZ:    0,
	})
	if _, ok := hub.awardInventoryResources("p-craft", map[string]int{
		"salvage": 4,
		"fiber":   3,
	}); !ok {
		t.Fatalf("expected inventory awards")
	}

	result, inventoryState, hotbarState := hub.applyCraftRequest(craftRequestPayload{
		PlayerID: "p-craft",
		ActionID: "craft-1",
		RecipeID: "craft-bandage",
		Count:    1,
	})
	if !result.Accepted {
		t.Fatalf("expected craft accepted, got %#v", result)
	}
	if inventoryState == nil || hotbarState == nil {
		t.Fatalf("expected inventory+hotbar updates for accepted craft")
	}
	if inventoryState.Resources["salvage"] != 3 {
		t.Fatalf("expected salvage reduced to 3, got %d", inventoryState.Resources["salvage"])
	}
	if inventoryState.Resources["fiber"] != 1 {
		t.Fatalf("expected fiber reduced to 1, got %d", inventoryState.Resources["fiber"])
	}
	if len(hotbarState.StackCounts) <= 3 || hotbarState.StackCounts[3] != 4 {
		t.Fatalf("expected bandage stack increased to 4, got %#v", hotbarState.StackCounts)
	}

	rejected, _, _ := hub.applyCraftRequest(craftRequestPayload{
		PlayerID: "p-craft",
		ActionID: "craft-2",
		RecipeID: "craft-bandage",
		Count:    2,
	})
	if rejected.Accepted || rejected.Reason != "insufficient_resources" {
		t.Fatalf("expected insufficient_resources, got %#v", rejected)
	}
}

func TestApplyCraftRequestResourceOutputRecipe(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-craft-resource",
		PlayerID:  "p-craft-resource",
		StartX:    0,
		StartZ:    0,
	})
	if _, ok := hub.awardInventoryResources("p-craft-resource", map[string]int{
		"wood": 2,
	}); !ok {
		t.Fatalf("expected wood award")
	}

	result, inventoryState, hotbarState := hub.applyCraftRequest(craftRequestPayload{
		PlayerID: "p-craft-resource",
		ActionID: "craft-res-1",
		RecipeID: "craft-charcoal",
		Count:    1,
	})
	if !result.Accepted {
		t.Fatalf("expected charcoal craft accepted, got %#v", result)
	}
	if inventoryState == nil {
		t.Fatalf("expected inventory state update")
	}
	if hotbarState != nil {
		t.Fatalf("did not expect hotbar mutation for charcoal recipe")
	}
	if inventoryState.Resources["wood"] != 0 || inventoryState.Resources["coal"] != 1 {
		t.Fatalf("unexpected resource totals after charcoal craft: %#v", inventoryState.Resources)
	}
}

func TestApplyContainerActionDepositAndWithdraw(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-container",
		PlayerID:  "p-container",
		StartX:    0,
		StartZ:    0,
	})
	if _, ok := hub.awardInventoryResource("p-container", "salvage", 3); !ok {
		t.Fatalf("expected salvage award")
	}

	depositResult, depositInventory, depositContainer := hub.applyContainerAction(containerActionPayload{
		PlayerID:    "p-container",
		ActionID:    "container-1",
		ContainerID: worldSharedContainerID,
		Operation:   "deposit",
		ResourceID:  "salvage",
		Amount:      1,
	})
	if !depositResult.Accepted {
		t.Fatalf("expected deposit accepted, got %#v", depositResult)
	}
	if depositInventory == nil || depositInventory.Resources["salvage"] != 2 {
		t.Fatalf("expected inventory salvage 2 after deposit, got %#v", depositInventory)
	}
	if depositContainer == nil || depositContainer.Resources["salvage"] != 1 {
		t.Fatalf("expected container salvage 1 after deposit, got %#v", depositContainer)
	}

	withdrawResult, withdrawInventory, withdrawContainer := hub.applyContainerAction(containerActionPayload{
		PlayerID:    "p-container",
		ActionID:    "container-2",
		ContainerID: worldSharedContainerID,
		Operation:   "withdraw",
		ResourceID:  "salvage",
		Amount:      1,
	})
	if !withdrawResult.Accepted {
		t.Fatalf("expected withdraw accepted, got %#v", withdrawResult)
	}
	if withdrawInventory == nil || withdrawInventory.Resources["salvage"] != 3 {
		t.Fatalf("expected inventory salvage 3 after withdraw, got %#v", withdrawInventory)
	}
	if withdrawContainer == nil || withdrawContainer.Resources["salvage"] != 0 {
		t.Fatalf("expected container salvage 0 after withdraw, got %#v", withdrawContainer)
	}

	rejected, _, _ := hub.applyContainerAction(containerActionPayload{
		PlayerID:    "p-container",
		ActionID:    "container-3",
		ContainerID: worldSharedContainerID,
		Operation:   "withdraw",
		ResourceID:  "salvage",
		Amount:      1,
	})
	if rejected.Accepted || rejected.Reason != "container_insufficient_resources" {
		t.Fatalf("expected container_insufficient_resources, got %#v", rejected)
	}

	forbidden, _, _ := hub.applyContainerAction(containerActionPayload{
		PlayerID:    "p-container",
		ActionID:    "container-4",
		ContainerID: playerPrivateContainerID("other-player"),
		Operation:   "deposit",
		ResourceID:  "salvage",
		Amount:      1,
	})
	if forbidden.Accepted || forbidden.Reason != "container_forbidden" {
		t.Fatalf("expected container_forbidden, got %#v", forbidden)
	}
}

func TestIngestDirectiveGuardrailsAndApply(t *testing.T) {
	hub := newWorldHub()

	rejected := hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "bad-1",
		WorldSeed:   "default-seed",
		Type:        "mutate_blocks_directly",
	})
	if rejected.Accepted || rejected.Reason != "directive_type_blocked" {
		t.Fatalf("expected directive_type_blocked, got %#v", rejected)
	}

	accepted := hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "ok-1",
		WorldSeed:   "default-seed",
		Type:        "set_world_flag",
		Payload: map[string]any{
			"key":   "quest_state",
			"value": "chapter_1",
		},
	})
	if !accepted.Accepted {
		t.Fatalf("expected directive accepted, got %#v", accepted)
	}
	storyBeatDirective := hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "ok-2",
		WorldSeed:   "default-seed",
		Type:        "emit_story_beat",
		Payload: map[string]any{
			"beat": "chapter_started",
		},
	})
	if !storyBeatDirective.Accepted {
		t.Fatalf("expected story beat directive accepted, got %#v", storyBeatDirective)
	}
	spawnHintDirective := hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "ok-3",
		WorldSeed:   "default-seed",
		Type:        "spawn_hint",
		Payload: map[string]any{
			"hintId": "hint-1",
			"label":  "wolf-pack",
			"chunkX": 2,
			"chunkZ": -1,
		},
	})
	if !spawnHintDirective.Accepted {
		t.Fatalf("expected spawn hint directive accepted, got %#v", spawnHintDirective)
	}

	flagsChanged := hub.advanceOneTick()
	if !flagsChanged {
		t.Fatalf("expected advanceOneTick to report world flag changes")
	}
	if hub.worldFlags["quest_state"] != "chapter_1" {
		t.Fatalf("expected world flag updated, got %q", hub.worldFlags["quest_state"])
	}
	flagState := hub.worldFlagState()
	if flagState.Flags["quest_state"] != "chapter_1" {
		t.Fatalf("expected world flag state snapshot to include quest_state, got %#v", flagState)
	}
	directiveState := hub.worldDirectiveState()
	if len(directiveState.StoryBeats) == 0 || directiveState.StoryBeats[len(directiveState.StoryBeats)-1] != "chapter_started" {
		t.Fatalf("expected story beat in directive state, got %#v", directiveState.StoryBeats)
	}
	if len(directiveState.SpawnHints) != 1 {
		t.Fatalf("expected one spawn hint in directive state, got %#v", directiveState.SpawnHints)
	}
	if directiveState.SpawnHints[0].HintID != "hint-1" || directiveState.SpawnHints[0].ChunkX != 2 || directiveState.SpawnHints[0].ChunkZ != -1 {
		t.Fatalf("unexpected spawn hint state: %#v", directiveState.SpawnHints[0])
	}

	feed := hub.listWorldEventsSince(0)
	foundQueued := false
	foundApplied := false
	for _, event := range feed.Events {
		if event.Type == "directive_queued" {
			foundQueued = true
		}
		if event.Type == "directive_applied" {
			foundApplied = true
		}
	}
	if !foundQueued || !foundApplied {
		t.Fatalf("expected directive queue+apply events, queued=%t applied=%t", foundQueued, foundApplied)
	}
}

func TestDirectiveAndEventHandlers(t *testing.T) {
	hub := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/openclaw/directives", buildDirectiveHandler(hub))
	mux.HandleFunc("/openclaw/events", buildEventFeedHandler(hub))

	payload, err := json.Marshal(openclawDirectiveRequest{
		DirectiveID: "http-1",
		WorldSeed:   "default-seed",
		Type:        "emit_story_beat",
		Payload: map[string]any{
			"beat": "arrival",
		},
	})
	if err != nil {
		t.Fatalf("marshal directive failed: %v", err)
	}

	directiveRequest := httptest.NewRequest(http.MethodPost, "/openclaw/directives", bytes.NewReader(payload))
	directiveResponse := httptest.NewRecorder()
	mux.ServeHTTP(directiveResponse, directiveRequest)
	if directiveResponse.Code != http.StatusAccepted {
		t.Fatalf("expected accepted status, got %d body=%s", directiveResponse.Code, directiveResponse.Body.String())
	}

	eventRequest := httptest.NewRequest(http.MethodGet, "/openclaw/events?since=0", nil)
	eventResponse := httptest.NewRecorder()
	mux.ServeHTTP(eventResponse, eventRequest)
	if eventResponse.Code != http.StatusOK {
		t.Fatalf("expected event feed status 200, got %d", eventResponse.Code)
	}

	var feed worldEventFeed
	if err := json.Unmarshal(eventResponse.Body.Bytes(), &feed); err != nil {
		t.Fatalf("decode feed failed: %v", err)
	}
	if len(feed.Events) == 0 {
		t.Fatalf("expected feed events")
	}
}

func TestSpawnHintLifecycleGuards(t *testing.T) {
	hub := newWorldHub()

	addAck := hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "hint-add",
		WorldSeed:   "default-seed",
		Type:        "spawn_hint",
		Payload: map[string]any{
			"hintId":   "hint-ephemeral",
			"label":    "boar-pack",
			"chunkX":   1,
			"chunkZ":   2,
			"ttlTicks": 1,
		},
	})
	if !addAck.Accepted {
		t.Fatalf("expected add spawn_hint accepted, got %#v", addAck)
	}
	if changed := hub.advanceOneTick(); !changed {
		t.Fatalf("expected spawn hint add to change directive state")
	}
	stateAfterAdd := hub.worldDirectiveState()
	if len(stateAfterAdd.SpawnHints) != 1 || stateAfterAdd.SpawnHints[0].HintID != "hint-ephemeral" {
		t.Fatalf("expected spawn hint after add, got %#v", stateAfterAdd.SpawnHints)
	}

	if changed := hub.advanceOneTick(); !changed {
		t.Fatalf("expected spawn hint expiry to change directive state")
	}
	stateAfterExpire := hub.worldDirectiveState()
	if len(stateAfterExpire.SpawnHints) != 0 {
		t.Fatalf("expected spawn hint expired, got %#v", stateAfterExpire.SpawnHints)
	}

	reAddAck := hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "hint-add-2",
		WorldSeed:   "default-seed",
		Type:        "spawn_hint",
		Payload: map[string]any{
			"hintId": "hint-remove",
			"label":  "wolf-pack",
			"chunkX": 3,
			"chunkZ": -1,
		},
	})
	if !reAddAck.Accepted {
		t.Fatalf("expected second spawn hint accepted, got %#v", reAddAck)
	}
	hub.advanceOneTick()
	stateBeforeRemove := hub.worldDirectiveState()
	if len(stateBeforeRemove.SpawnHints) == 0 {
		t.Fatalf("expected spawn hint before remove")
	}

	removeAck := hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "hint-remove-1",
		WorldSeed:   "default-seed",
		Type:        "spawn_hint",
		Payload: map[string]any{
			"hintId": "hint-remove",
			"action": "remove",
		},
	})
	if !removeAck.Accepted {
		t.Fatalf("expected spawn hint remove accepted, got %#v", removeAck)
	}
	if changed := hub.advanceOneTick(); !changed {
		t.Fatalf("expected spawn hint remove to change directive state")
	}
	stateAfterRemove := hub.worldDirectiveState()
	if len(stateAfterRemove.SpawnHints) != 0 {
		t.Fatalf("expected spawn hint removed, got %#v", stateAfterRemove.SpawnHints)
	}
}

func TestDebugStateHandlerExportsWorldState(t *testing.T) {
	hub := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	hub.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-debug-export",
		PlayerID:  "player-debug",
		StartX:    5,
		StartZ:    -3,
	})
	if _, ok := hub.applyBlockAction(blockActionPayload{
		PlayerID: "player-debug",
		Action:   "place",
		ChunkX:   0,
		ChunkZ:   0,
		X:        1,
		Y:        2,
		Z:        3,
	}); !ok {
		t.Fatalf("expected block placement accepted")
	}
	hub.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "debug-flag",
		WorldSeed:   "seed-debug-export",
		Type:        "set_world_flag",
		Payload: map[string]any{
			"key":   "weather",
			"value": "rain",
		},
	})
	hub.advanceOneTick()

	mux := http.NewServeMux()
	mux.HandleFunc("/debug/state", buildDebugStateHandler(hub))

	request := httptest.NewRequest(http.MethodGet, "/debug/state", nil)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected debug state status 200, got %d", response.Code)
	}

	var exported worldDebugState
	if err := json.Unmarshal(response.Body.Bytes(), &exported); err != nil {
		t.Fatalf("decode debug state failed: %v", err)
	}
	if exported.Snapshot.WorldSeed != "seed-debug-export" {
		t.Fatalf("expected world seed in debug export, got %q", exported.Snapshot.WorldSeed)
	}
	if len(exported.BlockDeltas) == 0 {
		t.Fatalf("expected block deltas in debug export")
	}
	if exported.WorldFlags.Flags["weather"] != "rain" {
		t.Fatalf("expected weather flag in debug export, got %#v", exported.WorldFlags)
	}
}

func TestImportStateRoundTrip(t *testing.T) {
	source := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	source.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-debug-roundtrip",
		PlayerID:  "player-roundtrip",
		StartX:    9,
		StartZ:    -4,
	})
	source.applyBlockAction(blockActionPayload{
		PlayerID:  "player-roundtrip",
		Action:    "place",
		ChunkX:    1,
		ChunkZ:    -1,
		X:         2,
		Y:         3,
		Z:         4,
		BlockType: "stone",
	})
	source.awardInventoryResources("player-roundtrip", map[string]int{
		"salvage": 3,
		"fiber":   2,
	})
	source.ingestDirective(openclawDirectiveRequest{
		DirectiveID: "debug-roundtrip-flag",
		WorldSeed:   "seed-debug-roundtrip",
		Type:        "set_world_flag",
		Payload: map[string]any{
			"key":   "chapter",
			"value": "1",
		},
	})
	source.advanceOneTick()
	exported := source.exportState()

	target := newWorldHub()
	ack, err := target.importState(exported)
	if err != nil {
		t.Fatalf("expected import state success, got err=%v", err)
	}
	if !ack.Accepted || ack.Tick != exported.Snapshot.Tick {
		t.Fatalf("unexpected import ack: %#v", ack)
	}

	imported := target.exportState()
	if imported.Snapshot.WorldSeed != exported.Snapshot.WorldSeed {
		t.Fatalf("expected imported world seed %q, got %q", exported.Snapshot.WorldSeed, imported.Snapshot.WorldSeed)
	}
	if !reflect.DeepEqual(exported.BlockDeltas, imported.BlockDeltas) {
		t.Fatalf("expected imported block deltas to match export\nexpected=%#v\nactual=%#v", exported.BlockDeltas, imported.BlockDeltas)
	}
	if imported.WorldFlags.Flags["chapter"] != "1" {
		t.Fatalf("expected imported world flag chapter=1, got %#v", imported.WorldFlags.Flags)
	}
	if _, ok := imported.Snapshot.Players["player-roundtrip"]; !ok {
		t.Fatalf("expected imported player snapshot present")
	}
}

func TestDebugLoadStateHandlerImportsWorldState(t *testing.T) {
	source := newWorldHub()
	client := &clientConn{playerIDs: map[string]struct{}{}}
	source.handleJoin(client, joinRuntimeRequest{
		WorldSeed: "seed-debug-load",
		PlayerID:  "player-load",
		StartX:    3,
		StartZ:    2,
	})
	source.applyBlockAction(blockActionPayload{
		PlayerID: "player-load",
		Action:   "break",
		ChunkX:   0,
		ChunkZ:   0,
		X:        1,
		Y:        1,
		Z:        1,
	})
	source.advanceOneTick()
	exported := source.exportState()

	payload, err := json.Marshal(exported)
	if err != nil {
		t.Fatalf("marshal exported debug state failed: %v", err)
	}

	target := newWorldHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/load-state", buildDebugLoadStateHandler(target))
	mux.HandleFunc("/debug/state", buildDebugStateHandler(target))

	loadRequest := httptest.NewRequest(http.MethodPost, "/debug/load-state", bytes.NewReader(payload))
	loadResponse := httptest.NewRecorder()
	mux.ServeHTTP(loadResponse, loadRequest)
	if loadResponse.Code != http.StatusAccepted {
		t.Fatalf("expected load-state status 202, got %d body=%s", loadResponse.Code, loadResponse.Body.String())
	}
	var ack debugLoadStateAck
	if err := json.Unmarshal(loadResponse.Body.Bytes(), &ack); err != nil {
		t.Fatalf("decode load-state ack failed: %v", err)
	}
	if !ack.Accepted {
		t.Fatalf("expected accepted load-state ack, got %#v", ack)
	}

	stateRequest := httptest.NewRequest(http.MethodGet, "/debug/state", nil)
	stateResponse := httptest.NewRecorder()
	mux.ServeHTTP(stateResponse, stateRequest)
	if stateResponse.Code != http.StatusOK {
		t.Fatalf("expected debug-state status 200 after load, got %d", stateResponse.Code)
	}

	var imported worldDebugState
	if err := json.Unmarshal(stateResponse.Body.Bytes(), &imported); err != nil {
		t.Fatalf("decode imported debug state failed: %v", err)
	}
	if imported.Snapshot.WorldSeed != "seed-debug-load" {
		t.Fatalf("expected imported world seed seed-debug-load, got %q", imported.Snapshot.WorldSeed)
	}
	if _, ok := imported.Snapshot.Players["player-load"]; !ok {
		t.Fatalf("expected imported player in snapshot")
	}
}

func floatPtr(value float64) *float64 {
	return &value
}

func nearlyEqual(left float64, right float64) bool {
	diff := left - right
	if diff < 0 {
		diff = -diff
	}
	return diff < 0.000001
}

func findFirstResolvableTargetToken(worldSeed string) (string, float64, float64, bool) {
	for chunkX := -2; chunkX <= 2; chunkX++ {
		for chunkZ := -2; chunkZ <= 2; chunkZ++ {
			entities := generateChunkEntitiesForTargetResolution(chunkX, chunkZ, worldSeed)
			for index, entity := range entities {
				if entity.entityType != "npc" && entity.entityType != "wild-mon" {
					continue
				}
				token := intToString(chunkX) + ":" + intToString(chunkZ) + ":" + entity.entityType + ":" + intToString(index)
				worldX, worldZ, resolved := resolveNonPlayerTargetCoordinates(token, worldSeed)
				if !resolved {
					continue
				}
				return token, worldX, worldZ, true
			}
		}
	}
	return "", 0, 0, false
}

func containsClient(clients []*clientConn, target *clientConn) bool {
	for _, client := range clients {
		if client == target {
			return true
		}
	}
	return false
}
