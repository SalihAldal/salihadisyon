export interface StaffScreenConfig {
  slug: string;
  resource:
    | "team"
    | "payroll"
    | "staff-discounts"
    | "goals"
    | "notifications"
    | "shifts"
    | "breaks"
    | "tracking"
    | "roles"
    | "tasks"
    | "audit-questions"
    | "audit-survey";
  title: string;
  description: string;
}

export const staffScreens: StaffScreenConfig[] = [
  { slug: "yonetici-ve-personel", resource: "team", title: "Yonetici & Personel", description: "Personel, hesap ve rol yonetimi" },
  { slug: "hedefler", resource: "goals", title: "Hedefler", description: "Satis hedefleri, ilerleme ve prim takibi" },
  { slug: "gorev-ve-todo", resource: "tasks", title: "Gorev & To-Do", description: "Personel gorev, termin ve ilerleme takibi" },
  { slug: "personel-bildirimleri", resource: "notifications", title: "Personel Bildirimleri", description: "Personel bildirim ve duyuru akisi" },
  { slug: "maas-yonetimi", resource: "payroll", title: "Maas Yonetimi", description: "Personel maas odeme akisi" },
  { slug: "mesai-yonetimi", resource: "shifts", title: "Mesai Yonetimi", description: "Vardiya planlama ve onaylar" },
  { slug: "mola-sureleri", resource: "breaks", title: "Mola Sureleri", description: "Mola baslat-bitir kayitlari" },
  { slug: "personel-rolleri", resource: "roles", title: "Personel Rolleri", description: "Rol ve izin setleri" },
  { slug: "personel-takip", resource: "tracking", title: "Personel Takip", description: "Mesai hareket ve ihlaller" },
  { slug: "operasyon-devamli-sorular", resource: "audit-questions", title: "Operasyon Devamli Sorular", description: "Denetim soru bankasi" },
  { slug: "operasyon-devamli-anketi", resource: "audit-survey", title: "Operasyon Devamli Anketi", description: "Denetim anket sonuclari" },
  { slug: "personel-indirimleri", resource: "staff-discounts", title: "Personel Indirimleri", description: "Personel bazli indirim kurallari" },
];

export function getStaffScreen(slug?: string) {
  if (!slug) return null;
  return staffScreens.find((item) => item.slug === slug) ?? null;
}
