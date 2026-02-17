export type TransferModifier = "base" | "half" | "all";

interface TransferModifierInput {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function resolveTransferModifier(input: TransferModifierInput): TransferModifier {
  if (input.ctrlKey || input.metaKey || input.altKey) {
    return "all";
  }
  if (input.shiftKey) {
    return "half";
  }
  return "base";
}

export function resolveRequestedTransferAmount(
  selectedAmount: number,
  sourceAmount: number,
  modifier: TransferModifier,
): number {
  const normalizedSource = Math.max(0, Math.floor(sourceAmount));
  if (normalizedSource <= 0) {
    return 0;
  }

  if (modifier === "all") {
    return normalizedSource;
  }
  if (modifier === "half") {
    return Math.max(1, Math.ceil(normalizedSource / 2));
  }

  const normalizedSelected = Math.max(1, Math.floor(selectedAmount));
  return Math.min(normalizedSelected, normalizedSource);
}
