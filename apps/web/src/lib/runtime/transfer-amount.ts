export const DEFAULT_STASH_TRANSFER_AMOUNTS = [1, 5, 10] as const;

export function clampTransferAmountIndex(index: number): number {
  if (DEFAULT_STASH_TRANSFER_AMOUNTS.length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, DEFAULT_STASH_TRANSFER_AMOUNTS.length - 1));
}

export function cycleTransferAmountIndex(currentIndex: number, direction: -1 | 1): number {
  if (DEFAULT_STASH_TRANSFER_AMOUNTS.length <= 0) {
    return 0;
  }
  const normalized = clampTransferAmountIndex(currentIndex);
  return (normalized + direction + DEFAULT_STASH_TRANSFER_AMOUNTS.length) % DEFAULT_STASH_TRANSFER_AMOUNTS.length;
}

export function resolveTransferAmount(index: number): number {
  return DEFAULT_STASH_TRANSFER_AMOUNTS[clampTransferAmountIndex(index)] ?? DEFAULT_STASH_TRANSFER_AMOUNTS[0] ?? 1;
}
