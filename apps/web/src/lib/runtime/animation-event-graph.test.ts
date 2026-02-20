import { describe, expect, it } from "vitest";
import { createAnimationState, reduceAnimationState } from "@/lib/runtime/animation-event-graph";

describe("animation event graph", () => {
  it("resolves locomotion transitions deterministically", () => {
    let state = createAnimationState(0);
    state = reduceAnimationState(state, { type: "locomotion", moving: false, running: false, atMs: 0 });
    expect(state.action).toBe("idle");

    state = reduceAnimationState(state, { type: "locomotion", moving: true, running: false, atMs: 100 });
    expect(state.action).toBe("walk");

    state = reduceAnimationState(state, { type: "locomotion", moving: true, running: true, atMs: 200 });
    expect(state.action).toBe("run");

    state = reduceAnimationState(state, { type: "locomotion", moving: false, running: false, atMs: 300 });
    expect(state.action).toBe("idle");
  });

  it("locks to action duration before returning to locomotion", () => {
    let state = createAnimationState(0);
    state = reduceAnimationState(state, { type: "locomotion", moving: true, running: false, atMs: 100 });
    expect(state.action).toBe("walk");

    state = reduceAnimationState(state, { type: "action", action: "attack_light", atMs: 200 });
    expect(state.action).toBe("attack_light");

    state = reduceAnimationState(state, { type: "locomotion", moving: true, running: false, atMs: 300 });
    expect(state.action).toBe("attack_light");

    state = reduceAnimationState(state, { type: "locomotion", moving: true, running: false, atMs: 600 });
    expect(state.action).toBe("walk");
  });

  it("allows higher priority action to interrupt lower priority lock", () => {
    let state = createAnimationState(0);
    state = reduceAnimationState(state, { type: "action", action: "attack_light", atMs: 100 });
    expect(state.action).toBe("attack_light");

    state = reduceAnimationState(state, { type: "action", action: "hit_react", atMs: 150 });
    expect(state.action).toBe("hit_react");
  });

  it("keeps death as terminal action", () => {
    let state = createAnimationState(0);
    state = reduceAnimationState(state, { type: "action", action: "death", atMs: 100 });
    expect(state.action).toBe("death");

    state = reduceAnimationState(state, { type: "action", action: "attack_heavy", atMs: 200 });
    expect(state.action).toBe("death");

    state = reduceAnimationState(state, { type: "locomotion", moving: true, running: true, atMs: 300 });
    expect(state.action).toBe("death");
  });
});
