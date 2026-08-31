export type SplitLineInput = {
  itemId: string;
  quantity: number;
};

export type SourceItemSnapshot = {
  id: string;
  quantity: number;
  unitPrice: number;
  discountTotal: number;
  taxTotal: number;
  lineTotal: number;
};

export function roundSplitCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateSplitLines(lines: SplitLineInput[], sourceItems: SourceItemSnapshot[]) {
  if (!lines.length) {
    throw new Error("Bolunecek en az bir satir gerekli.");
  }

  const requestedByItem = new Map<string, number>();
  for (const line of lines) {
    if (!line.itemId) {
      throw new Error("Gecersiz satir secimi.");
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("Bolunecek miktar sifirdan buyuk olmali.");
    }
    requestedByItem.set(line.itemId, roundSplitCurrency((requestedByItem.get(line.itemId) ?? 0) + line.quantity));
  }

  for (const [itemId, requestedQty] of requestedByItem.entries()) {
    const source = sourceItems.find((item) => item.id === itemId);
    if (!source) {
      throw new Error("Bolunecek satir bulunamadi.");
    }
    if (requestedQty > roundSplitCurrency(Number(source.quantity)) + 0.0001) {
      throw new Error("Bolunecek miktar mevcut miktardan buyuk olamaz.");
    }
    if (requestedQty >= roundSplitCurrency(Number(source.quantity)) - 0.0001) {
      // full line move allowed
      continue;
    }
  }
}

export function computeSplitLineParts(item: SourceItemSnapshot, splitQuantity: number) {
  const sourceQty = Number(item.quantity);
  const ratio = splitQuantity / sourceQty;
  const unitPrice = Number(item.unitPrice);
  const grossLine = roundSplitCurrency(unitPrice * splitQuantity);
  const discountTotal = roundSplitCurrency(Number(item.discountTotal) * ratio);
  const taxTotal = roundSplitCurrency(Number(item.taxTotal) * ratio);
  const lineTotal = roundSplitCurrency(Math.max(grossLine - discountTotal + taxTotal, 0));
  const remainingQty = roundSplitCurrency(sourceQty - splitQuantity);

  return {
    quantity: splitQuantity,
    unitPrice,
    discountTotal,
    taxTotal,
    lineTotal,
    remainingQty,
    remainingDiscount: roundSplitCurrency(Number(item.discountTotal) - discountTotal),
    remainingTax: roundSplitCurrency(Number(item.taxTotal) - taxTotal),
    remainingLineTotal: roundSplitCurrency(Math.max(unitPrice * remainingQty - (Number(item.discountTotal) - discountTotal) + (Number(item.taxTotal) - taxTotal), 0)),
  };
}

export function validatePersonAllocations(
  persons: Array<{ label?: string; items: SplitLineInput[] }>,
  sourceItems: SourceItemSnapshot[],
) {
  if (!persons.length) {
    throw new Error("En az bir kisi hesabi gerekli.");
  }

  const aggregate = new Map<string, number>();
  for (const person of persons) {
    if (!person.items?.length) {
      throw new Error("Her kisi hesabinda en az bir urun olmali.");
    }
    for (const line of person.items) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new Error("Kisi bazli bolmede miktar sifirdan buyuk olmali.");
      }
      aggregate.set(line.itemId, roundSplitCurrency((aggregate.get(line.itemId) ?? 0) + line.quantity));
    }
  }

  validateSplitLines(
    Array.from(aggregate.entries()).map(([itemId, quantity]) => ({ itemId, quantity })),
    sourceItems,
  );
}
