import { describe, expect, it } from "vitest";
import {
  DEFAULT_STASH_TRANSFER_AMOUNTS,
  clampTransferAmountIndex,
  cycleTransferAmountIndex,
  resolveTransferAmount,
} from "@/lib/runtime/transfer-amount";

describe("transfer amount controls", () => {
  it("clamps transfer amount indexes", () => {
    expect(clampTransferAmountIndex(-1)).toBe(0);
    expect(clampTransferAmountIndex(999)).toBe(DEFAULT_STASH_TRANSFER_AMOUNTS.length - 1);
  });

  it("cycles transfer amount indexes with wraparound", () => {
    expect(cycleTransferAmountIndex(0, -1)).toBe(DEFAULT_STASH_TRANSFER_AMOUNTS.length - 1);
    expect(cycleTransferAmountIndex(DEFAULT_STASH_TRANSFER_AMOUNTS.length - 1, 1)).toBe(0);
  });

  it("resolves transfer amount from index", () => {
    expect(resolveTransferAmount(0)).toBe(1);
    expect(resolveTransferAmount(1)).toBe(5);
    expect(resolveTransferAmount(2)).toBe(10);
    expect(resolveTransferAmount(999)).toBe(10);
  });
});
