-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('WORK', 'LEAVE', 'OFF_DAY');

-- AlterTable
ALTER TABLE "Shift"
ADD COLUMN "shiftType" "ShiftType" NOT NULL DEFAULT 'WORK',
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Indexes
CREATE INDEX "Shift_employeeProfileId_shiftType_scheduledStartAt_idx" ON "Shift"("employeeProfileId", "shiftType", "scheduledStartAt");
