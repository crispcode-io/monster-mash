import {
  AssetClass,
  AssetTier,
  ChunkManifest,
  ChunkManifestPatchResponse,
  ManifestPatchOperation,
} from "@/lib/assets/asset-contracts";

export interface PlaceholderSlotTemplate {
  slotId: string;
  assetClass: AssetClass;
  tier: AssetTier;
}

export interface OverlaySlotState {
  slotId: string;
  assetClass: AssetClass;
  tier: AssetTier;
  assetId: string;
  variantHash: string;
  uri: string;
  placeholder: boolean;
}

export interface ManifestOverlayState {
  manifestVersion: number;
  slots: Record<string, OverlaySlotState>;
}

export const DEFAULT_PLACEHOLDER_SLOTS: PlaceholderSlotTemplate[] = [
  { slotId: "imposter_2d:landmark", assetClass: "imposter_2d", tier: "tier0" },
  { slotId: "prop_3d:totem", assetClass: "prop_3d", tier: "tier0" },
];

export function createPlaceholderOverlayState(
  templates: PlaceholderSlotTemplate[] = DEFAULT_PLACEHOLDER_SLOTS,
): ManifestOverlayState {
  const slots: Record<string, OverlaySlotState> = {};

  for (const template of templates) {
    slots[template.slotId] = makePlaceholderSlot(template.slotId, template.assetClass, template.tier);
  }

  return {
    manifestVersion: 0,
    slots,
  };
}

export function applyManifestToOverlay(
  previous: ManifestOverlayState,
  manifest: ChunkManifest,
): ManifestOverlayState {
  const nextSlots = cloneSlots(previous.slots);

  for (const asset of manifest.assets) {
    nextSlots[asset.slotId] = {
      slotId: asset.slotId,
      assetClass: asset.assetClass,
      tier: asset.tier,
      assetId: asset.assetId,
      variantHash: asset.variantHash,
      uri: asset.uri,
      placeholder: false,
    };
  }

  return {
    manifestVersion: manifest.manifestVersion,
    slots: nextSlots,
  };
}

export function applyPatchToOverlay(
  previous: ManifestOverlayState,
  patch: ChunkManifestPatchResponse,
): ManifestOverlayState {
  const nextSlots = cloneSlots(previous.slots);

  for (const operation of patch.patches) {
    applyPatchOperation(nextSlots, operation);
  }

  return {
    manifestVersion: patch.toVersion,
    slots: nextSlots,
  };
}

function applyPatchOperation(
  slots: Record<string, OverlaySlotState>,
  operation: ManifestPatchOperation,
): void {
  if (operation.op === "remove") {
    const previousSlot = slots[operation.slotId];
    const assetClass = previousSlot?.assetClass ?? parseAssetClassFromSlot(operation.slotId) ?? "prop_3d";
    slots[operation.slotId] = makePlaceholderSlot(operation.slotId, assetClass, "tier0");
    return;
  }

  const assetClass = parseAssetClassFromSlot(operation.slotId) ?? "prop_3d";
  if (!operation.assetId || !operation.variantHash || !operation.uri || !operation.tier) {
    return;
  }

  slots[operation.slotId] = {
    slotId: operation.slotId,
    assetClass,
    tier: operation.tier,
    assetId: operation.assetId,
    variantHash: operation.variantHash,
    uri: operation.uri,
    placeholder: false,
  };
}

function parseAssetClassFromSlot(slotId: string): AssetClass | null {
  const token = slotId.split(":", 1)[0];

  if (
    token === "terrain_voxel" ||
    token === "imposter_2d" ||
    token === "icon_2d" ||
    token === "decal_2d" ||
    token === "prop_3d" ||
    token === "npc_3d" ||
    token === "hero_prop_3d" ||
    token === "voice_line" ||
    token === "video_scene"
  ) {
    return token;
  }

  return null;
}

function makePlaceholderSlot(
  slotId: string,
  assetClass: AssetClass,
  tier: AssetTier,
): OverlaySlotState {
  return {
    slotId,
    assetClass,
    tier,
    assetId: `placeholder:${slotId}`,
    variantHash: `placeholder:${slotId}`,
    uri: "",
    placeholder: true,
  };
}

function cloneSlots(
  slots: Record<string, OverlaySlotState>,
): Record<string, OverlaySlotState> {
  const next: Record<string, OverlaySlotState> = {};

  for (const [slotId, slot] of Object.entries(slots)) {
    next[slotId] = { ...slot };
  }

  return next;
}
