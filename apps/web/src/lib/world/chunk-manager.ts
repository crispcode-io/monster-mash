import { WORLD_CONFIG } from "@/lib/game-contracts";

export interface ChunkPosition {
  chunkX: number;
  chunkZ: number;
}

export class ChunkManager {
  private activeChunkX: number = 0;
  private activeChunkZ: number = 0;
  private loadedChunks: Set<string> = new Set();

  constructor(
    private readonly radius: number = WORLD_CONFIG.activeChunkRadius,
    private readonly onLoad: (x: number, z: number) => void,
    private readonly onUnload: (x: number, z: number) => void
  ) {}

  public update(playerX: number, playerZ: number): boolean {
    const chunkX = Math.floor(playerX / WORLD_CONFIG.chunkSize);
    const chunkZ = Math.floor(playerZ / WORLD_CONFIG.chunkSize);

    // Initial load or movement across chunk boundary
    if (chunkX !== this.activeChunkX || chunkZ !== this.activeChunkZ || this.loadedChunks.size === 0) {
      this.activeChunkX = chunkX;
      this.activeChunkZ = chunkZ;
      this.refresh();
      return true;
    }

    return false;
  }

  public forceRefresh(): void {
    this.refresh();
  }

  private refresh(): void {
    const required = new Set<string>();

    for (let x = -this.radius; x <= this.radius; x++) {
      for (let z = -this.radius; z <= this.radius; z++) {
        const targetX = this.activeChunkX + x;
        const targetZ = this.activeChunkZ + z;
        const key = this.key(targetX, targetZ);
        required.add(key);

        if (!this.loadedChunks.has(key)) {
          this.loadedChunks.add(key);
          this.onLoad(targetX, targetZ);
        }
      }
    }

    // Convert to array to avoid modification during iteration issues if any
    const currentKeys = Array.from(this.loadedChunks);
    for (const key of currentKeys) {
      if (!required.has(key)) {
        this.loadedChunks.delete(key);
        const { x, z } = this.parseKey(key);
        this.onUnload(x, z);
      }
    }
  }

  private key(x: number, z: number): string {
    return `${x}:${z}`;
  }

  private parseKey(key: string): { x: number; z: number } {
    const [x, z] = key.split(":").map(Number);
    return { x, z };
  }

  public getActiveChunk(): ChunkPosition {
    return { chunkX: this.activeChunkX, chunkZ: this.activeChunkZ };
  }
  
  public getLoadedChunkCount(): number {
    return this.loadedChunks.size;
  }
}
