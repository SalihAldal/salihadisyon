import { describe, expect, it } from "vitest";
import {
  buildPrintIdempotencyKey,
  buildPrintRoutingPlan,
  normalizeDestinationCodes,
  resolveItemDestinationCodes,
  shouldSkipDuplicatePrint,
} from "./print-routing.core";

describe("print-routing.core", () => {
  const destinations = [
    { id: "d-kasa", code: "KASA", name: "Kasa Fisi", isCashRegister: true, isActive: true, sortOrder: 1 },
    { id: "d-bar", code: "BAR", name: "Bar Fisi", isCashRegister: false, isActive: true, sortOrder: 2 },
    { id: "d-mutfak", code: "MUTFAK", name: "Mutfak Fisi", isCashRegister: false, isActive: true, sortOrder: 3 },
  ];

  const categoryRoutingByCategoryId = new Map([
    ["cat-icecek", { categoryId: "cat-icecek", destinationCodes: ["BAR", "KASA"], printerType: "bar" }],
    ["cat-yemek", { categoryId: "cat-yemek", destinationCodes: ["MUTFAK", "KASA"], printerType: "kitchen" }],
    ["cat-kahve", { categoryId: "cat-kahve", destinationCodes: ["BAR", "KASA"], printerType: "bar" }],
  ]);

  const productCategoryByProductId = new Map([
    ["prod-kola", "cat-icecek"],
    ["prod-burger", "cat-yemek"],
    ["prod-latte", "cat-kahve"],
  ]);

  const items = [
    { id: "i1", productId: "prod-kola", productName: "Kola", quantity: 2, categoryId: "cat-icecek" },
    { id: "i2", productId: "prod-burger", productName: "Burger", quantity: 1, categoryId: "cat-yemek" },
    { id: "i3", productId: "prod-latte", productName: "Latte", quantity: 1, categoryId: "cat-kahve" },
  ];

  it("routes production slips by category without duplicate destinations", () => {
    const plan = buildPrintRoutingPlan({
      trigger: "production",
      items,
      destinations,
      categoryRoutingByCategoryId,
      productRoutingByProductId: new Map(),
      productCategoryByProductId,
    });

    const bar = plan.groups.find((group) => group.destination.code === "BAR");
    const mutfak = plan.groups.find((group) => group.destination.code === "MUTFAK");

    expect(bar?.items.map((item) => item.productName).sort()).toEqual(["Kola", "Latte"]);
    expect(mutfak?.items.map((item) => item.productName)).toEqual(["Burger"]);
    expect(plan.groups.some((group) => group.destination.code === "KASA")).toBe(false);
  });

  it("routes receipt trigger to cash register with all items", () => {
    const plan = buildPrintRoutingPlan({
      trigger: "receipt",
      items,
      destinations,
      categoryRoutingByCategoryId,
      productRoutingByProductId: new Map(),
      productCategoryByProductId,
    });

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]?.destination.code).toBe("KASA");
    expect(plan.groups[0]?.items).toHaveLength(3);
  });

  it("supports product override over category routing for production stations", () => {
    const productRoutingByProductId = new Map([
      ["prod-kola", { productId: "prod-kola", useCategoryRouting: false, destinationCodes: ["BAR"] }],
    ]);

    const plan = buildPrintRoutingPlan({
      trigger: "production",
      items: [items[0]],
      destinations,
      categoryRoutingByCategoryId,
      productRoutingByProductId,
      productCategoryByProductId,
    });

    expect(plan.groups.map((group) => group.destination.code)).toEqual(["BAR"]);
  });

  it("deduplicates destination codes", () => {
    expect(normalizeDestinationCodes(["BAR", "bar", "KASA", "BAR"])).toEqual(["BAR", "KASA"]);
  });

  it("builds stable idempotency keys", () => {
    const key = buildPrintIdempotencyKey({
      ticketId: "ticket-1",
      destinationCode: "BAR",
      trigger: "production",
      printBatchId: "batch-1",
    });
    expect(key).toBe("ticket-1:BAR:production:batch-1");
  });

  it("skips duplicate queued/sent jobs", () => {
    expect(shouldSkipDuplicatePrint("queued")).toBe(true);
    expect(shouldSkipDuplicatePrint("sent")).toBe(true);
    expect(shouldSkipDuplicatePrint("failed")).toBe(false);
  });

  it("falls back to legacy printerType when category routing missing", () => {
    const codes = resolveItemDestinationCodes({
      productId: "prod-kola",
      categoryId: "cat-icecek",
      categoryRouting: { categoryId: "cat-icecek", destinationCodes: [], printerType: "bar" },
      productRouting: null,
      trigger: "production",
    });
    expect(codes).toEqual(["BAR"]);
  });
});
