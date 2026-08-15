export interface PosSettingsScreenConfig {
  slug: string;
  resource:
    | "menu-management"
    | "menu-products"
    | "menu-categories"
    | "campaigns"
    | "happy-hour"
    | "timed-discounts"
    | "qr-menu"
    | "table-sections"
    | "delivery-addresses"
    | "customers"
    | "optional-products"
    | "required-choice-groups"
    | "payment-methods"
    | "defined-devices"
    | "terminals"
    | "printers"
    | "back-screen-slider"
    | "table-colors"
    | "discount-types"
    | "preset-notes"
    | "settings";
  title: string;
  description: string;
}

export const posSettingsScreens: PosSettingsScreenConfig[] = [
  { slug: "menu", resource: "menu-management", title: "Menu Yonetimi", description: "Urun ve varyant yonetimi" },
  { slug: "urunler", resource: "menu-products", title: "Urunler", description: "Menu urunleri ve fiyatlari" },
  { slug: "kategoriler", resource: "menu-categories", title: "Kategoriler", description: "Menu kategori listesi" },
  { slug: "kampanyalar", resource: "campaigns", title: "Kampanyalar", description: "Tum kampanya CRUD ekrani" },
  { slug: "happy-hour", resource: "happy-hour", title: "Happy Hour", description: "Saat bazli kampanyalar" },
  { slug: "sureli-indirimler", resource: "timed-discounts", title: "Sureli Indirimler", description: "Zaman bazli indirimler" },
  { slug: "qr-menu", resource: "qr-menu", title: "QR Menu", description: "QR yayin ve tema ayarlari" },
  { slug: "masalar", resource: "table-sections", title: "Bolumler / Masalar", description: "Masa tanimlari ve alan baglantisi" },
  { slug: "paket-servis-adresleri", resource: "delivery-addresses", title: "Paket Servis Adresleri", description: "Teslimat adresleri" },
  { slug: "musteriler", resource: "customers", title: "Musteriler", description: "Musteri kartlari" },
  { slug: "opsiyonel-urunler", resource: "optional-products", title: "Opsiyonel Urunler", description: "Modifier grup ve opsiyonlari" },
  { slug: "zorunlu-secim-gruplari", resource: "required-choice-groups", title: "Zorunlu Secim Gruplari", description: "Secim gruplari" },
  { slug: "odeme-yontemleri", resource: "payment-methods", title: "Odeme Yontemleri", description: "Odeme configleri" },
  { slug: "tanimli-cihazlar", resource: "defined-devices", title: "Tanimli Cihazlar", description: "POS cihaz envanteri" },
  { slug: "terminaller", resource: "terminals", title: "Terminaller", description: "Terminal CRUD" },
  { slug: "yazicilar", resource: "printers", title: "Yazicilar", description: "Fis ve mutfak yazicilari" },
  { slug: "arka-ekran-slider", resource: "back-screen-slider", title: "Arka Ekran Slider", description: "Slide yonetimi" },
  { slug: "masa-renkleri", resource: "table-colors", title: "Masa Renkleri", description: "Durum renk kurallari" },
  { slug: "indirim-turleri", resource: "discount-types", title: "Indirim Turleri", description: "Indirim setleri" },
  { slug: "on-tanimli-notlar", resource: "preset-notes", title: "On Tanimli Notlar", description: "Servis notlari" },
  { slug: "ayarlar", resource: "settings", title: "Ayarlar", description: "Merkezi POS setting kayitlari" },
];

export function getPosSettingsScreen(slug?: string) {
  if (!slug) {
    return null;
  }

  return posSettingsScreens.find((item) => item.slug === slug) ?? null;
}
