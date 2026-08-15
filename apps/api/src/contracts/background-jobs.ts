export interface BackgroundJobDefinition {
  name: string;
  queue: string;
  schedule?: string;
  purpose: string;
}

export const backgroundJobs: BackgroundJobDefinition[] = [
  { name: "report-export", queue: "exports", purpose: "Excel, CSV ve PDF export dosyalarini uretir" },
  { name: "campaign-scheduler", queue: "campaigns", schedule: "* * * * *", purpose: "Happy hour ve sureli indirim pencerelerini acip kapatir" },
  { name: "attendance-qr-rotation", queue: "attendance", schedule: "*/5 * * * *", purpose: "QR tokenlarini yeniler ve expired tokenlari temizler" },
  { name: "stock-reconciliation", queue: "inventory", schedule: "0 * * * *", purpose: "Satis kaynakli stok dusumleri ile depo hareketlerini mutabik hale getirir" },
  { name: "daily-branch-summary", queue: "reports", schedule: "0 1 * * *", purpose: "Gunluk sube operasyon ozetlerini hesaplar" },
  { name: "cash-closure-reminder", queue: "notifications", schedule: "0 23 * * *", purpose: "Kapanmayan kasalar icin yonetici bildirimi gonderir" },
  { name: "push-dispatch", queue: "notifications", purpose: "Mobil uygulama push bildirimlerini dagitir" },
  { name: "integration-sync", queue: "integrations", schedule: "*/15 * * * *", purpose: "Odeme cihazlari ve dis servislerle veri esitlemesi yapar" },
];
