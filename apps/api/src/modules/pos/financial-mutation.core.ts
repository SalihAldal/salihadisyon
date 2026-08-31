export type DiscountKind = "DISCOUNT" | "COMP";

export type FinancialMutationKind = "discount" | "comp" | "void_item" | "void_ticket";

export function roundFinancial(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateMutationReason(reason: string | undefined | null, label = "Gerekce") {
  const normalized = String(reason ?? "").trim();
  if (normalized.length < 3) {
    throw new Error(`${label} en az 3 karakter olmali.`);
  }
  if (normalized.length > 500) {
    throw new Error(`${label} en fazla 500 karakter olabilir.`);
  }
  return normalized;
}

export function calculateDiscountAmount(input: {
  baseAmount: number;
  amount?: number;
  percentage?: number;
  discountType?: string;
}) {
  const base = roundFinancial(Number(input.baseAmount));
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error("Indirim taban tutari gecersiz.");
  }

  const type = String(input.discountType ?? "").toUpperCase();
  if (input.percentage !== undefined && input.percentage !== null) {
    const pct = Number(input.percentage);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new Error("Yuzde indirim 0-100 arasinda olmali.");
    }
    return roundFinancial(Math.min(base, (base * pct) / 100));
  }

  if (type.includes("PERCENT") || type.includes("YUZDE")) {
    const pct = Number(input.amount);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new Error("Yuzde indirim 0-100 arasinda olmali.");
    }
    return roundFinancial(Math.min(base, (base * pct) / 100));
  }

  const amount = roundFinancial(Number(input.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Indirim tutari sifirdan buyuk olmali.");
  }
  if (amount > base + 0.01) {
    throw new Error("Indirim tutari taban tutari asamaz.");
  }
  return amount;
}

export function calculateCompAmount(lineGross: number) {
  const gross = roundFinancial(Number(lineGross));
  if (!Number.isFinite(gross) || gross <= 0) {
    throw new Error("Ikram icin gecerli satir tutari gerekli.");
  }
  return gross;
}

export function resolveDiscountBaseAmount(input: {
  ticketItemId?: string | null;
  items: Array<{ id: string; lineTotal: number; quantity: number; unitPrice: number }>;
  ticketSubtotal: number;
  ticketGrandTotal: number;
}) {
  if (input.ticketItemId) {
    const item = input.items.find((row) => row.id === input.ticketItemId);
    if (!item) {
      throw new Error("Indirim uygulanacak satir bulunamadi.");
    }
    return roundFinancial(Number(item.lineTotal));
  }
  return roundFinancial(Math.max(Number(input.ticketSubtotal), Number(input.ticketGrandTotal), 0));
}

export function requiresManagerApproval(input: {
  discountKind: DiscountKind;
  actorRole?: string | null;
  approvalRequired?: boolean;
}) {
  if (input.approvalRequired) {
    return true;
  }
  if (input.discountKind === "COMP") {
    return !isManagerRole(input.actorRole);
  }
  return false;
}

export function isManagerRole(role?: string | null) {
  const normalized = String(role ?? "").toLowerCase();
  return (
    normalized.includes("owner") ||
    normalized.includes("branch_manager") ||
    normalized.includes("manager") ||
    normalized.includes("admin") ||
    normalized.includes("super_admin")
  );
}

export function canSelfApprove(actorUserId: string, requestedByUserId?: string | null) {
  return Boolean(requestedByUserId && actorUserId === requestedByUserId);
}
