import { WorldInstance } from "@/lib/game-contracts";

export function createWorldInstance(source: string): WorldInstance {
  const seed = createWorldSeed(source);
  return {
    id: `world-${seed}`,
    seed,
    createdAt: new Date().toISOString(),
  };
}

export function createWorldSeed(source: string): string {
  const normalized = source.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const prefix = normalized || "frontier";
  const entropy = shortEntropy();
  return `${prefix}-${entropy}`;
}

function shortEntropy(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((entry) => entry.toString(16).padStart(2, "0"))
      .join("");
  }

  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}
