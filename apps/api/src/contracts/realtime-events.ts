export interface RealtimeEventDefinition {
  event: string;
  producer: string;
  consumers: string[];
  payloadShape: string[];
}

export const realtimeEvents: RealtimeEventDefinition[] = [
  { event: "table.status.changed", producer: "tables", consumers: ["pos-web", "admin-web", "mobile-manager"], payloadShape: ["branchId", "tableId", "status", "activeTicketId"] },
  { event: "ticket.updated", producer: "pos", consumers: ["pos-web", "kitchen-screen", "admin-web"], payloadShape: ["ticketId", "status", "items", "totals"] },
  { event: "ticket.locked", producer: "pos", consumers: ["pos-web"], payloadShape: ["ticketId", "terminalId", "lockedByUserId", "expiresAt"] },
  { event: "ticket.item.cancelled", producer: "pos", consumers: ["pos-web", "admin-web"], payloadShape: ["ticketId", "itemId", "reason", "approvedByUserId"] },
  { event: "pending-order.created", producer: "pos", consumers: ["pos-web", "admin-web"], payloadShape: ["pendingOrderId", "channel", "customerName", "source"] },
  { event: "pending-order.accepted", producer: "pos", consumers: ["pos-web", "admin-web"], payloadShape: ["pendingOrderId", "ticketId", "acceptedByUserId"] },
  { event: "payment.completed", producer: "pos", consumers: ["pos-web", "admin-web", "mobile-manager"], payloadShape: ["ticketId", "paymentId", "amount", "method"] },
  { event: "payment.processing", producer: "pos", consumers: ["pos-web"], payloadShape: ["ticketId", "paymentAttemptId", "method", "startedAt"] },
  { event: "refund.requested", producer: "pos", consumers: ["pos-web", "admin-web"], payloadShape: ["ticketId", "refundRequestId", "requestedByUserId", "amount"] },
  { event: "approval.required", producer: "pos", consumers: ["pos-web", "mobile-manager"], payloadShape: ["approvalRequestId", "action", "requestedByUserId", "ticketId"] },
  { event: "register.updated", producer: "register", consumers: ["pos-web", "admin-web"], payloadShape: ["action", "branchId", "terminalId", "closingId", "summary"] },
  { event: "cash.closure.created", producer: "accounting", consumers: ["admin-web", "mobile-manager"], payloadShape: ["branchId", "closureId", "varianceAmount"] },
  { event: "attendance.recorded", producer: "attendance", consumers: ["admin-web", "mobile-manager"], payloadShape: ["employeeProfileId", "action", "occurredAt"] },
  { event: "inventory.stock.changed", producer: "inventory", consumers: ["admin-web", "pos-web", "mobile-manager"], payloadShape: ["branchId", "inventoryItemId", "warehouseId", "currentStock", "minimumLevel", "effect"] },
  { event: "stock.alert.opened", producer: "inventory", consumers: ["admin-web", "mobile-manager"], payloadShape: ["branchId", "inventoryItemId", "currentStock", "threshold"] },
  { event: "campaign.state.changed", producer: "campaigns", consumers: ["admin-web", "pos-web"], payloadShape: ["campaignId", "isActive", "effectiveAt"] },
  { event: "kitchen.status.changed", producer: "pos", consumers: ["pos-web", "admin-web"], payloadShape: ["ticketId", "itemId", "status", "station"] },
  { event: "terminal.heartbeat", producer: "integrations", consumers: ["admin-web", "pos-web"], payloadShape: ["terminalId", "status", "heartbeatAt"] },
  { event: "sync.conflict", producer: "pos", consumers: ["pos-web"], payloadShape: ["ticketId", "serverVersion", "clientVersion", "conflictFields"] },
];
