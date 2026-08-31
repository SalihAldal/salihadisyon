import { describe, expect, it } from "vitest";
import {
  computeSplitLineParts,
  roundSplitCurrency,
  validatePersonAllocations,
  validateSplitLines,
} from "./split-ticket.core";

describe("split-ticket.core", () => {
  const sourceItems = [
    {
      id: "item-kola",
      quantity: 4,
      unitPrice: 50,
      discountTotal: 0,
      taxTotal: 0,
      lineTotal: 200,
    },
    {
      id: "item-burger",
      quantity: 2,
      unitPrice: 120,
      discountTotal: 20,
      taxTotal: 10,
      lineTotal: 230,
    },
  ];

  it("4 kola 2+2 bolme miktarini kabul eder", () => {
    expect(() =>
      validateSplitLines(
        [
          { itemId: "item-kola", quantity: 2 },
          { itemId: "item-kola", quantity: 2 },
        ],
        sourceItems,
      ),
    ).not.toThrow();
  });

  it("miktardan fazla bolmeyi reddeder", () => {
    expect(() => validateSplitLines([{ itemId: "item-kola", quantity: 5 }], sourceItems)).toThrow(
      "Bolunecek miktar mevcut miktardan buyuk olamaz.",
    );
  });

  it("indirim ve vergiyi orantili hesaplar", () => {
    const parts = computeSplitLineParts(sourceItems[1], 1);
    expect(parts.quantity).toBe(1);
    expect(parts.discountTotal).toBe(10);
    expect(parts.taxTotal).toBe(5);
    expect(parts.lineTotal).toBe(roundSplitCurrency(120 - 10 + 5));
  });

  it("kisi bazli toplam miktar kontrolu yapar", () => {
    expect(() =>
      validatePersonAllocations(
        [
          { label: "Kisi 1", items: [{ itemId: "item-kola", quantity: 2 }] },
          { label: "Kisi 2", items: [{ itemId: "item-kola", quantity: 2 }] },
        ],
        sourceItems,
      ),
    ).not.toThrow();
  });
});
