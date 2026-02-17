import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUNTIME_CRAFT_RECIPES,
  clampCraftRecipeIndex,
  resolveCraftRecipeByIndex,
  resolveCraftRecipeIndexForKey,
} from "@/lib/runtime/crafting-catalog";

describe("crafting catalog", () => {
  it("maps craft hotkeys to deterministic recipe indexes", () => {
    expect(resolveCraftRecipeIndexForKey("6")).toBe(0);
    expect(resolveCraftRecipeIndexForKey("7")).toBe(1);
    expect(resolveCraftRecipeIndexForKey("8")).toBe(2);
    expect(resolveCraftRecipeIndexForKey("9")).toBe(3);
    expect(resolveCraftRecipeIndexForKey("x")).toBeUndefined();
  });

  it("clamps craft recipe indexes", () => {
    expect(clampCraftRecipeIndex(-1)).toBe(0);
    expect(clampCraftRecipeIndex(999)).toBe(DEFAULT_RUNTIME_CRAFT_RECIPES.length - 1);
  });

  it("resolves recipe by index with clamp behavior", () => {
    expect(resolveCraftRecipeByIndex(0).id).toBe("craft-bandage");
    expect(resolveCraftRecipeByIndex(999).id).toBe("craft-iron-ingot");
  });
});
