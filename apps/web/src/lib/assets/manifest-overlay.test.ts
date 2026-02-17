import { describe, expect, it } from "vitest";
import {
  applyManifestToOverlay,
  applyPatchToOverlay,
  createPlaceholderOverlayState,
  DEFAULT_PLACEHOLDER_SLOTS,
} from "@/lib/assets/manifest-overlay";

describe("manifest overlay state", () => {
  it("keeps placeholders until manifest assets arrive", () => {
    const base = createPlaceholderOverlayState(DEFAULT_PLACEHOLDER_SLOTS);

    expect(base.manifestVersion).toBe(0);
    expect(base.slots["imposter_2d:landmark"]?.placeholder).toBe(true);

    const next = applyManifestToOverlay(base, {
      worldSeed: "seed",
      chunk: { x: 0, z: 0 },
      manifestVersion: 3,
      generatedAt: "2026-02-15T00:00:00.000Z",
      assets: [
        {
          slotId: "imposter_2d:landmark",
          assetClass: "imposter_2d",
          assetId: "asset:landmark",
          tier: "tier1",
          variantHash: "sha256:abc",
          uri: "https://cdn/landmark.webp",
        },
      ],
    });

    expect(next.manifestVersion).toBe(3);
    expect(next.slots["imposter_2d:landmark"]?.placeholder).toBe(false);
    expect(next.slots["imposter_2d:landmark"]?.variantHash).toBe("sha256:abc");
    expect(next.slots["prop_3d:totem"]?.placeholder).toBe(true);
  });

  it("applies patch updates and reverts to placeholder on remove", () => {
    const base = createPlaceholderOverlayState(DEFAULT_PLACEHOLDER_SLOTS);

    const patched = applyPatchToOverlay(base, {
      fromVersion: 0,
      toVersion: 1,
      patches: [
        {
          op: "replace",
          slotId: "prop_3d:totem",
          assetId: "asset:totem",
          variantHash: "sha256:totem01",
          uri: "https://cdn/totem.glb",
          tier: "tier2",
        },
      ],
    });

    expect(patched.manifestVersion).toBe(1);
    expect(patched.slots["prop_3d:totem"]?.placeholder).toBe(false);
    expect(patched.slots["prop_3d:totem"]?.variantHash).toBe("sha256:totem01");

    const reverted = applyPatchToOverlay(patched, {
      fromVersion: 1,
      toVersion: 2,
      patches: [
        {
          op: "remove",
          slotId: "prop_3d:totem",
        },
      ],
    });

    expect(reverted.manifestVersion).toBe(2);
    expect(reverted.slots["prop_3d:totem"]?.placeholder).toBe(true);
    expect(reverted.slots["prop_3d:totem"]?.variantHash.startsWith("placeholder:")).toBe(true);
  });
});
