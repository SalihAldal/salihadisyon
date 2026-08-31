export type PrintTrigger = "production" | "receipt";

export type PrintDestinationConfig = {
  id: string;
  code: string;
  name: string;
  isCashRegister: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type CategoryRoutingConfig = {
  categoryId: string;
  destinationCodes: string[];
  printerType?: string | null;
};

export type ProductRoutingConfig = {
  productId: string;
  useCategoryRouting: boolean;
  destinationCodes: string[];
};

export type TicketItemForRouting = {
  id: string;
  productId: string;
  categoryId?: string | null;
  productName: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  discountTotal?: number;
  notes?: string | null;
  modifiersJson?: Record<string, unknown> | null;
};

export type ResolvedPrintDestination = {
  code: string;
  name: string;
  isCashRegister: boolean;
};

export type PrintDestinationGroup = {
  destination: ResolvedPrintDestination;
  items: TicketItemForRouting[];
};

export type PrintRoutingPlan = {
  trigger: PrintTrigger;
  groups: PrintDestinationGroup[];
};

const DEFAULT_LEGACY_CATEGORY_MAP: Record<string, string[]> = {
  bar: ["BAR", "KASA"],
  kitchen: ["MUTFAK", "KASA"],
};

export function normalizeDestinationCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of codes) {
    const code = String(raw ?? "").trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

export function resolveItemDestinationCodes(input: {
  productId: string;
  categoryId?: string | null;
  categoryRouting: CategoryRoutingConfig | null;
  productRouting: ProductRoutingConfig | null;
  cashRegisterCode?: string;
  trigger: PrintTrigger;
}): string[] {
  const cashRegisterCode = String(input.cashRegisterCode ?? "KASA").toUpperCase();

  if (input.trigger === "receipt") {
    return [cashRegisterCode];
  }

  if (input.productRouting && !input.productRouting.useCategoryRouting) {
    return normalizeDestinationCodes(input.productRouting.destinationCodes.filter((code) => code !== cashRegisterCode));
  }

  if (input.categoryRouting?.destinationCodes?.length) {
    return normalizeDestinationCodes(
      input.categoryRouting.destinationCodes.filter((code) => code !== cashRegisterCode),
    );
  }

  const legacyType = String(input.categoryRouting?.printerType ?? "kitchen").toLowerCase();
  const legacyCodes = DEFAULT_LEGACY_CATEGORY_MAP[legacyType] ?? DEFAULT_LEGACY_CATEGORY_MAP.kitchen;
  return normalizeDestinationCodes(legacyCodes.filter((code) => code !== cashRegisterCode));
}

export function buildPrintRoutingPlan(input: {
  trigger: PrintTrigger;
  items: TicketItemForRouting[];
  destinations: PrintDestinationConfig[];
  categoryRoutingByCategoryId: Map<string, CategoryRoutingConfig>;
  productRoutingByProductId: Map<string, ProductRoutingConfig>;
  productCategoryByProductId: Map<string, string>;
}): PrintRoutingPlan {
  const destinationByCode = new Map(
    input.destinations
      .filter((destination) => destination.isActive)
      .map((destination) => [destination.code.toUpperCase(), destination] as const),
  );
  const cashRegister =
    input.destinations.find((destination) => destination.isCashRegister && destination.isActive) ??
    destinationByCode.get("KASA") ??
    null;
  const cashRegisterCode = cashRegister?.code.toUpperCase() ?? "KASA";

  const grouped = new Map<string, TicketItemForRouting[]>();

  if (input.trigger === "receipt") {
    grouped.set(cashRegisterCode, [...input.items]);
  } else {
    for (const item of input.items) {
      const categoryId = item.categoryId ?? input.productCategoryByProductId.get(item.productId) ?? "";
      const categoryRouting = categoryId ? input.categoryRoutingByCategoryId.get(categoryId) ?? null : null;
      const productRouting = input.productRoutingByProductId.get(item.productId) ?? null;
      const codes = resolveItemDestinationCodes({
        productId: item.productId,
        categoryId,
        categoryRouting,
        productRouting,
        cashRegisterCode,
        trigger: input.trigger,
      });

      for (const code of codes) {
        const bucket = grouped.get(code) ?? [];
        bucket.push(item);
        grouped.set(code, bucket);
      }
    }
  }

  const groups: PrintDestinationGroup[] = [];
  for (const [code, items] of grouped.entries()) {
    if (!items.length) continue;
    const destination = destinationByCode.get(code);
    groups.push({
      destination: {
        code,
        name: destination?.name ?? code,
        isCashRegister: destination?.isCashRegister ?? code === cashRegisterCode,
      },
      items,
    });
  }

  groups.sort((left, right) => {
    const leftOrder = destinationByCode.get(left.destination.code)?.sortOrder ?? 999;
    const rightOrder = destinationByCode.get(right.destination.code)?.sortOrder ?? 999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.destination.code.localeCompare(right.destination.code, "tr");
  });

  return {
    trigger: input.trigger,
    groups,
  };
}

export function buildPrintIdempotencyKey(input: {
  ticketId: string;
  destinationCode: string;
  trigger: PrintTrigger;
  printBatchId: string;
}): string {
  return `${input.ticketId}:${input.destinationCode.toUpperCase()}:${input.trigger}:${input.printBatchId}`;
}

export function shouldSkipDuplicatePrint(existingStatus?: string | null): boolean {
  const status = String(existingStatus ?? "").toLowerCase();
  return status === "queued" || status === "sent";
}
