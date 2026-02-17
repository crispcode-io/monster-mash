import { AssetServiceClient, HttpAssetServiceClient } from "@/lib/assets/asset-service-client";
import { MockAssetServiceClient } from "@/lib/assets/mock-asset-service-client";

let singleton: AssetServiceClient | null = null;

export function getAssetServiceClient(): AssetServiceClient {
  if (singleton) {
    return singleton;
  }

  const baseUrl = process.env.NEXT_PUBLIC_ASSET_SERVICE_BASE_URL;
  if (baseUrl) {
    singleton = new HttpAssetServiceClient({
      baseUrl,
      authToken: process.env.NEXT_PUBLIC_ASSET_SERVICE_TOKEN,
    });
    return singleton;
  }

  singleton = new MockAssetServiceClient();
  return singleton;
}

export function __resetAssetServiceClientForTests(): void {
  singleton = null;
}
