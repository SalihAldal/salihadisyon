import { formatCurrency } from "./pos-helpers";
import { formatTicketStatus, getTicketStatusTone } from "./waiter-pos-utils";

export type TicketGroupingMode = "category" | "station";

export type TicketItemDetailLine = {
  kind: "variant" | "required" | "modifier" | "note";
  label: string;
};

export type GroupedTicketItem = {
  item: Record<string, any>;
  detailLines: TicketItemDetailLine[];
  lineTotal: number;
};

export type TicketItemGroup = {
  key: string;
  title: string;
  emoji?: string;
  items: GroupedTicketItem[];
  subtotal: number;
};

const OPEN_TICKET_STATUSES = new Set(["OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING"]);

export function isOpenTicketStatus(status?: string | null) {
  return OPEN_TICKET_STATUSES.has(String(status ?? "").toUpperCase());
}

export function getOpenTicketsForTable(
  tickets: Array<Record<string, any>>,
  tableId?: string | null,
) {
  if (!tableId) return [];
  return tickets.filter(
    (ticket) => String(ticket.tableId ?? "") === String(tableId) && isOpenTicketStatus(String(ticket.status ?? "")),
  );
}

export function formatTicketLabel(ticket: Record<string, any>) {
  const name = String(ticket.ticketName ?? "").trim();
  if (name) return name;
  const id = String(ticket.id ?? "");
  return id ? `Adisyon #${id.slice(-6).toUpperCase()}` : "Adisyon";
}

export function getTicketItemDetailLines(
  item: Record<string, any>,
  productLookup: Map<string, Record<string, any>>,
): TicketItemDetailLine[] {
  const lines: TicketItemDetailLine[] = [];
  const note = typeof item.notes === "string" ? item.notes.trim() : "";
  if (note) {
    lines.push({ kind: "note", label: note });
  }

  const modifiers = item.modifiersJson as Record<string, unknown> | null | undefined;
  if (!modifiers || typeof modifiers !== "object") {
    return lines;
  }

  const product = productLookup.get(String(item.productId ?? ""));
  const variantMap = new Map<string, string>();
  const modifierMap = new Map<string, string>();
  const requiredMap = new Map<string, string>();

  for (const variant of (product?.variants as Array<Record<string, any>> | undefined) ?? []) {
    variantMap.set(String(variant.id), String(variant.name ?? ""));
  }
  for (const group of (product?.modifierGroups as Array<Record<string, any>> | undefined) ?? []) {
    for (const option of (group.options as Array<Record<string, any>> | undefined) ?? []) {
      modifierMap.set(String(option.id), String(option.name ?? ""));
    }
  }
  for (const group of (product?.requiredChoiceGroups as Array<Record<string, any>> | undefined) ?? []) {
    for (const option of (group.options as Array<Record<string, any>> | undefined) ?? []) {
      requiredMap.set(String(option.id), String(option.name ?? ""));
    }
  }

  for (const id of ((modifiers.variantIds as Array<unknown> | undefined) ?? []).map(String)) {
    const label = variantMap.get(id);
    if (label) lines.push({ kind: "variant", label });
  }
  for (const id of ((modifiers.requiredChoiceOptionIds as Array<unknown> | undefined) ?? []).map(String)) {
    const label = requiredMap.get(id);
    if (label) lines.push({ kind: "required", label });
  }
  for (const id of ((modifiers.modifierOptionIds as Array<unknown> | undefined) ?? []).map(String)) {
    const label = modifierMap.get(id);
    if (label) lines.push({ kind: "modifier", label });
  }

  return lines;
}

function resolveCategoryMeta(
  item: Record<string, any>,
  productLookup: Map<string, Record<string, any>>,
  categoryLookup: Map<string, Record<string, any>>,
) {
  const product = productLookup.get(String(item.productId ?? ""));
  const categoryId = String(product?.categoryId ?? "uncategorized");
  const category = categoryLookup.get(categoryId);
  return {
    categoryId,
    categoryName: String(category?.name ?? "Diger"),
    printerType: String(category?.printerType ?? "kitchen").toLowerCase(),
  };
}

export function groupTicketItemsByCategory(
  items: Array<Record<string, any>>,
  productLookup: Map<string, Record<string, any>>,
  categories: Array<Record<string, any>>,
): TicketItemGroup[] {
  const categoryLookup = new Map(categories.map((category) => [String(category.id), category]));
  const groups = new Map<string, TicketItemGroup>();

  for (const item of items) {
    const meta = resolveCategoryMeta(item, productLookup, categoryLookup);
    const key = meta.categoryId;
    const existing = groups.get(key) ?? {
      key,
      title: meta.categoryName,
      items: [],
      subtotal: 0,
    };
    const lineTotal = Number(item.lineTotal ?? 0) - Number(item.discountTotal ?? 0);
    existing.items.push({
      item,
      detailLines: getTicketItemDetailLines(item, productLookup),
      lineTotal,
    });
    existing.subtotal += lineTotal;
    groups.set(key, existing);
  }

  return [...groups.values()].sort((left, right) => left.title.localeCompare(right.title, "tr"));
}

export function groupTicketItemsByStation(
  items: Array<Record<string, any>>,
  productLookup: Map<string, Record<string, any>>,
  categories: Array<Record<string, any>>,
): TicketItemGroup[] {
  const categoryLookup = new Map(categories.map((category) => [String(category.id), category]));
  const groups = new Map<string, TicketItemGroup>();

  for (const item of items) {
    const meta = resolveCategoryMeta(item, productLookup, categoryLookup);
    const station = meta.printerType === "bar" ? "bar" : "kitchen";
    const key = station;
    const existing = groups.get(key) ?? {
      key,
      title: station === "bar" ? "Bar" : "Mutfak",
      emoji: station === "bar" ? "🥤" : "🍳",
      items: [],
      subtotal: 0,
    };
    const lineTotal = Number(item.lineTotal ?? 0) - Number(item.discountTotal ?? 0);
    existing.items.push({
      item,
      detailLines: getTicketItemDetailLines(item, productLookup),
      lineTotal,
    });
    existing.subtotal += lineTotal;
    groups.set(key, existing);
  }

  return [...groups.values()];
}

export function buildTicketSummary(ticket: Record<string, any> | null | undefined) {
  if (!ticket) {
    return {
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      paidTotal: 0,
      remainingAmount: 0,
      itemCount: 0,
      statusLabel: "-",
      statusTone: "neutral" as const,
    };
  }

  const items = Array.isArray(ticket.items) ? ticket.items : [];
  return {
    subtotal: Number(ticket.subtotal ?? 0),
    discountTotal: Number(ticket.discountTotal ?? 0),
    taxTotal: Number(ticket.taxTotal ?? 0),
    grandTotal: Number(ticket.grandTotal ?? 0),
    paidTotal: Number(ticket.paidTotal ?? 0),
    remainingAmount: Number(ticket.remainingAmount ?? 0),
    itemCount: items.length,
    statusLabel: formatTicketStatus(String(ticket.status ?? "OPEN")),
    statusTone: getTicketStatusTone(String(ticket.status ?? "OPEN")),
    tableName: String(ticket.tableName ?? "-"),
    customerName: ticket.customerName ? String(ticket.customerName) : null,
  };
}

export function formatTicketSummaryLine(summary: ReturnType<typeof buildTicketSummary>) {
  return `${summary.itemCount} urun · ${formatCurrency(summary.grandTotal)}`;
}
