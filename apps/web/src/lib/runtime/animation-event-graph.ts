export type AnimationAction =
  | "idle"
  | "walk"
  | "run"
  | "attack_light"
  | "attack_heavy"
  | "cast"
  | "hit_react"
  | "death"
  | "interact";

export type AnimationEvent =
  | {
      type: "locomotion";
      moving: boolean;
      running: boolean;
      atMs: number;
    }
  | {
      type: "action";
      action: Exclude<AnimationAction, "idle" | "walk" | "run">;
      atMs: number;
    }
  | {
      type: "reset";
      atMs: number;
    };

export interface AnimationState {
  action: AnimationAction;
  locomotion: "idle" | "walk" | "run";
  actionStartedAtMs: number;
  lockedUntilMs: number;
  sequence: number;
}

const ACTION_PRIORITY: Record<AnimationAction, number> = {
  death: 100,
  hit_react: 90,
  attack_heavy: 80,
  attack_light: 70,
  cast: 65,
  interact: 60,
  run: 20,
  walk: 10,
  idle: 0,
};

const ACTION_DURATION_MS: Record<AnimationAction, number> = {
  idle: 0,
  walk: 0,
  run: 0,
  attack_light: 360,
  attack_heavy: 520,
  cast: 560,
  hit_react: 280,
  death: Number.POSITIVE_INFINITY,
  interact: 320,
};

export const DEFAULT_ANIMATION_FRAME_RATE: Record<AnimationAction, number> = {
  idle: 0,
  walk: 6,
  run: 10,
  attack_light: 12,
  attack_heavy: 10,
  cast: 8,
  hit_react: 8,
  death: 0,
  interact: 8,
};

export const DEFAULT_ANIMATION_FRAME_COUNT: Record<AnimationAction, number> = {
  idle: 1,
  walk: 2,
  run: 2,
  attack_light: 2,
  attack_heavy: 2,
  cast: 2,
  hit_react: 2,
  death: 1,
  interact: 2,
};

export function createAnimationState(atMs: number): AnimationState {
  return {
    action: "idle",
    locomotion: "idle",
    actionStartedAtMs: atMs,
    lockedUntilMs: atMs,
    sequence: 0,
  };
}

export function resolveLocomotionAction(moving: boolean, running: boolean): AnimationState["locomotion"] {
  if (!moving) {
    return "idle";
  }
  return running ? "run" : "walk";
}

export function reduceAnimationState(state: AnimationState, event: AnimationEvent): AnimationState {
  if (event.type === "reset") {
    return createAnimationState(event.atMs);
  }

  if (event.type === "locomotion") {
    const locomotion = resolveLocomotionAction(event.moving, event.running);
    const nextState: AnimationState = {
      ...state,
      locomotion,
    };
    if (state.action === "death") {
      return nextState;
    }
    if (state.lockedUntilMs > event.atMs) {
      return nextState;
    }
    if (state.action !== locomotion) {
      return {
        ...nextState,
        action: locomotion,
        actionStartedAtMs: event.atMs,
        lockedUntilMs: event.atMs,
        sequence: state.sequence + 1,
      };
    }
    return nextState;
  }

  const nextAction = event.action;
  if (state.action === "death") {
    return state;
  }
  if (state.lockedUntilMs > event.atMs) {
    const currentPriority = ACTION_PRIORITY[state.action];
    const incomingPriority = ACTION_PRIORITY[nextAction];
    if (incomingPriority <= currentPriority) {
      return state;
    }
  }

  const durationMs = ACTION_DURATION_MS[nextAction];
  return {
    ...state,
    action: nextAction,
    actionStartedAtMs: event.atMs,
    lockedUntilMs: durationMs === Number.POSITIVE_INFINITY ? durationMs : event.atMs + durationMs,
    sequence: state.sequence + 1,
  };
}

export function resolveAnimationFrameIndex(action: AnimationAction, elapsedMs: number): number {
  const frameCount = DEFAULT_ANIMATION_FRAME_COUNT[action];
  if (frameCount <= 1) {
    return 0;
  }
  const fps = DEFAULT_ANIMATION_FRAME_RATE[action];
  if (fps <= 0) {
    return 0;
  }
  const frame = Math.floor((elapsedMs / 1000) * fps) % frameCount;
  return frame < 0 ? 0 : frame;
}
