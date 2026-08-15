ALTER TABLE "AuditLog"
ADD COLUMN "oldValues" JSONB,
ADD COLUMN "newValues" JSONB,
ADD COLUMN "deviceInfo" TEXT;
