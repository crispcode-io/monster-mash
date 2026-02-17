export interface RuntimeCraftRecipeDefinition {
  id: string;
  label: string;
  keybind: string;
  summary: string;
}

export const DEFAULT_RUNTIME_CRAFT_RECIPES: RuntimeCraftRecipeDefinition[] = [
  {
    id: "craft-bandage",
    label: "Bandage",
    keybind: "6",
    summary: "fiber + salvage -> bandage",
  },
  {
    id: "craft-bomb",
    label: "Bomb",
    keybind: "7",
    summary: "coal + fiber -> bomb",
  },
  {
    id: "craft-charcoal",
    label: "Charcoal",
    keybind: "8",
    summary: "wood -> coal",
  },
  {
    id: "craft-iron-ingot",
    label: "Iron Ingot",
    keybind: "9",
    summary: "iron ore + coal -> iron ingot",
  },
];

const CRAFT_RECIPE_INDEX_BY_KEY = new Map(
  DEFAULT_RUNTIME_CRAFT_RECIPES.map((recipe, index) => [recipe.keybind, index]),
);

export function clampCraftRecipeIndex(index: number): number {
  if (DEFAULT_RUNTIME_CRAFT_RECIPES.length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, DEFAULT_RUNTIME_CRAFT_RECIPES.length - 1));
}

export function resolveCraftRecipeIndexForKey(key: string): number | undefined {
  return CRAFT_RECIPE_INDEX_BY_KEY.get(key.toLowerCase());
}

export function resolveCraftRecipeByIndex(index: number): RuntimeCraftRecipeDefinition {
  return DEFAULT_RUNTIME_CRAFT_RECIPES[clampCraftRecipeIndex(index)] ?? DEFAULT_RUNTIME_CRAFT_RECIPES[0];
}
