import type { InventoryResource } from "./inventory.resources";

export interface InventoryFieldOption {
  label: string;
  value: string;
}

export interface InventoryFieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "switch" | "select" | "datetime";
  required?: boolean;
  options?: InventoryFieldOption[];
}

export interface InventoryColumnConfig {
  key: string;
  label: string;
}

export interface InventoryFilterConfig {
  key: string;
  label: string;
  type: "text" | "select" | "date";
}

export interface InventoryResourceConfig {
  key: InventoryResource;
  title: string;
  description: string;
  delegate?: string;
  readOnly?: boolean;
  companyScoped?: boolean;
  branchScoped?: boolean;
  exportable: boolean;
  include?: Record<string, unknown>;
  fields: InventoryFieldConfig[];
  columns: InventoryColumnConfig[];
  filters: InventoryFilterConfig[];
  relationOptionKeys?: Array<"branches" | "warehouses" | "units" | "categories" | "inventoryItems" | "products">;
  searchFields?: string[];
  numberFields?: string[];
  booleanFields?: string[];
  dateFields?: string[];
}

export const inventoryRegistry: Record<InventoryResource, InventoryResourceConfig> = {
  warehouses: {
    key: "warehouses",
    title: "Depolar",
    description: "Sube bazli depo tanimlari",
    delegate: "warehouse",
    branchScoped: true,
    exportable: true,
    include: { branch: true },
    fields: [
      { key: "branchId", label: "Sube", type: "select", required: true },
      { key: "name", label: "Depo Adi", type: "text", required: true },
      { key: "code", label: "Kod", type: "text", required: true },
      { key: "description", label: "Aciklama", type: "textarea" },
      { key: "isActive", label: "Aktif", type: "switch" },
    ],
    columns: [
      { key: "name", label: "Depo" },
      { key: "code", label: "Kod" },
      { key: "branch.name", label: "Sube" },
      { key: "isActive", label: "Durum" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "search", label: "Ara", type: "text" },
    ],
    relationOptionKeys: ["branches"],
    searchFields: ["name", "code", "description"],
    booleanFields: ["isActive"],
  },
  "stock-transfer": {
    key: "stock-transfer",
    title: "Depo Transfer",
    description: "Depolar arasi stok hareketi",
    delegate: "stockTransfer",
    branchScoped: true,
    exportable: true,
    include: { outgoingWarehouse: { include: { branch: true } }, incomingWarehouse: { include: { branch: true } }, inventoryItem: true },
    fields: [
      { key: "inventoryItemId", label: "Stoklu Urun", type: "select", required: true },
      { key: "fromWarehouseId", label: "Cikis Deposu", type: "select", required: true },
      { key: "toWarehouseId", label: "Varis Deposu", type: "select", required: true },
      { key: "quantity", label: "Miktar", type: "number", required: true },
      { key: "transferDate", label: "Transfer Tarihi", type: "datetime", required: true },
      { key: "status", label: "Durum", type: "select", required: true, options: [
        { label: "pending", value: "pending" },
        { label: "completed", value: "completed" },
        { label: "cancelled", value: "cancelled" },
      ] },
      { key: "note", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "inventoryItem.name", label: "Urun" },
      { key: "outgoingWarehouse.name", label: "Cikis" },
      { key: "incomingWarehouse.name", label: "Varis" },
      { key: "quantity", label: "Miktar" },
      { key: "status", label: "Durum" },
    ],
    filters: [
      { key: "warehouseId", label: "Depo", type: "select" },
      { key: "status", label: "Durum", type: "select" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["warehouses", "inventoryItems"],
    numberFields: ["quantity"],
    dateFields: ["transferDate"],
  },
  "inventory-units": {
    key: "inventory-units",
    title: "Stok Birimleri",
    description: "kg, lt, adet gibi temel birimler",
    delegate: "inventoryUnit",
    companyScoped: true,
    exportable: true,
    fields: [
      { key: "name", label: "Birim", type: "text", required: true },
      { key: "symbol", label: "Sembol", type: "text", required: true },
    ],
    columns: [
      { key: "name", label: "Birim" },
      { key: "symbol", label: "Sembol" },
    ],
    filters: [{ key: "search", label: "Ara", type: "text" }],
    searchFields: ["name", "symbol"],
  },
  "inventory-categories": {
    key: "inventory-categories",
    title: "Stoklu Urun Kategorileri",
    description: "Stok urun kategori havuzu",
    delegate: "inventoryCategory",
    companyScoped: true,
    exportable: true,
    fields: [
      { key: "name", label: "Kategori", type: "text", required: true },
      { key: "description", label: "Aciklama", type: "textarea" },
    ],
    columns: [
      { key: "name", label: "Kategori" },
      { key: "description", label: "Aciklama" },
    ],
    filters: [{ key: "search", label: "Ara", type: "text" }],
    searchFields: ["name", "description"],
  },
  "inventory-items": {
    key: "inventory-items",
    title: "Stoklu Urunler",
    description: "Depo bazli stoklu urun kartlari",
    delegate: "inventoryItem",
    exportable: true,
    include: { warehouse: { include: { branch: true } }, category: true, unit: true, stockAlerts: true },
    fields: [
      { key: "warehouseId", label: "Depo", type: "select", required: true },
      { key: "categoryId", label: "Kategori", type: "select" },
      { key: "unitId", label: "Birim", type: "select", required: true },
      { key: "name", label: "Urun", type: "text", required: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "barcode", label: "Barkod", type: "text" },
      { key: "minimumLevel", label: "Minimum Stok", type: "number", required: true },
      { key: "currentStock", label: "Mevcut Stok", type: "number", required: true },
      { key: "isActive", label: "Aktif", type: "switch" },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "name", label: "Urun" },
      { key: "warehouse.name", label: "Depo" },
      { key: "unit.symbol", label: "Birim" },
      { key: "currentStock", label: "Stok" },
      { key: "minimumLevel", label: "Min." },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "warehouseId", label: "Depo", type: "select" },
      { key: "search", label: "Ara", type: "text" },
    ],
    relationOptionKeys: ["branches", "warehouses", "units", "categories"],
    searchFields: ["name", "sku", "barcode", "notes"],
    numberFields: ["minimumLevel", "currentStock"],
    booleanFields: ["isActive"],
  },
  "stock-entry": {
    key: "stock-entry",
    title: "Stok Girisi",
    description: "Elle stok ekleme, duzeltme ve hareket kaydi",
    delegate: "stockEntry",
    exportable: true,
    include: { warehouse: { include: { branch: true } }, inventoryItem: { include: { unit: true } } },
    fields: [
      { key: "warehouseId", label: "Depo", type: "select", required: true },
      { key: "inventoryItemId", label: "Stoklu Urun", type: "select", required: true },
      { key: "entryType", label: "Hareket Tipi", type: "select", required: true, options: [
        { label: "purchase", value: "purchase" },
        { label: "adjustment_in", value: "adjustment_in" },
        { label: "adjustment_out", value: "adjustment_out" },
      ] },
      { key: "quantity", label: "Miktar", type: "number", required: true },
      { key: "unitCost", label: "Birim Maliyet", type: "number" },
      { key: "createdAt", label: "Tarih", type: "datetime", required: true },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    columns: [
      { key: "inventoryItem.name", label: "Urun" },
      { key: "warehouse.name", label: "Depo" },
      { key: "entryType", label: "Tip" },
      { key: "quantity", label: "Miktar" },
      { key: "createdAt", label: "Tarih" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "warehouseId", label: "Depo", type: "select" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "warehouses", "inventoryItems"],
    numberFields: ["quantity", "unitCost"],
    dateFields: ["createdAt"],
  },
  "stock-status": {
    key: "stock-status",
    title: "Stok Durumu",
    description: "Depo bazli anlik stok ve minimum seviye gorunumu",
    readOnly: true,
    exportable: true,
    fields: [],
    columns: [
      { key: "name", label: "Urun" },
      { key: "branchName", label: "Sube" },
      { key: "warehouseName", label: "Depo" },
      { key: "currentStock", label: "Stok" },
      { key: "minimumLevel", label: "Min." },
      { key: "alertStatus", label: "Uyari" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "warehouseId", label: "Depo", type: "select" },
      { key: "search", label: "Ara", type: "text" },
    ],
    relationOptionKeys: ["branches", "warehouses"],
  },
  "stock-cards": {
    key: "stock-cards",
    title: "Stok Kartlari",
    description: "Tarih sirali stok hareket kartlari",
    readOnly: true,
    exportable: true,
    fields: [],
    columns: [
      { key: "inventoryItem.name", label: "Urun" },
      { key: "warehouse.name", label: "Depo" },
      { key: "entryType", label: "Hareket" },
      { key: "effectQuantity", label: "Etki" },
      { key: "createdAt", label: "Tarih" },
      { key: "notes", label: "Not" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "warehouseId", label: "Depo", type: "select" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "warehouses"],
  },
  "waste-products": {
    key: "waste-products",
    title: "Atik Urunler",
    description: "Fire ve atik hareket kayitlari",
    delegate: "wasteRecord",
    exportable: true,
    include: { inventoryItem: { include: { warehouse: { include: { branch: true } }, unit: true } } },
    fields: [
      { key: "inventoryItemId", label: "Stoklu Urun", type: "select", required: true },
      { key: "quantity", label: "Miktar", type: "number", required: true },
      { key: "reason", label: "Sebep", type: "text", required: true },
      { key: "notes", label: "Not", type: "textarea" },
      { key: "recordedAt", label: "Tarih", type: "datetime", required: true },
    ],
    columns: [
      { key: "inventoryItem.name", label: "Urun" },
      { key: "inventoryItem.warehouse.name", label: "Depo" },
      { key: "quantity", label: "Miktar" },
      { key: "reason", label: "Sebep" },
      { key: "recordedAt", label: "Tarih" },
    ],
    filters: [
      { key: "branchId", label: "Sube", type: "select" },
      { key: "warehouseId", label: "Depo", type: "select" },
      { key: "startDate", label: "Baslangic", type: "date" },
      { key: "endDate", label: "Bitis", type: "date" },
    ],
    relationOptionKeys: ["branches", "warehouses", "inventoryItems"],
    numberFields: ["quantity"],
    dateFields: ["recordedAt"],
  },
};
