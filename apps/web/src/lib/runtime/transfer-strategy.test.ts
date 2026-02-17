import { describe, expect, it } from "vitest";
import {
  resolveRequestedTransferAmount,
  resolveTransferModifier,
} from "@/lib/runtime/transfer-strategy";

describe("transfer strategy", () => {
  it("resolves transfer modifier from key state", () => {
    expect(resolveTransferModifier({ shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toBe("base");
    expect(resolveTransferModifier({ shiftKey: true, ctrlKey: false, metaKey: false, altKey: false })).toBe("half");
    expect(resolveTransferModifier({ shiftKey: true, ctrlKey: true, metaKey: false, altKey: false })).toBe("all");
  });

  it("resolves base amount with source clamp", () => {
    expect(resolveRequestedTransferAmount(10, 3, "base")).toBe(3);
    expect(resolveRequestedTransferAmount(5, 0, "base")).toBe(0);
  });

  it("resolves half/all amounts", () => {
    expect(resolveRequestedTransferAmount(1, 7, "half")).toBe(4);
    expect(resolveRequestedTransferAmount(1, 8, "half")).toBe(4);
    expect(resolveRequestedTransferAmount(1, 7, "all")).toBe(7);
  });
});
