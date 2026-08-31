import { describe, expect, it } from "vitest";
import {
  calculateCompAmount,
  calculateDiscountAmount,
  requiresManagerApproval,
  validateMutationReason,
} from "./financial-mutation.core";

describe("financial-mutation.core", () => {
  it("percentage discount on 1000 base", () => {
    expect(calculateDiscountAmount({ baseAmount: 1000, percentage: 10 })).toBe(100);
  });

  it("fixed discount capped at base", () => {
    expect(calculateDiscountAmount({ baseAmount: 500, amount: 500 })).toBe(500);
    expect(() => calculateDiscountAmount({ baseAmount: 500, amount: 501 })).toThrow();
  });

  it("comp equals line gross", () => {
    expect(calculateCompAmount(500)).toBe(500);
  });

  it("reason validation", () => {
    expect(validateMutationReason("Musteri sikayeti")).toBe("Musteri sikayeti");
    expect(() => validateMutationReason("ab")).toThrow();
  });

  it("comp requires manager approval for cashier", () => {
    expect(requiresManagerApproval({ discountKind: "COMP", actorRole: "cashier" })).toBe(true);
    expect(requiresManagerApproval({ discountKind: "COMP", actorRole: "branch_manager" })).toBe(false);
  });
});
