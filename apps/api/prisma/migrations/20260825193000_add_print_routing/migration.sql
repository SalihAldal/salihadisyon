-- AlterTable
ALTER TABLE "Printer" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "Printer" ADD COLUMN IF NOT EXISTS "printDestinationId" TEXT;
ALTER TABLE "Printer" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Printer" ALTER COLUMN "connectionUri" SET DEFAULT 'bridge://local';

-- AlterTable
ALTER TABLE "PrinterJob" ADD COLUMN IF NOT EXISTS "printDestinationId" TEXT;
ALTER TABLE "PrinterJob" ADD COLUMN IF NOT EXISTS "destinationCode" TEXT;
ALTER TABLE "PrinterJob" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PrinterJob_idempotencyKey_key" ON "PrinterJob"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PrinterJob_ticketId_destinationCode_jobType_idx" ON "PrinterJob"("ticketId", "destinationCode", "jobType");
CREATE INDEX IF NOT EXISTS "Printer_branchId_printDestinationId_idx" ON "Printer"("branchId", "printDestinationId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PrintDestination" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCashRegister" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintDestination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CategoryPrintDestination" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "printDestinationId" TEXT NOT NULL,

    CONSTRAINT "CategoryPrintDestination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductPrintRouting" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "useCategoryRouting" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPrintRouting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductPrintDestination" (
    "id" TEXT NOT NULL,
    "productPrintRoutingId" TEXT NOT NULL,
    "printDestinationId" TEXT NOT NULL,

    CONSTRAINT "ProductPrintDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrintDestination_branchId_code_key" ON "PrintDestination"("branchId", "code");
CREATE INDEX IF NOT EXISTS "PrintDestination_companyId_branchId_isActive_idx" ON "PrintDestination"("companyId", "branchId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryPrintDestination_categoryId_printDestinationId_key" ON "CategoryPrintDestination"("categoryId", "printDestinationId");
CREATE INDEX IF NOT EXISTS "CategoryPrintDestination_printDestinationId_idx" ON "CategoryPrintDestination"("printDestinationId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPrintRouting_productId_key" ON "ProductPrintRouting"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductPrintDestination_productPrintRoutingId_printDestinationId_key" ON "ProductPrintDestination"("productPrintRoutingId", "printDestinationId");
CREATE INDEX IF NOT EXISTS "ProductPrintDestination_printDestinationId_idx" ON "ProductPrintDestination"("printDestinationId");

ALTER TABLE "PrintDestination" DROP CONSTRAINT IF EXISTS "PrintDestination_companyId_fkey";
ALTER TABLE "PrintDestination" ADD CONSTRAINT "PrintDestination_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrintDestination" DROP CONSTRAINT IF EXISTS "PrintDestination_branchId_fkey";
ALTER TABLE "PrintDestination" ADD CONSTRAINT "PrintDestination_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CategoryPrintDestination" DROP CONSTRAINT IF EXISTS "CategoryPrintDestination_categoryId_fkey";
ALTER TABLE "CategoryPrintDestination" ADD CONSTRAINT "CategoryPrintDestination_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryPrintDestination" DROP CONSTRAINT IF EXISTS "CategoryPrintDestination_printDestinationId_fkey";
ALTER TABLE "CategoryPrintDestination" ADD CONSTRAINT "CategoryPrintDestination_printDestinationId_fkey" FOREIGN KEY ("printDestinationId") REFERENCES "PrintDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductPrintRouting" DROP CONSTRAINT IF EXISTS "ProductPrintRouting_productId_fkey";
ALTER TABLE "ProductPrintRouting" ADD CONSTRAINT "ProductPrintRouting_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MenuProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductPrintDestination" DROP CONSTRAINT IF EXISTS "ProductPrintDestination_productPrintRoutingId_fkey";
ALTER TABLE "ProductPrintDestination" ADD CONSTRAINT "ProductPrintDestination_productPrintRoutingId_fkey" FOREIGN KEY ("productPrintRoutingId") REFERENCES "ProductPrintRouting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPrintDestination" DROP CONSTRAINT IF EXISTS "ProductPrintDestination_printDestinationId_fkey";
ALTER TABLE "ProductPrintDestination" ADD CONSTRAINT "ProductPrintDestination_printDestinationId_fkey" FOREIGN KEY ("printDestinationId") REFERENCES "PrintDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Printer" DROP CONSTRAINT IF EXISTS "Printer_printDestinationId_fkey";
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_printDestinationId_fkey" FOREIGN KEY ("printDestinationId") REFERENCES "PrintDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
