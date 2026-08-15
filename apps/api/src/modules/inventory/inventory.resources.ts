export const inventoryResources = [
  "warehouses",
  "stock-transfer",
  "inventory-units",
  "inventory-categories",
  "inventory-items",
  "stock-entry",
  "stock-status",
  "stock-cards",
  "waste-products",
] as const;

export type InventoryResource = (typeof inventoryResources)[number];
