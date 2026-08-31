export type TicketStatusKey =
  | "DRAFT"
  | "OPEN"
  | "PREPARING"
  | "SERVED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "CANCELLED"
  | "VOIDED"
  | string;

const TICKET_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  OPEN: "Acik",
  PREPARING: "Hazirlaniyor",
  SERVED: "Servis Edildi",
  PAYMENT_PENDING: "Odeme Bekliyor",
  PAID: "Odendi",
  CANCELLED: "Iptal",
  VOIDED: "Iptal",
};

const TICKET_STATUS_TONES: Record<string, "neutral" | "active" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  OPEN: "active",
  PREPARING: "warning",
  SERVED: "success",
  PAYMENT_PENDING: "warning",
  PAID: "success",
  CANCELLED: "danger",
  VOIDED: "danger",
};

export function formatTicketStatus(status?: string | null) {
  const key = String(status ?? "OPEN").toUpperCase();
  return TICKET_STATUS_LABELS[key] ?? key;
}

export function getTicketStatusTone(status?: string | null) {
  const key = String(status ?? "OPEN").toUpperCase();
  return TICKET_STATUS_TONES[key] ?? "neutral";
}

export function isTableBusy(table: Record<string, any> | null | undefined) {
  if (!table) return false;
  const status = String(table.status ?? "").toUpperCase();
  if (status && status !== "AVAILABLE") return true;
  return Boolean(table.activeTicketId ?? table.activeTicket?.id);
}

export function resolveActiveTicketId(table: Record<string, any>) {
  return table.activeTicketId ?? table.activeTicket?.id ?? null;
}

export function getTableLobbyMeta(table: Record<string, any>, openTicketCount?: number) {
  const busy = isTableBusy(table);
  const activeTicket = (table.activeTicket as Record<string, any> | undefined) ?? null;
  const itemCount = Array.isArray(activeTicket?.items) ? activeTicket.items.length : 0;
  const grandTotal = Number(activeTicket?.grandTotal ?? 0);
  const ticketStatus = activeTicket?.status ? String(activeTicket.status) : busy ? "OPEN" : null;
  const resolvedOpenTicketCount = openTicketCount ?? (busy ? 1 : 0);
  const openedAt = activeTicket?.openedAt ? String(activeTicket.openedAt) : null;
  const coverCount = Number(activeTicket?.coverCount ?? 0) || null;
  const billRequested = Boolean(activeTicket?.billRequestedAt);

  return {
    busy,
    statusLabel: busy ? "Dolu" : "Bos",
    ticketStatusLabel: billRequested ? "Hesap Bekliyor" : ticketStatus ? formatTicketStatus(ticketStatus) : null,
    ticketStatusTone: billRequested ? "warning" : ticketStatus ? getTicketStatusTone(ticketStatus) : "neutral",
    itemCount,
    grandTotal,
    openTicketCount: resolvedOpenTicketCount,
    tableLabel: String(table.name ?? table.code ?? "Masa"),
    tableCode: String(table.code ?? table.name ?? "-"),
    openedAt,
    coverCount,
    billRequested,
  };
}
