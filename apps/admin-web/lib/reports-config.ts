export interface ReportScreenConfig {
  slug: string;
  report:
    | "sales-reports"
    | "payment-method-reports"
    | "expense-reports"
    | "cash-closure-reports"
    | "discount-reports"
    | "product-reports"
    | "profitability-reports"
    | "stock-reports"
    | "consumption-reports"
    | "finance-reports"
    | "employee-reports"
    | "shift-reports"
    | "goal-bonus-reports";
  title: string;
  description: string;
}

export const reportScreens: ReportScreenConfig[] = [
  { slug: "satis-raporlari", report: "sales-reports", title: "Satis Raporlari", description: "Ciro, fis ve sube karsilastirmalari" },
  { slug: "odeme-tipi-raporlari", report: "payment-method-reports", title: "Odeme Tipi Raporlari", description: "Odeme yontemi dagilimi ve performansi" },
  { slug: "gider-raporlari", report: "expense-reports", title: "Gider Raporlari", description: "Gider kategorileri, dagilim ve trend analizi" },
  { slug: "kasa-kapanis-raporlari", report: "cash-closure-reports", title: "Kasa Kapanis Raporlari", description: "Kasa farklari ve kapanis takibi" },
  { slug: "indirim-raporlari", report: "discount-reports", title: "Indirim Raporlari", description: "Iskonto kullanimi ve indirim etkisi" },
  { slug: "urun-raporlari", report: "product-reports", title: "Urun Raporlari", description: "Urun bazli performans analizi" },
  { slug: "maliyet-karlilik-raporlari", report: "profitability-reports", title: "Maliyet & Karlilik", description: "Recete maliyeti, net satis ve kar analizi" },
  { slug: "stok-raporlari", report: "stock-reports", title: "Stok Raporlari", description: "Stok, hareket ve kritik urun analizi" },
  { slug: "hammadde-tuketim-raporlari", report: "consumption-reports", title: "Hammadde Tuketim", description: "Satisa bagli hammadde tuketimi ve stok etkisi" },
  { slug: "finans-raporlari", report: "finance-reports", title: "Finans Raporlari", description: "Tahsilat, gider ve net akis" },
  { slug: "calisan-raporlari", report: "employee-reports", title: "Calisan Raporlari", description: "Mesai, hedef ve performans raporu" },
  { slug: "mesai-raporlari", report: "shift-reports", title: "Mesai Raporlari", description: "Vardiya yogunlugu, gec kalma ve fazla mesai analizi" },
  { slug: "hedef-ve-prim-raporlari", report: "goal-bonus-reports", title: "Hedef & Prim Raporlari", description: "Hedef tamamlama, prim hak edisi ve onay takibi" },
];

export function getReportScreen(slug?: string) {
  if (!slug) return null;
  return reportScreens.find((item) => item.slug === slug) ?? null;
}
