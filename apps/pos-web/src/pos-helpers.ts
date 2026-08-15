import { hasAllPermissions } from "@adisyon/config";
import type { PosAuthSession } from "./api";
import { POS_STORAGE_KEY } from "./pos-constants";

export function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sanitizeMoneyInput(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = normalized.split(".");
  if (rest.length === 0) {
    return whole;
  }
  return `${whole}.${rest.join("")}`;
}

export function getPaymentBucket(method: string) {
  if (method === "CASH") return "cash";
  if (method === "CREDIT_CARD" || method === "MEAL_CARD" || method === "GIFT_CARD") return "card";
  return "mobile";
}

export function normalizeSessionShape(raw: unknown): PosAuthSession | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, any>;
  const user = (record.user ?? {}) as Record<string, any>;
  const defaultBranchId =
    (typeof user.defaultBranchId === "string" && user.defaultBranchId) ||
    (typeof user.defaultBranch?.id === "string" ? user.defaultBranch.id : null) ||
    null;
  const branchIds = Array.isArray(user.branchIds)
    ? user.branchIds.map((item) => String(item)).filter(Boolean)
    : defaultBranchId
      ? [defaultBranchId]
      : [];

  if (typeof record.accessToken !== "string" || typeof record.refreshToken !== "string") {
    return null;
  }

  return {
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    user: {
      id: String(user.id ?? ""),
      fullName: String(user.fullName ?? ""),
      email: String(user.email ?? ""),
      tenantId: String(user.tenantId ?? ""),
      defaultBranchId,
      branchIds,
      permissions: Array.isArray(user.permissions) ? user.permissions.map((item) => String(item)) : [],
      role: String(user.role ?? ""),
    },
  };
}

export function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const normalized = normalizeSessionShape(parsed);
    if (!normalized) {
      window.localStorage.removeItem(POS_STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    window.localStorage.removeItem(POS_STORAGE_KEY);
    return null;
  }
}

export function hasSessionPermission(session: PosAuthSession | null | undefined, permission: string) {
  return hasAllPermissions(
    {
      role: session?.user.role,
      permissions: session?.user.permissions ?? [],
    },
    [permission],
  );
}

export function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(value ?? 0);
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getTicketItemSubtitle(
  item: Record<string, any>,
  productLookup: Map<string, Record<string, any>>,
) {
  const note = typeof item.notes === "string" ? item.notes.trim() : "";
  if (note.length > 0) return note;

  const modifiers = item.modifiersJson as Record<string, unknown> | null | undefined;
  if (!modifiers || typeof modifiers !== "object") return "";

  const hasVariant = Array.isArray(modifiers.variantIds) && modifiers.variantIds.length > 0;
  const hasModifier = Array.isArray(modifiers.modifierOptionIds) && modifiers.modifierOptionIds.length > 0;
  const hasRequired = Array.isArray(modifiers.requiredChoiceOptionIds) && modifiers.requiredChoiceOptionIds.length > 0;

  if (!hasVariant && !hasModifier && !hasRequired) return "";

  const productId = String(item.productId ?? "");
  const product = productLookup.get(productId);
  if (!product) {
    return "Urun ozellestirmesi secildi";
  }

  const variantMap = new Map<string, string>();
  const modifierMap = new Map<string, string>();
  const requiredMap = new Map<string, string>();

  for (const variant of (product.variants as Array<Record<string, any>> | undefined) ?? []) {
    variantMap.set(String(variant.id), String(variant.name ?? ""));
  }
  for (const group of (product.modifierGroups as Array<Record<string, any>> | undefined) ?? []) {
    for (const option of (group.options as Array<Record<string, any>> | undefined) ?? []) {
      modifierMap.set(String(option.id), String(option.name ?? ""));
    }
  }
  for (const group of (product.requiredChoiceGroups as Array<Record<string, any>> | undefined) ?? []) {
    for (const option of (group.options as Array<Record<string, any>> | undefined) ?? []) {
      requiredMap.set(String(option.id), String(option.name ?? ""));
    }
  }

  const subtitles: string[] = [];
  const variantTitles = ((modifiers.variantIds as Array<unknown> | undefined) ?? [])
    .map((id) => variantMap.get(String(id)))
    .filter((value): value is string => Boolean(value));
  const requiredTitles = ((modifiers.requiredChoiceOptionIds as Array<unknown> | undefined) ?? [])
    .map((id) => requiredMap.get(String(id)))
    .filter((value): value is string => Boolean(value));
  const modifierTitles = ((modifiers.modifierOptionIds as Array<unknown> | undefined) ?? [])
    .map((id) => modifierMap.get(String(id)))
    .filter((value): value is string => Boolean(value));

  if (variantTitles.length > 0) subtitles.push(`Varyant: ${variantTitles.join(", ")}`);
  if (requiredTitles.length > 0) subtitles.push(`Secim: ${requiredTitles.join(", ")}`);
  if (modifierTitles.length > 0) subtitles.push(`Ek: ${modifierTitles.join(", ")}`);

  if (subtitles.length > 0) return subtitles.join(" / ");
  return "Urun ozellestirmesi secildi";
}

export function getTableColor(status: string) {
  if (status === "OCCUPIED") return "danger";
  if (status === "RESERVED") return "warning";
  if (status === "CLEANING") return "info";
  return "success";
}

export function getGroupSelectedCount(group: Record<string, any>, selectedIds: string[]) {
  const optionIds = ((group.options as Array<Record<string, any>> | undefined) ?? []).map((option) => String(option.id));
  return selectedIds.filter((id) => optionIds.includes(id)).length;
}

export function getMissingSelectionMessages(product: Record<string, any>, form: Record<string, any>) {
  const messages: string[] = [];
  const requiredChoiceIds = ((form.requiredChoiceOptionIds as Array<unknown> | undefined) ?? []).map((id) => String(id));
  const modifierIds = ((form.modifierOptionIds as Array<unknown> | undefined) ?? []).map((id) => String(id));

  for (const group of (product.requiredChoiceGroups as Array<Record<string, any>> | undefined) ?? []) {
    const min = Number(group.selectionMin ?? 0);
    if (min <= 0) continue;
    const count = getGroupSelectedCount(group, requiredChoiceIds);
    if (count < min) {
      messages.push(`${String(group.name ?? "Zorunlu secim")} icin en az ${min} secim yapin.`);
    }
  }

  for (const group of (product.modifierGroups as Array<Record<string, any>> | undefined) ?? []) {
    const min = Number(group.selectionMin ?? 0);
    if (min <= 0) continue;
    const count = getGroupSelectedCount(group, modifierIds);
    if (count < min) {
      messages.push(`${String(group.name ?? "Modifier")} icin en az ${min} secim yapin.`);
    }
  }

  return messages;
}

export function isUnauthorizedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { status?: number; message?: string };
  if (record.status === 401) return true;
  const message = String(record.message ?? "").toLowerCase();
  return message.includes("token gecersiz") || message.includes("suresi dolmus") || message.includes("unauthorized");
}

export function normalizePaymentResult(raw: unknown) {
  const record = (raw ?? {}) as Record<string, any>;
  const ticketRecord = (record.ticket ?? {}) as Record<string, any>;
  return {
    status: String(ticketRecord.status ?? record.status ?? ""),
    totalPaid: Number(record.totalPaid ?? ticketRecord.paidTotal ?? 0),
    remainingAmount: Number(record.remainingAmount ?? ticketRecord.remainingAmount ?? 0),
    payments: Array.isArray(record.payments) ? record.payments : [],
  };
}

export function normalizePrintDispatch(raw: unknown) {
  const record = (raw ?? {}) as Record<string, any>;
  return {
    success: Boolean(record.success ?? false),
    printerId: String(record.printerId ?? ""),
    documentType: String(record.documentType ?? ""),
    queuedAt: String(record.queuedAt ?? ""),
  };
}
