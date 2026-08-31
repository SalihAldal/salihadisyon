-- Prompt 14: bill request + item staff attribution
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "billRequestedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "billRequestedByUserId" TEXT;

ALTER TABLE "TicketItem" ADD COLUMN IF NOT EXISTS "addedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Ticket_billRequestedAt_idx" ON "Ticket"("billRequestedAt");
CREATE INDEX IF NOT EXISTS "TicketItem_addedByUserId_idx" ON "TicketItem"("addedByUserId");

DO $$ BEGIN
  ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_billRequestedByUserId_fkey"
    FOREIGN KEY ("billRequestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketItem" ADD CONSTRAINT "TicketItem_addedByUserId_fkey"
    FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
