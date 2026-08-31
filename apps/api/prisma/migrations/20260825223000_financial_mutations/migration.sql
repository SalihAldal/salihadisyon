-- Prompt 13 — Discount / Comp / Void / Approval fields

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

ALTER TABLE "TicketDiscount" ADD COLUMN IF NOT EXISTS "discountKind" TEXT NOT NULL DEFAULT 'DISCOUNT';
ALTER TABLE "TicketDiscount" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "TicketDiscount" ADD COLUMN IF NOT EXISTS "originalAmount" DECIMAL(12,2);
ALTER TABLE "TicketDiscount" ADD COLUMN IF NOT EXISTS "percentage" DECIMAL(8,4);
ALTER TABLE "TicketDiscount" ADD COLUMN IF NOT EXISTS "approvalRequestId" TEXT;
ALTER TABLE "TicketDiscount" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'applied';
ALTER TABLE "TicketDiscount" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "TicketDiscount_status_idx" ON "TicketDiscount"("status");
CREATE INDEX IF NOT EXISTS "TicketDiscount_approvalRequestId_idx" ON "TicketDiscount"("approvalRequestId");
