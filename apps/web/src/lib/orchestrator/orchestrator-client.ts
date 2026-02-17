import {
  OrchestratorEventAck,
  WorldEvent,
  parseOrchestratorEventAck,
  toWorldEventPayload,
} from "@/lib/orchestrator/orchestrator-contracts";

export interface WorldOrchestratorClient {
  publishEvent(event: WorldEvent): Promise<OrchestratorEventAck>;
}

export interface HttpWorldOrchestratorClientConfig {
  baseUrl: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
}

export class HttpWorldOrchestratorClient implements WorldOrchestratorClient {
  private readonly baseUrl: string;

  private readonly authToken?: string;

  private readonly fetchImpl: typeof fetch;

  constructor(config: HttpWorldOrchestratorClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authToken = config.authToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async publishEvent(event: WorldEvent): Promise<OrchestratorEventAck> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/world-events`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(toWorldEventPayload(event)),
    });

    if (!response.ok) {
      const detail = await safeReadText(response);
      throw new Error(`orchestrator request failed (${response.status}): ${detail}`);
    }

    const parsed = parseOrchestratorEventAck(await response.json());
    if (!parsed.value) {
      throw new Error(parsed.error ?? "orchestrator ack parse failed");
    }

    return parsed.value;
  }

  private buildHeaders(): Headers {
    const headers = new Headers();
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    if (this.authToken) {
      headers.set("authorization", `Bearer ${this.authToken}`);
    }

    return headers;
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text || "no error detail";
  } catch {
    return "unable to read error body";
  }
}
