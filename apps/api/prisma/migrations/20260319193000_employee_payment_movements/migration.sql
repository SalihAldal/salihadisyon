-- CreateEnum
CREATE TYPE "EmployeePaymentMovementType" AS ENUM ('PAYMENT', 'RECEIVABLE');

-- AlterTable
ALTER TABLE "PayrollPayment"
ADD COLUMN "movementType" "EmployeePaymentMovementType" NOT NULL DEFAULT 'PAYMENT',
ADD COLUMN "transactionType" TEXT NOT NULL DEFAULT 'salary',
ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "documentUrl" TEXT,
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT,
ADD COLUMN "deletionNote" TEXT;

-- Indexes
CREATE INDEX "PayrollPayment_employeeProfileId_movementType_paymentDate_idx" ON "PayrollPayment"("employeeProfileId", "movementType", "paymentDate");
CREATE INDEX "PayrollPayment_branchId_deletedAt_paymentDate_idx" ON "PayrollPayment"("branchId", "deletedAt", "paymentDate");
