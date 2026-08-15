export interface MobileScreenDefinition {
  key: string;
  title: string;
  tab?: "dashboard" | "operations" | "alerts" | "reports" | "profile";
  stack: "auth" | "main" | "detail";
  requiresBranchContext: boolean;
}

export const mobileScreens: MobileScreenDefinition[] = [
  { key: "login", title: "Giris", stack: "auth", requiresBranchContext: false },
  { key: "session-security", title: "Guvenli Oturum", stack: "auth", requiresBranchContext: false },
  { key: "branch-selector", title: "Sube Secimi", stack: "main", requiresBranchContext: false },
  { key: "dashboard", title: "Dashboard", tab: "dashboard", stack: "main", requiresBranchContext: true },
  { key: "daily-revenue", title: "Gunluk Ciro", tab: "dashboard", stack: "detail", requiresBranchContext: true },
  { key: "weekly-monthly-summary", title: "Haftalik Aylik Ozet", tab: "reports", stack: "detail", requiresBranchContext: true },
  { key: "branch-comparison", title: "Sube Karsilastirmalari", tab: "reports", stack: "detail", requiresBranchContext: true },
  { key: "active-orders", title: "Aktif Siparis Yogunlugu", tab: "operations", stack: "detail", requiresBranchContext: true },
  { key: "campaign-status", title: "Aktif Kampanyalar", tab: "operations", stack: "detail", requiresBranchContext: true },
  { key: "attendance-feed", title: "Personel Mesai Durumu", tab: "operations", stack: "detail", requiresBranchContext: true },
  { key: "break-monitor", title: "Mola Takibi", tab: "operations", stack: "detail", requiresBranchContext: true },
  { key: "critical-stock-alerts", title: "Kritik Stoklar", tab: "alerts", stack: "detail", requiresBranchContext: true },
  { key: "daily-tasks", title: "Gorevler", tab: "operations", stack: "detail", requiresBranchContext: true },
  { key: "approvals", title: "Hizli Onaylar", tab: "alerts", stack: "detail", requiresBranchContext: true },
  { key: "cash-closure-summary", title: "Kasa Kapanis Ozeti", tab: "reports", stack: "detail", requiresBranchContext: true },
  { key: "top-products", title: "En Cok Satan Urunler", tab: "reports", stack: "detail", requiresBranchContext: true },
  { key: "low-performance-products", title: "Dusuk Performansli Urunler", tab: "reports", stack: "detail", requiresBranchContext: true },
  { key: "staff-performance", title: "Personel Performansi", tab: "reports", stack: "detail", requiresBranchContext: true },
  { key: "notifications", title: "Bildirim Merkezi", tab: "alerts", stack: "detail", requiresBranchContext: true },
  { key: "profile", title: "Hesap ve Profil", tab: "profile", stack: "main", requiresBranchContext: false },
];

export const bottomTabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "operations", label: "Operasyon" },
  { key: "alerts", label: "Uyarilar" },
  { key: "reports", label: "Raporlar" },
  { key: "profile", label: "Profil" },
] as const;
