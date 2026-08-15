/*
  Warnings:

  - A unique constraint covering the columns `[attendanceQrHash]` on the table `EmployeeProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `branchId` to the `Goal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Goal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK';

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_employeeProfileId_fkey";

-- DropIndex
DROP INDEX "EmployeeFinancialProfile_ibanLast4_idx";

-- DropIndex
DROP INDEX "EmployeePersonalProfile_identityNumberLast4_idx";

-- DropIndex
DROP INDEX "RefundRequest_companyId_branchId_status_resolvedAt_idx";

-- AlterTable
ALTER TABLE "EmployeeContactProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmployeeEmergencyContact" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmployeeFinancialProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmployeePersonalProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "attendanceQrHash" TEXT,
ADD COLUMN     "attendanceQrIssuedAt" TIMESTAMP(3),
ADD COLUMN     "lateToleranceMinutes" INTEGER NOT NULL DEFAULT 10,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recurrenceType" TEXT NOT NULL DEFAULT 'once',
ADD COLUMN     "startDate" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "bonusApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bonusBaseValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "bonusType" TEXT,
ADD COLUMN     "bonusValue" DECIMAL(12,2),
ADD COLUMN     "branchId" TEXT NOT NULL,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "goalScope" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "goalType" TEXT NOT NULL DEFAULT 'revenue',
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "manualOverrideNote" TEXT,
ADD COLUMN     "manualOverrideValue" DECIMAL(12,2),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "progressRate" DECIMAL(7,2) NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "employeeProfileId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "defaultVatRateId" TEXT;

-- AlterTable
ALTER TABLE "MenuProduct" ADD COLUMN     "allergenInfo" TEXT,
ADD COLUMN     "calories" INTEGER,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isVatAuto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PayrollPayment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SystemBackup" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "branchId" TEXT NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "createdByUserId" TEXT;

-- CreateTable
CREATE TABLE "GoalBonus" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeProfileId" TEXT,
    "bonusType" TEXT NOT NULL,
    "bonusValue" DECIMAL(12,2) NOT NULL,
    "calculatedAmount" DECIMAL(12,2) NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "payrollPaymentId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "notes" TEXT,
    "sourceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoalBonus_goalId_key" ON "GoalBonus"("goalId");

-- CreateIndex
CREATE INDEX "GoalBonus_branchId_status_createdAt_idx" ON "GoalBonus"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GoalBonus_employeeProfileId_status_idx" ON "GoalBonus"("employeeProfileId", "status");

-- CreateIndex
CREATE INDEX "AttendanceEvent_employeeProfileId_occurredAt_idx" ON "AttendanceEvent"("employeeProfileId", "occurredAt");

-- CreateIndex
CREATE INDEX "EmployeeContactProfile_employeeId_idx" ON "EmployeeContactProfile"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeEmergencyContact_employeeId_idx" ON "EmployeeEmergencyContact"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeFinancialProfile_employeeId_idx" ON "EmployeeFinancialProfile"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeePersonalProfile_employeeId_idx" ON "EmployeePersonalProfile"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_attendanceQrHash_key" ON "EmployeeProfile"("attendanceQrHash");

-- CreateIndex
CREATE INDEX "EmployeeProfile_branchId_isActive_idx" ON "EmployeeProfile"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "Expense_branchId_expenseType_expenseDate_idx" ON "Expense"("branchId", "expenseType", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_branchId_expenseType_isActive_idx" ON "Expense"("branchId", "expenseType", "isActive");

-- CreateIndex
CREATE INDEX "Goal_branchId_status_startsAt_endsAt_idx" ON "Goal"("branchId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Goal_employeeProfileId_status_idx" ON "Goal"("employeeProfileId", "status");

-- CreateIndex
CREATE INDEX "Goal_productId_idx" ON "Goal"("productId");

-- CreateIndex
CREATE INDEX "Goal_categoryId_idx" ON "Goal"("categoryId");

-- CreateIndex
CREATE INDEX "Notification_branchId_createdAt_idx" ON "Notification"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "RecipeItem_inventoryItemId_idx" ON "RecipeItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Shift_employeeProfileId_scheduledStartAt_idx" ON "Shift"("employeeProfileId", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "StockEntry_referenceType_referenceId_idx" ON "StockEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "SupportTicket_companyId_branchId_status_resolvedAt_idx" ON "SupportTicket"("companyId", "branchId", "status", "resolvedAt");

-- CreateIndex
CREATE INDEX "Task_branchId_status_dueAt_idx" ON "Task"("branchId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_createdByUserId_idx" ON "Task"("createdByUserId");

-- CreateIndex
CREATE INDEX "Ticket_branchId_createdByUserId_closedAt_idx" ON "Ticket"("branchId", "createdByUserId", "closedAt");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_defaultVatRateId_fkey" FOREIGN KEY ("defaultVatRateId") REFERENCES "VatRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MenuProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalBonus" ADD CONSTRAINT "GoalBonus_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalBonus" ADD CONSTRAINT "GoalBonus_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalBonus" ADD CONSTRAINT "GoalBonus_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
