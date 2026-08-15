export type PosMode = "table" | "self_service" | "delivery" | "takeaway" | "qr_order";

export interface PosSessionState {
  userId: string;
  branchId: string;
  terminalId: string;
  shiftId: string | null;
  cashRegisterOpen: boolean;
  mode: PosMode;
}

export interface PosTicketLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string[];
  modifiers: string[];
  status: "pending" | "sent_to_kitchen" | "preparing" | "served" | "cancelled";
  syncStatus: "synced" | "pending" | "failed";
}

export interface PosTicketState {
  id: string | null;
  tableId: string | null;
  customerName: string;
  customerPhone: string;
  coverCount: number;
  label: string;
  lines: PosTicketLine[];
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  coverCharge: number;
  paidAmount: number;
  remainingAmount: number;
  grandTotal: number;
}

export interface PosSyncState {
  online: boolean;
  websocketConnected: boolean;
  queueDepth: number;
  lastSyncAt: string | null;
  conflictTicketId: string | null;
}

export interface PosRootState {
  session: PosSessionState;
  ticket: PosTicketState;
  sync: PosSyncState;
}

export const initialPosState: PosRootState = {
  session: {
    userId: "user_cashier_01",
    branchId: "branch_nisantasi",
    terminalId: "terminal_02",
    shiftId: "shift_today_01",
    cashRegisterOpen: true,
    mode: "table",
  },
  ticket: {
    id: "ticket_12",
    tableId: "table_12",
    customerName: "Ayse Yilmaz",
    customerPhone: "05320000000",
    coverCount: 4,
    label: "Masa 12",
    lines: [],
    subtotal: 0,
    discountTotal: 0,
    serviceCharge: 0,
    coverCharge: 0,
    paidAmount: 0,
    remainingAmount: 0,
    grandTotal: 0,
  },
  sync: {
    online: true,
    websocketConnected: true,
    queueDepth: 0,
    lastSyncAt: null,
    conflictTicketId: null,
  },
};

export function recalculateTicketTotals(ticket: PosTicketState): PosTicketState {
  const subtotal = ticket.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const grandTotal = subtotal - ticket.discountTotal + ticket.serviceCharge + ticket.coverCharge;
  return {
    ...ticket,
    subtotal,
    grandTotal,
    remainingAmount: Math.max(grandTotal - ticket.paidAmount, 0),
  };
}

export function applyLineQuantity(line: PosTicketLine, quantity: number): PosTicketLine {
  const nextQuantity = Math.max(quantity, 0);
  return {
    ...line,
    quantity: nextQuantity,
    lineTotal: nextQuantity * line.unitPrice,
    syncStatus: "pending",
  };
}
