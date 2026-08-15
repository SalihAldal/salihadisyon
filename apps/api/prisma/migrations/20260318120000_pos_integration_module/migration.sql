-- POS Integration Management module migration

-- Create enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PosConnectionType') THEN
    CREATE TYPE "PosConnectionType" AS ENUM ('NETWORK', 'USB');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PosDeviceHealthStatus') THEN
    CREATE TYPE "PosDeviceHealthStatus" AS ENUM ('IDLE', 'OFFLINE', 'ONLINE', 'ERROR', 'BUSY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PosTransactionStatus') THEN
    CREATE TYPE "PosTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT');
  END IF;
END $$;

-- Extend existing PosDevice
ALTER TABLE "PosDevice"
  ADD COLUMN IF NOT EXISTS "brand" TEXT,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "registryNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "connectionType" "PosConnectionType",
  ADD COLUMN IF NOT EXISTS "port" INTEGER,
  ADD COLUMN IF NOT EXISTS "pinCodeEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "deviceIdentifier" TEXT,
  ADD COLUMN IF NOT EXISTS "capabilitiesJson" JSONB,
  ADD COLUMN IF NOT EXISTS "settingsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "lastTestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastTestStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PosDevice_branchId_serialNumber_isActive_idx"
  ON "PosDevice"("branchId", "serialNumber", "isActive");

-- POS brand-model catalog
CREATE TABLE IF NOT EXISTS "PosBrandModel" (
  "id" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "supportedConnectionTypesJson" JSONB,
  "requiresIp" BOOLEAN NOT NULL DEFAULT false,
  "requiresPort" BOOLEAN NOT NULL DEFAULT false,
  "requiresPin" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "capabilitiesJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosBrandModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PosBrandModel_brand_model_key"
  ON "PosBrandModel"("brand", "model");
CREATE INDEX IF NOT EXISTS "PosBrandModel_brand_isActive_idx"
  ON "PosBrandModel"("brand", "isActive");

-- POS device assignments
CREATE TABLE IF NOT EXISTS "PosDeviceAssignment" (
  "id" TEXT NOT NULL,
  "posDeviceId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "terminalId" TEXT,
  "cashRegisterId" TEXT,
  "stationId" TEXT,
  "assignedUserId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosDeviceAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PosDeviceAssignment_branchId_terminalId_isDefault_idx"
  ON "PosDeviceAssignment"("branchId", "terminalId", "isDefault");
CREATE INDEX IF NOT EXISTS "PosDeviceAssignment_posDeviceId_isActive_idx"
  ON "PosDeviceAssignment"("posDeviceId", "isActive");

ALTER TABLE "PosDeviceAssignment"
  ADD CONSTRAINT "PosDeviceAssignment_posDeviceId_fkey"
  FOREIGN KEY ("posDeviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosDeviceAssignment"
  ADD CONSTRAINT "PosDeviceAssignment_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosDeviceAssignment"
  ADD CONSTRAINT "PosDeviceAssignment_terminalId_fkey"
  FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- POS transactions
CREATE TABLE IF NOT EXISTS "PosDeviceTransaction" (
  "id" TEXT NOT NULL,
  "posDeviceId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "terminalId" TEXT,
  "ticketId" TEXT,
  "transactionType" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "installmentCount" INTEGER,
  "referenceNo" TEXT,
  "stanNo" TEXT,
  "rrnNo" TEXT,
  "batchNo" TEXT,
  "authCode" TEXT,
  "maskedCardNo" TEXT,
  "cardBrand" TEXT,
  "responseCode" TEXT,
  "responseMessage" TEXT,
  "providerStatus" TEXT,
  "providerPayloadJson" JSONB,
  "requestPayloadJson" JSONB,
  "status" "PosTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosDeviceTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PosDeviceTransaction_branchId_status_createdAt_idx"
  ON "PosDeviceTransaction"("branchId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PosDeviceTransaction_ticketId_createdAt_idx"
  ON "PosDeviceTransaction"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "PosDeviceTransaction_posDeviceId_createdAt_idx"
  ON "PosDeviceTransaction"("posDeviceId", "createdAt");

ALTER TABLE "PosDeviceTransaction"
  ADD CONSTRAINT "PosDeviceTransaction_posDeviceId_fkey"
  FOREIGN KEY ("posDeviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosDeviceTransaction"
  ADD CONSTRAINT "PosDeviceTransaction_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosDeviceTransaction"
  ADD CONSTRAINT "PosDeviceTransaction_terminalId_fkey"
  FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosDeviceTransaction"
  ADD CONSTRAINT "PosDeviceTransaction_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- POS device logs
CREATE TABLE IF NOT EXISTS "PosDeviceLog" (
  "id" TEXT NOT NULL,
  "posDeviceId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "contextJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosDeviceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PosDeviceLog_posDeviceId_createdAt_idx"
  ON "PosDeviceLog"("posDeviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "PosDeviceLog_branchId_createdAt_idx"
  ON "PosDeviceLog"("branchId", "createdAt");

ALTER TABLE "PosDeviceLog"
  ADD CONSTRAINT "PosDeviceLog_posDeviceId_fkey"
  FOREIGN KEY ("posDeviceId") REFERENCES "PosDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosDeviceLog"
  ADD CONSTRAINT "PosDeviceLog_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
