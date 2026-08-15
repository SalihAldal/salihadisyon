-- AlterTable
ALTER TABLE "Expense"
ADD COLUMN "userId" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "register_closings" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "terminalId" TEXT,
    "openingCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "countedCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "register_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "register_transactions" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "closingId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentType" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "register_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_breakdown" (
    "id" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "cash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "card" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mobile" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_breakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_denominations" (
    "id" TEXT NOT NULL,
    "closingId" TEXT NOT NULL,
    "denomination" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_denominations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_userId_createdAt_idx" ON "Expense"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "register_closings_branchId_createdAt_idx" ON "register_closings"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "register_closings_userId_isOpen_idx" ON "register_closings"("userId", "isOpen");

-- CreateIndex
CREATE INDEX "register_closings_terminalId_idx" ON "register_closings"("terminalId");

-- CreateIndex
CREATE INDEX "register_transactions_branchId_createdAt_idx" ON "register_transactions"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "register_transactions_orderId_idx" ON "register_transactions"("orderId");

-- CreateIndex
CREATE INDEX "register_transactions_closingId_createdAt_idx" ON "register_transactions"("closingId", "createdAt");

-- CreateIndex
CREATE INDEX "register_transactions_paymentType_createdAt_idx" ON "register_transactions"("paymentType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_breakdown_closingId_key" ON "payment_breakdown"("closingId");

-- CreateIndex
CREATE INDEX "payment_breakdown_createdAt_idx" ON "payment_breakdown"("createdAt");

-- CreateIndex
CREATE INDEX "cash_denominations_closingId_denomination_idx" ON "cash_denominations"("closingId", "denomination");

-- CreateIndex
CREATE INDEX "cash_denominations_createdAt_idx" ON "cash_denominations"("createdAt");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_closings" ADD CONSTRAINT "register_closings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_closings" ADD CONSTRAINT "register_closings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_closings" ADD CONSTRAINT "register_closings_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_transactions" ADD CONSTRAINT "register_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_transactions" ADD CONSTRAINT "register_transactions_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "register_closings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_transactions" ADD CONSTRAINT "register_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_transactions" ADD CONSTRAINT "register_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_breakdown" ADD CONSTRAINT "payment_breakdown_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "register_closings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_denominations" ADD CONSTRAINT "cash_denominations_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "register_closings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
