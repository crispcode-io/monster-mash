import {
  JoinRuntimeRequest,
  RuntimeInputState,
  RuntimePlayerSnapshot,
  WorldRuntimeSnapshot,
} from "@/lib/runtime/protocol";

interface PlayerRuntimeState {
  playerId: string;
  x: number;
  z: number;
  input: RuntimeInputState;
}

const DEFAULT_INPUT: RuntimeInputState = {
  moveX: 0,
  moveZ: 0,
  running: false,
};

export interface AuthoritativeSimConfig {
  tickRateHz: number;
  walkSpeedUnitsPerSecond: number;
  runMultiplier: number;
}

const DEFAULT_CONFIG: AuthoritativeSimConfig = {
  tickRateHz: 20,
  walkSpeedUnitsPerSecond: 6,
  runMultiplier: 1.35,
};

export class AuthoritativeWorldSim {
  readonly worldSeed: string;

  readonly config: AuthoritativeSimConfig;

  private readonly players = new Map<string, PlayerRuntimeState>();

  private tickCount = 0;

  constructor(worldSeed: string, config?: Partial<AuthoritativeSimConfig>) {
    this.worldSeed = worldSeed;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  get tick(): number {
    return this.tickCount;
  }

  joinPlayer(request: JoinRuntimeRequest): void {
    this.players.set(request.playerId, {
      playerId: request.playerId,
      x: request.startX,
      z: request.startZ,
      input: { ...DEFAULT_INPUT },
    });
  }

  leavePlayer(playerId: string): void {
    this.players.delete(playerId);
  }

  setInput(playerId: string, input: RuntimeInputState): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    player.input = {
      moveX: Number.isFinite(input.moveX) ? input.moveX : 0,
      moveZ: Number.isFinite(input.moveZ) ? input.moveZ : 0,
      running: Boolean(input.running),
    };
  }

  advanceOneTick(): WorldRuntimeSnapshot {
    this.tickCount += 1;
    const deltaSeconds = 1 / this.config.tickRateHz;

    for (const player of this.players.values()) {
      const movement = normalizeMovement(player.input.moveX, player.input.moveZ);
      const speedMultiplier = player.input.running ? this.config.runMultiplier : 1;
      const speed = this.config.walkSpeedUnitsPerSecond * speedMultiplier;

      player.x += movement.x * speed * deltaSeconds;
      player.z += movement.z * speed * deltaSeconds;
    }

    return this.snapshot();
  }

  snapshot(): WorldRuntimeSnapshot {
    const players: Record<string, RuntimePlayerSnapshot> = {};

    for (const player of this.players.values()) {
      const normalized = normalizeMovement(player.input.moveX, player.input.moveZ);
      const speedMultiplier = player.input.running ? this.config.runMultiplier : 1;
      const speed = this.config.walkSpeedUnitsPerSecond * speedMultiplier;
      const magnitude = normalized.x === 0 && normalized.z === 0 ? 0 : speed;

      players[player.playerId] = {
        playerId: player.playerId,
        x: player.x,
        z: player.z,
        speed: magnitude,
      };
    }

    return {
      worldSeed: this.worldSeed,
      tick: this.tickCount,
      players,
    };
  }
}

function normalizeMovement(moveX: number, moveZ: number): { x: number; z: number } {
  const length = Math.hypot(moveX, moveZ);
  if (length <= 0) {
    return { x: 0, z: 0 };
  }

  return {
    x: moveX / length,
    z: moveZ / length,
  };
}
