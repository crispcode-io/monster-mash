import { LocalRuntimeClient } from "@/lib/runtime/local-runtime-client";
import { RuntimeMode, WorldRuntimeClient } from "@/lib/runtime/protocol";
import { WsRuntimeClient } from "@/lib/runtime/ws-runtime-client";

export interface RuntimeClientOptions {
  worldSeed: string;
  preferredMode?: RuntimeMode;
}

export function createRuntimeClient(options: RuntimeClientOptions): WorldRuntimeClient {
  const mode = resolveRuntimeMode(options.preferredMode);

  if (mode === "ws") {
    const url = process.env.NEXT_PUBLIC_WORLD_RUNTIME_WS_URL;
    if (url) {
      return new WsRuntimeClient({
        worldSeed: options.worldSeed,
        url,
      });
    }
  }

  return new LocalRuntimeClient(options.worldSeed);
}

function resolveRuntimeMode(preferredMode?: RuntimeMode): RuntimeMode {
  if (preferredMode === "ws" || preferredMode === "local") {
    return preferredMode;
  }

  const envMode = process.env.NEXT_PUBLIC_WORLD_RUNTIME_MODE;
  return envMode === "ws" ? "ws" : "local";
}
