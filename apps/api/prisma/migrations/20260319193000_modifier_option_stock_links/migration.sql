ALTER TABLE "ModifierOption"
ADD COLUMN "inventoryItemId" TEXT,
ADD COLUMN "stockQuantity" DECIMAL(10,2);

ALTER TABLE "RequiredChoiceOption"
ADD COLUMN "inventoryItemId" TEXT,
ADD COLUMN "stockQuantity" DECIMAL(10,2);

CREATE INDEX "ModifierOption_inventoryItemId_idx" ON "ModifierOption"("inventoryItemId");
CREATE INDEX "RequiredChoiceOption_inventoryItemId_idx" ON "RequiredChoiceOption"("inventoryItemId");

ALTER TABLE "ModifierOption"
ADD CONSTRAINT "ModifierOption_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RequiredChoiceOption"
ADD CONSTRAINT "RequiredChoiceOption_inventoryItemId_fkey"
FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MenuProduct_stockItemId_idx" ON "MenuProduct"("stockItemId");

ALTER TABLE "MenuProduct"
ADD CONSTRAINT "MenuProduct_stockItemId_fkey"
FOREIGN KEY ("stockItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
