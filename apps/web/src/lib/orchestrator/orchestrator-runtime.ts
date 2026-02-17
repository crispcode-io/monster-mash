import {
  HttpWorldOrchestratorClient,
  WorldOrchestratorClient,
} from "@/lib/orchestrator/orchestrator-client";
import { MockWorldOrchestratorClient } from "@/lib/orchestrator/mock-orchestrator-client";

let singleton: WorldOrchestratorClient | null = null;

export function getWorldOrchestratorClient(): WorldOrchestratorClient {
  if (singleton) {
    return singleton;
  }

  const baseUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_BASE_URL;
  if (baseUrl) {
    singleton = new HttpWorldOrchestratorClient({
      baseUrl,
      authToken: process.env.NEXT_PUBLIC_ORCHESTRATOR_TOKEN,
    });
    return singleton;
  }

  singleton = new MockWorldOrchestratorClient();
  return singleton;
}

export function __resetWorldOrchestratorClientForTests(): void {
  singleton = null;
}
