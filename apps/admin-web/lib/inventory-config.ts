export interface InventoryScreenConfig {
  slug: string;
  resource:
    | "warehouses"
    | "stock-transfer"
    | "inventory-units"
    | "inventory-categories"
    | "inventory-items"
    | "stock-entry"
    | "stock-status"
    | "stock-cards"
    | "waste-products";
  title: string;
  description: string;
}

export const inventoryScreens: InventoryScreenConfig[] = [
  { slug: "depolar", resource: "warehouses", title: "Depolar", description: "Depo kartlari" },
  { slug: "depo-transfer", resource: "stock-transfer", title: "Depo Transfer", description: "Depolar arasi hareket" },
  { slug: "stok-birimleri", resource: "inventory-units", title: "Stok Birimleri", description: "Birim tanimlari" },
  { slug: "stoklu-urun-kategorileri", resource: "inventory-categories", title: "Stoklu Urun Kategorileri", description: "Kategori havuzu" },
  { slug: "stoklu-urunler", resource: "inventory-items", title: "Stoklu Urunler", description: "Depo bazli stok kartlari" },
  { slug: "stok-girisi", resource: "stock-entry", title: "Stok Girisi", description: "Elle stok hareketi" },
  { slug: "stok-durumu", resource: "stock-status", title: "Stok Durumu", description: "Anlik stok gorunumu" },
  { slug: "stok-kartlari", resource: "stock-cards", title: "Stok Kartlari", description: "Hareket gecmisi" },
  { slug: "atik-urunler", resource: "waste-products", title: "Atik Urunler", description: "Fire ve atik kayitlari" },
];

export function getInventoryScreen(slug?: string) {
  if (!slug) return null;
  return inventoryScreens.find((item) => item.slug === slug) ?? null;
}
