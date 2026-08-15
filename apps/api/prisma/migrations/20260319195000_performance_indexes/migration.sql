CREATE INDEX "ModifierGroup_companyId_idx" ON "ModifierGroup"("companyId");

CREATE INDEX "RequiredChoiceGroup_companyId_idx" ON "RequiredChoiceGroup"("companyId");

CREATE INDEX "Ticket_companyId_branchId_status_closedAt_idx" ON "Ticket"("companyId", "branchId", "status", "closedAt");

CREATE INDEX "TicketItem_productId_idx" ON "TicketItem"("productId");

CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");

CREATE INDEX "RefundRequest_companyId_branchId_status_resolvedAt_idx"
ON "RefundRequest"("companyId", "branchId", "status", "resolvedAt");
