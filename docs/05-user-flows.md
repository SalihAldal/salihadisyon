# 05 User Flows

## Dashboard
1. Kullanici tarih, sube ve personel filtresi secer.
2. API `dashboard/overview` ve ilgili rapor endpointlerini cagirir.
3. KPI kartlari, grafikler ve operasyon uyarilari ayni filtre setiyle senkron calisir.

## POS Adisyon
1. Kanal secilir: masa, self servis, paket, gel-al.
2. Urunler kategori ve arama ile secilir.
3. Modifier ve zorunlu secim kurallari uygulanir.
4. Adisyon ozeti guncellenir, indirim veya kampanya uygulanir.
5. Odeme tekli veya parcali alinabilir.
6. Odeme tamamlaninca masa durumu ve finans hareketi anlik guncellenir.

## Mesai QR
1. Yetkili sube bazli signed QR uretir.
2. Personel kiosk veya mobil cihazla QR okutur.
3. Sistem token gecerliligi, expiry ve action tipini dogrular.
4. Attendance eventi olusturur, gec kalma veya erken cikis kurallarini isletir.
5. Gerekirse yonetici onayina duser.

## Stok Dusumu
1. Ticket `paid` oldugunda stok job'i tetiklenir.
2. `Recipe` uzerinden kullanilan inventory item miktarlari hesaplanir.
3. `StockEntry` kayitlari olusturulur.
4. Min seviyenin altina inen urunler icin `StockAlert` acilir.
