export interface PosEndpointNeed {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  purpose: string;
  critical?: boolean;
}

export const posEndpointNeeds: PosEndpointNeed[] = [
  { method: "GET", path: "/pos/catalog", purpose: "Kategori, alt kategori, urun, varyant, modifier ve gorsel cache verisi" },
  { method: "GET", path: "/pos/tables", purpose: "Masa, aktif ticket ve durum haritasi" },
  { method: "GET", path: "/pos/pending-orders", purpose: "QR, paket ve gel-al siparis kuyrugu" },
  { method: "POST", path: "/pos/tickets", purpose: "Yeni adisyon ac", critical: true },
  { method: "PATCH", path: "/pos/tickets/:ticketId", purpose: "Masa, musteri, kuver, etiket, durum gibi ust bilgileri guncelle", critical: true },
  { method: "POST", path: "/pos/tickets/:ticketId/items", purpose: "Adisyona urun ekle", critical: true },
  { method: "PATCH", path: "/pos/tickets/:ticketId/items/:itemId", purpose: "Satir adet, note, modifier veya secimlerini guncelle", critical: true },
  { method: "DELETE", path: "/pos/tickets/:ticketId/items/:itemId", purpose: "Satir iptal et veya kaldir", critical: true },
  { method: "POST", path: "/pos/tickets/:ticketId/discounts", purpose: "Satir ya da fis bazli indirim uygula", critical: true },
  { method: "POST", path: "/pos/tickets/:ticketId/payments", purpose: "Odeme, parcali odeme ve iade oncesi durum guncelle", critical: true },
  { method: "POST", path: "/pos/tickets/:ticketId/split", purpose: "Adisyon bol" },
  { method: "POST", path: "/pos/tickets/:ticketId/merge", purpose: "Adisyon birlestir", critical: true },
  { method: "POST", path: "/pos/tickets/:ticketId/transfer", purpose: "Masa tasima", critical: true },
  { method: "POST", path: "/pos/tickets/:ticketId/void", purpose: "Fis iptal et", critical: true },
  { method: "POST", path: "/pos/tickets/:ticketId/refund", purpose: "Iade islemi baslat", critical: true },
  { method: "POST", path: "/pos/approvals", purpose: "Yonetici PIN veya onay akisi tetikle", critical: true },
  { method: "POST", path: "/pos/printers/dispatch", purpose: "Mutfak/bar/fis/etiket yazdir" },
  { method: "POST", path: "/pos/drawer/open", purpose: "Nakit cekmecesi acma olayi", critical: true },
];

export const posSocketRooms = ["branch:{branchId}", "terminal:{terminalId}", "ticket:{ticketId}", "user:{userId}"] as const;
