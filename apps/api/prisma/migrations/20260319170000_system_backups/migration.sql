-- CreateEnum
CREATE TYPE "SystemBackupTrigger" AS ENUM ('MANUAL', 'DAILY_AUTO', 'PRE_RESTORE');

-- CreateEnum
CREATE TYPE "SystemBackupStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "SystemBackup" (
    "id" TEXT NOT NULL,
    "trigger" "SystemBackupTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "SystemBackupStatus" NOT NULL DEFAULT 'RUNNING',
    "requestedByUserId" TEXT,
    "label" TEXT,
    "fileName" TEXT,
    "filePath" TEXT,
    "checksumSha256" TEXT,
    "sizeBytes" BIGINT,
    "databaseName" TEXT,
    "criticalSummary" JSONB,
    "manifest" JSONB,
    "restoreSourceBackupId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemBackup_status_createdAt_idx" ON "SystemBackup"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SystemBackup_trigger_createdAt_idx" ON "SystemBackup"("trigger", "createdAt");

-- CreateIndex
CREATE INDEX "SystemBackup_requestedByUserId_createdAt_idx" ON "SystemBackup"("requestedByUserId", "createdAt");
