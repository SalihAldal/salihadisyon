export interface AccountingScreenConfig {
  slug: string;
  resource:
    | "accounts"
    | "ticket-ledger"
    | "sold-products"
    | "payments"
    | "vat-rates"
    | "suppliers"
    | "supplier-vat"
    | "business-customers"
    | "customer-vat"
    | "invoices"
    | "invoice-items"
    | "unit-costs"
    | "cash-closures"
    | "fixed-costs"
    | "payroll"
    | "other-payments";
  title: string;
  description: string;
}

export const accountingScreens: AccountingScreenConfig[] = [
  { slug: "hesaplar", resource: "accounts", title: "Hesaplar", description: "Hesap kartlari" },
  { slug: "adisyon-listesi", resource: "ticket-ledger", title: "Adisyon Listesi", description: "Adisyon ve tahsilat akisi" },
  { slug: "satilan-urunler", resource: "sold-products", title: "Satilan Urunler", description: "Urun bazli satislar" },
  { slug: "odemeler", resource: "payments", title: "Odemeler", description: "Odeme hareketleri" },
  { slug: "urun-kdv-oranlari", resource: "vat-rates", title: "Urun KDV Oranlari", description: "KDV tanimlari" },
  { slug: "tedarikciler", resource: "suppliers", title: "Tedarikciler", description: "Tedarikci havuzu" },
  { slug: "tedarikci-kdv-raporlari", resource: "supplier-vat", title: "Tedarikci KDV Raporlari", description: "Tedarikci bazli KDV" },
  { slug: "musteri-isletmeler", resource: "business-customers", title: "Musteri Isletmeler", description: "Kurumsal musteri listesi" },
  { slug: "musteri-kdv-raporlari", resource: "customer-vat", title: "Musteri KDV Raporlari", description: "Kurumsal musteri KDV raporlari" },
  { slug: "faturalar", resource: "invoices", title: "Faturalar", description: "Fatura ve kalemleri" },
  { slug: "fatura-kalemleri", resource: "invoice-items", title: "Fatura Kalemleri", description: "Kalem detaylari" },
  { slug: "birim-maliyetler", resource: "unit-costs", title: "Birim Maliyetler", description: "Urun maliyetleri" },
  { slug: "kasa-kapanislari", resource: "cash-closures", title: "Kasa Kapanislari", description: "Kasa sayim ve farklari" },
  { slug: "sabit-maliyetler", resource: "fixed-costs", title: "Sabit Maliyetler", description: "Kira ve sabit giderler" },
  { slug: "personel-odemeleri", resource: "payroll", title: "Personel Odemeleri", description: "Maas ve ek odemeler" },
  { slug: "diger-odemeler", resource: "other-payments", title: "Diger Odemeler", description: "Operasyonel diger odemeler" },
];

export function getAccountingScreen(slug?: string) {
  if (!slug) return null;
  return accountingScreens.find((item) => item.slug === slug) ?? null;
}
