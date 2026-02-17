import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RuntimeBlockDelta,
  RuntimeCombatResult,
  RuntimeContainerActionResult,
  RuntimeContainerState,
  RuntimeCraftResult,
  RuntimeDirectiveState,
  RuntimeInventoryState,
  RuntimeHotbarState,
  RuntimeWorldFlagState,
} from "@/lib/runtime/protocol";
import { WsRuntimeClient, wsRuntimeClientTestUtils } from "@/lib/runtime/ws-runtime-client";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  static defaultReadyState = FakeWebSocket.OPEN;

  readonly url: string;

  readyState = FakeWebSocket.defaultReadyState;

  sent: string[] = [];

  private readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: { data?: unknown }) => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  emitMessage(data: unknown): void {
    this.emit("message", { data });
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  emitClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }

  private emit(type: string, event: { data?: unknown }): void {
    const targetListeners = this.listeners.get(type);
    if (!targetListeners) {
      return;
    }
    targetListeners.forEach((listener) => listener(event));
  }
}

describe("WsRuntimeClient", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    FakeWebSocket.defaultReadyState = FakeWebSocket.OPEN;
    (globalThis as { WebSocket: typeof WebSocket }).WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWebSocket) {
      (globalThis as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
      return;
    }
    Reflect.deleteProperty(globalThis, "WebSocket");
  });

  it("ignores stale and malformed snapshots", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const ticks: number[] = [];

    const unsubscribe = client.subscribe((snapshot) => {
      ticks.push(snapshot.tick);
    });

    socket?.emitMessage(
      JSON.stringify({
        type: "snapshot",
        payload: { worldSeed: "seed-a", tick: 4, players: {} },
      }),
    );
    socket?.emitMessage(
      JSON.stringify({
        type: "snapshot",
        payload: { worldSeed: "seed-a", tick: 2, players: {} },
      }),
    );
    socket?.emitMessage(
      JSON.stringify({
        type: "snapshot",
        payload: { worldSeed: "seed-b", tick: 9, players: {} },
      }),
    );
    socket?.emitMessage("{not-valid-json}");

    expect(ticks).toEqual([0, 4]);

    unsubscribe();
    client.dispose();
  });

  it("forwards block delta envelopes", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const deltas: RuntimeBlockDelta[] = [];

    const unsubscribe = client.subscribeBlockDeltas((delta) => {
      deltas.push(delta);
    });

    socket?.emitMessage(
      JSON.stringify({
        type: "block_delta",
        payload: {
          action: "break",
          chunkX: 1,
          chunkZ: -2,
          x: 3,
          y: 4,
          z: 5,
        },
      }),
    );

    expect(deltas).toEqual([
      {
        action: "break",
        chunkX: 1,
        chunkZ: -2,
        x: 3,
        y: 4,
        z: 5,
      },
    ]);

    unsubscribe();
    client.dispose();
  });

  it("sends combat actions and forwards combat results", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const results: RuntimeCombatResult[] = [];

    const unsubscribe = client.subscribeCombatResults((result) => {
      results.push(result);
    });

    client.submitCombatAction("player-3", {
      actionId: "act-1",
      slotId: "slot-2-ember-bolt",
      kind: "spell",
      targetId: "npc-12",
      targetLabel: "NPC 12",
      targetWorldX: 8.5,
      targetWorldZ: -1.25,
    });

    expect(socket?.sent.at(-1)).toContain("\"type\":\"combat_action\"");
    expect(socket?.sent.at(-1)).toContain("\"targetWorldX\":8.5");
    expect(socket?.sent.at(-1)).toContain("\"targetWorldZ\":-1.25");

    socket?.emitMessage(
      JSON.stringify({
        type: "combat_result",
        payload: {
          actionId: "act-1",
          playerId: "player-3",
          slotId: "slot-2-ember-bolt",
          kind: "spell",
          accepted: true,
          targetId: "npc-12",
          targetLabel: "NPC 12",
          targetWorldX: 8.5,
          targetWorldZ: -1.25,
          tick: 44,
        },
      }),
    );

    expect(results).toEqual([
      {
        actionId: "act-1",
        playerId: "player-3",
        slotId: "slot-2-ember-bolt",
        kind: "spell",
        accepted: true,
        targetId: "npc-12",
        targetLabel: "NPC 12",
        targetWorldX: 8.5,
        targetWorldZ: -1.25,
        tick: 44,
      },
    ]);

    unsubscribe();
    client.dispose();
  });

  it("sends hotbar selection and forwards hotbar state", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const states: RuntimeHotbarState[] = [];

    const unsubscribe = client.subscribeHotbarStates((state) => {
      states.push(state);
    });

    client.selectHotbarSlot("player-3", 2);
    expect(socket?.sent.at(-1)).toContain("\"type\":\"hotbar_select\"");
    expect(socket?.sent.at(-1)).toContain("\"slotIndex\":2");

    socket?.emitMessage(
      JSON.stringify({
        type: "hotbar_state",
        payload: {
          playerId: "player-3",
          slotIds: [
            "slot-1-rust-blade",
            "slot-2-ember-bolt",
            "slot-3-frost-bind",
          ],
          stackCounts: [0, 0, 0],
          selectedIndex: 2,
          tick: 19,
        },
      }),
    );

    expect(states).toEqual([
      {
        playerId: "player-3",
        slotIds: [
          "slot-1-rust-blade",
          "slot-2-ember-bolt",
          "slot-3-frost-bind",
        ],
        stackCounts: [0, 0, 0],
        selectedIndex: 2,
        tick: 19,
      },
    ]);

    unsubscribe();
    client.dispose();
  });

  it("forwards inventory state envelopes", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const states: RuntimeInventoryState[] = [];

    const unsubscribe = client.subscribeInventoryStates((state) => {
      states.push(state);
    });

    socket?.emitMessage(
      JSON.stringify({
        type: "inventory_state",
        payload: {
          playerId: "player-3",
          resources: {
            salvage: 4,
            herb: 1,
          },
          tick: 33,
        },
      }),
    );

    expect(states).toEqual([
      {
        playerId: "player-3",
        resources: {
          salvage: 4,
          herb: 1,
        },
        tick: 33,
      },
    ]);

    unsubscribe();
    client.dispose();
  });

  it("forwards world flag state envelopes", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const states: RuntimeWorldFlagState[] = [];

    const unsubscribe = client.subscribeWorldFlagStates((state) => {
      states.push(state);
    });

    socket?.emitMessage(
      JSON.stringify({
        type: "world_flag_state",
        payload: {
          flags: {
            story_phase: "chapter_1",
          },
          tick: 35,
        },
      }),
    );

    expect(states).toEqual([
      {
        flags: {},
        tick: 0,
      },
      {
        flags: {
          story_phase: "chapter_1",
        },
        tick: 35,
      },
    ]);

    unsubscribe();
    client.dispose();
  });

  it("forwards world directive state envelopes", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const states: RuntimeDirectiveState[] = [];

    const unsubscribe = client.subscribeWorldDirectiveStates((state) => {
      states.push(state);
    });

    socket?.emitMessage(
      JSON.stringify({
        type: "world_directive_state",
        payload: {
          storyBeats: ["chapter_started"],
          spawnHints: [
            {
              hintId: "hint-1",
              label: "wolf-pack",
              chunkX: 2,
              chunkZ: -1,
            },
          ],
          tick: 40,
        },
      }),
    );

    expect(states).toEqual([
      {
        storyBeats: [],
        spawnHints: [],
        tick: 0,
      },
      {
        storyBeats: ["chapter_started"],
        spawnHints: [
          {
            hintId: "hint-1",
            label: "wolf-pack",
            chunkX: 2,
            chunkZ: -1,
          },
        ],
        tick: 40,
      },
    ]);

    unsubscribe();
    client.dispose();
  });

  it("sends craft requests and forwards craft results", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const results: RuntimeCraftResult[] = [];

    const unsubscribe = client.subscribeCraftResults((result) => {
      results.push(result);
    });

    client.submitCraftRequest("player-3", {
      actionId: "craft-1",
      recipeId: "craft-bandage",
      count: 1,
    });

    expect(socket?.sent.at(-1)).toContain("\"type\":\"craft_request\"");
    expect(socket?.sent.at(-1)).toContain("\"recipeId\":\"craft-bandage\"");

    socket?.emitMessage(
      JSON.stringify({
        type: "craft_result",
        payload: {
          actionId: "craft-1",
          playerId: "player-3",
          recipeId: "craft-bandage",
          count: 1,
          accepted: true,
          tick: 71,
        },
      }),
    );

    expect(results).toEqual([
      {
        actionId: "craft-1",
        playerId: "player-3",
        recipeId: "craft-bandage",
        count: 1,
        accepted: true,
        tick: 71,
      },
    ]);

    unsubscribe();
    client.dispose();
  });

  it("sends container actions and forwards container state/results", () => {
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];
    const states: RuntimeContainerState[] = [];
    const results: RuntimeContainerActionResult[] = [];

    const unsubscribeStates = client.subscribeContainerStates((state) => {
      states.push(state);
    });
    const unsubscribeResults = client.subscribeContainerResults((result) => {
      results.push(result);
    });

    client.submitContainerAction("player-3", {
      actionId: "container-1",
      containerId: "world:camp-shared",
      operation: "deposit",
      resourceId: "salvage",
      amount: 1,
    });
    expect(socket?.sent.at(-1)).toContain("\"type\":\"container_action\"");

    socket?.emitMessage(
      JSON.stringify({
        type: "container_state",
        payload: {
          containerId: "world:camp-shared",
          resources: {
            salvage: 5,
          },
          tick: 88,
        },
      }),
    );
    socket?.emitMessage(
      JSON.stringify({
        type: "container_result",
        payload: {
          actionId: "container-1",
          playerId: "player-3",
          containerId: "world:camp-shared",
          operation: "deposit",
          resourceId: "salvage",
          amount: 1,
          accepted: true,
          tick: 88,
        },
      }),
    );

    expect(states).toEqual([
      {
        containerId: "world:camp-shared",
        resources: { salvage: 5 },
        tick: 88,
      },
    ]);
    expect(results).toEqual([
      {
        actionId: "container-1",
        playerId: "player-3",
        containerId: "world:camp-shared",
        operation: "deposit",
        resourceId: "salvage",
        amount: 1,
        accepted: true,
        tick: 88,
      },
    ]);

    unsubscribeStates();
    unsubscribeResults();
    client.dispose();
  });

  it("reconnects and replays join/input state", () => {
    vi.useFakeTimers();

    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
      reconnectDelayMs: 25,
    });
    const firstSocket = FakeWebSocket.instances[0];
    client.join({
      worldSeed: "seed-a",
      playerId: "player-1",
      startX: 3,
      startZ: -2,
    });
    client.setInput("player-1", {
      moveX: 1,
      moveZ: 0,
      running: true,
    });

    expect(firstSocket?.sent).toHaveLength(2);
    firstSocket?.emitClose();

    vi.advanceTimersByTime(25);
    const secondSocket = FakeWebSocket.instances[1];
    expect(secondSocket).toBeDefined();

    secondSocket?.emitOpen();

    expect(secondSocket?.sent).toHaveLength(2);
    expect(secondSocket?.sent[0]).toContain("\"type\":\"join\"");
    expect(secondSocket?.sent[1]).toContain("\"type\":\"input\"");

    client.dispose();
  });

  it("replays queued session join when socket opens", () => {
    FakeWebSocket.defaultReadyState = FakeWebSocket.CONNECTING;
    const client = new WsRuntimeClient({
      worldSeed: "seed-a",
      url: "ws://localhost:8787/ws",
    });
    const socket = FakeWebSocket.instances[0];

    client.join({
      worldSeed: "seed-a",
      playerId: "player-2",
      startX: 0,
      startZ: 0,
    });
    expect(socket?.sent).toHaveLength(0);

    socket?.emitOpen();
    expect(socket?.sent).toHaveLength(1);
    expect(socket?.sent[0]).toContain("\"type\":\"join\"");

    client.dispose();
  });
});

describe("wsRuntimeClientTestUtils", () => {
  it("returns null for malformed messages", () => {
    expect(wsRuntimeClientTestUtils.safeParseServerMessage("{oops")).toBeNull();
  });

  it("accepts monotonic snapshots only for the same world seed", () => {
    const current = { worldSeed: "seed-a", tick: 12, players: {} };

    expect(
      wsRuntimeClientTestUtils.shouldAcceptSnapshot(
        { worldSeed: "seed-a", tick: 12, players: {} },
        current,
      ),
    ).toBe(true);
    expect(
      wsRuntimeClientTestUtils.shouldAcceptSnapshot(
        { worldSeed: "seed-a", tick: 13, players: {} },
        current,
      ),
    ).toBe(true);
    expect(
      wsRuntimeClientTestUtils.shouldAcceptSnapshot(
        { worldSeed: "seed-a", tick: 11, players: {} },
        current,
      ),
    ).toBe(false);
    expect(
      wsRuntimeClientTestUtils.shouldAcceptSnapshot(
        { worldSeed: "seed-b", tick: 99, players: {} },
        current,
      ),
    ).toBe(false);
  });
});
