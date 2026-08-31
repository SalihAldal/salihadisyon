-- Ticket split lineage (Prompt 12)
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "parentTicketId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "splitGroupId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "personLabel" TEXT;

CREATE INDEX IF NOT EXISTS "Ticket_splitGroupId_idx" ON "Ticket"("splitGroupId");
CREATE INDEX IF NOT EXISTS "Ticket_parentTicketId_idx" ON "Ticket"("parentTicketId");
