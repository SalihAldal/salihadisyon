-- CreateEnum
CREATE TYPE "MonitoringSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "SystemMonitorEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "branchId" TEXT,
    "userId" TEXT,
    "requestId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT NOT NULL,
    "severity" "MonitoringSeverity" NOT NULL DEFAULT 'ERROR',
    "fingerprint" TEXT NOT NULL,
    "isAlertSent" BOOLEAN NOT NULL DEFAULT false,
    "alertChannels" JSONB,
    "metadata" JSONB,
    "stack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemMonitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemMonitorEvent_companyId_createdAt_idx" ON "SystemMonitorEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemMonitorEvent_severity_createdAt_idx" ON "SystemMonitorEvent"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SystemMonitorEvent_statusCode_createdAt_idx" ON "SystemMonitorEvent"("statusCode", "createdAt");

-- CreateIndex
CREATE INDEX "SystemMonitorEvent_fingerprint_createdAt_idx" ON "SystemMonitorEvent"("fingerprint", "createdAt");
