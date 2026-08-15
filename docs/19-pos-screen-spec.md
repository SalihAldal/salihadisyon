# 19 POS Screen Spec

## 1. POS Ekran Genel Mimarisi

### Amaç
- Kasiyer, garson veya self servis operatörü en az dokunusla siparis alir.
- Sistem masa, self servis, paket, gel-al ve QR siparisten gelen akislari tek arayuzde yonetir.
- Yogun saatlerde ekran akisi bozulmadan calisir.

### Ana Bolumler
1. Ust bar
2. Sol/orta urun katalogu
3. Sag aktif adisyon paneli
4. Yardimci drawer katmani
5. Alt durum ve offline/reconnect katmani

### Tasarim Kararlari
- Modal yerine once sag drawer
- Tam ekran modal sadece odeme, yetkili onay ve masa haritasi gibi kritik durumlarda
- Yuksek kontrast ve buyuk hit-area
- Tek tek satir duzenlemesi yerine hizli stepper aksiyonlari

## 2. Kullanici Akislari

### Hızlı Masa Siparişi
1. Kullanici `Masa Servisi` modunu secer.
2. Masa secimi veya arama ile aktif masa belirlenir.
3. Urunler kategori ve alt kategori sekmelerinden secilir.
4. Varyant/zorunlu secim drawer'i acilir.
5. Urun aninda sag panelde gorunur.
6. Not/opsiyon/indirim gerekiyorsa satir drawer'i acilir.
7. Siparis mutfaga gonderilir veya odeme adimina gecilir.

### Self Servis
1. Mod `Self Servis`.
2. Sira numarasi otomatik atanir.
3. Müşteri bilgisi opsiyonel.
4. Odeme siparis oncesi ya da sonrasi policy'e gore alinir.

### Paket / Gel-Al
1. Mod secilir.
2. Musteri telefonundan hizli arama/acma.
3. Teslimat adresi veya gel-al saat bilgisi secilir.
4. Siparis notu ve kurye bilgisi eklenir.
5. Hazirlik ve teslim eventleri realtime akar.

### QR Siparişten Gelen Sipariş
1. QR siparis `pending` olarak sisteme duser.
2. Ust barda bekleyen siparis rozeti artar.
3. Operator siparisi kabul eder, masaya veya queue'ya baglar.
4. Odeme durumu ve satir notlari mevcut ticket'e merge edilir.

## 3. Ekran Yerlesimi

### Ust Bar
- Sol: mod switcher
- Orta: global urun/masa/musteri arama
- Sag: aktif kullanici, terminal, vardiya, bekleyen siparis, gecmis siparis, kasa, hizli aksiyonlar

### Sol/Orta Alan
- Kategori sekmeleri
- Alt kategori sekmeleri
- Hizli filtreler: populer, son eklenen, kampanyali, stokta az
- Urun grid'i
- Sanal klavye destekli arama alanı

### Sag Panel
- Aktif masa / siparis basligi
- Musteri alanlari
- Satirlar
- Ozet bloklari
- Hizli aksiyon ikonlari
- Odeme CTA
- Masa kapat
- Daha fazla islem dropdown'u

## 4. Component Listesi

### Navigation
- `ModeSwitcher`
- `SessionStatusPill`
- `QuickActionDock`
- `PendingOrdersButton`

### Catalog
- `CategoryTabs`
- `SubcategoryTabs`
- `ProductSearchBar`
- `ProductCard`
- `ProductVariantDrawer`
- `RequiredChoiceDrawer`
- `OptionalProductsDrawer`

### Ticket
- `TicketHeader`
- `CustomerSummaryCard`
- `TicketLineItem`
- `QuantityStepper`
- `LineActionMenu`
- `TicketTotalsCard`
- `TicketQuickActions`

### Payments
- `PaymentMethodGrid`
- `MultiPaymentComposer`
- `CashCalculator`
- `ApprovalDrawer`
- `ReceiptActions`

### Utilities
- `OfflineSyncBanner`
- `RealtimePulse`
- `EmptyTicketState`
- `LoadingCatalogSkeleton`

## 5. Durum Yönetimi

### Store Katmanlari
- `sessionStore`: kullanici, yetki, vardiya, terminal, kasa durumu
- `catalogStore`: kategori, alt kategori, urun cache'i, arama
- `tablesStore`: masa durumu, aktif ticket map, merge/transfer state
- `ticketStore`: aktif ticket, satirlar, indirimler, notlar, odenen, kalan
- `paymentStore`: odeme modal state, parcali odeme satirlari, para ustu
- `syncStore`: websocket baglantisi, offline queue, retry status

### Optimistic Akis
- Urun ekleme optimistic olur
- Sync basarisizsa satir `sync-pending` rozeti alir
- Reconnect sonrasi mutation replay edilir

### Yetki Katmani
- Iptal, iade, indirim override, cekmece acma, masa birlestirme ve adisyon silme aksiyonlari permission check ile korunur
- Yetki eksiginde `ApprovalDrawer` acilir

## 6. Websocket Event Planı

### Inbound Events
- `pos.ticket.updated`
- `pos.ticket.locked`
- `pos.table.status.changed`
- `pos.pending-order.created`
- `pos.kitchen.status.changed`
- `pos.payment.completed`
- `pos.approval.required`
- `pos.shift.status.changed`
- `pos.sync.conflict`

### Outbound Events
- `pos.ticket.item.added`
- `pos.ticket.item.updated`
- `pos.ticket.discount.applied`
- `pos.ticket.moved`
- `pos.ticket.merged`
- `pos.payment.started`
- `pos.payment.finished`
- `pos.refund.requested`
- `pos.drawer.opened`

## 7. Urun Ekleme Akisi
1. Urun kartina tek dokunus.
2. Varyant yoksa direkt ticket'a eklenir.
3. Varyant varsa mini drawer acilir.
4. Zorunlu secim varsa tamamlanmadan ekleme tamamlanmaz.
5. Opsiyonel urun ve not alanlari `skip` edilebilir.
6. Eklenen satir sag panelde highlight ile belirir.
7. Ardisik ayni urun eklenirse quantity artar veya ayara gore yeni satir acilir.

## 8. Odeme Akisi
1. `Odeme Al` CTA.
2. Kalan tutar hesaplanir.
3. Odeme yontemi secilir: nakit, kart, yemek karti, kupon, acik hesap.
4. Parcali odeme varsa satir satir eklenir.
5. Nakitte para ustu hesaplanir.
6. Yetki gerekiyorsa onay drawer'i acilir.
7. Basarili odeme sonunda fis/etiket/yazdir secenekleri gorunur.
8. Ticket `paid` olur, masa kapanir veya yeni ticket'a hazir hale gelir.

## 9. Iptal Iade Akisi

### Satir Iptali
- Satir menu > `Iptal`
- Sebep secimi zorunlu
- Yetki yoksa onay kodu/yonetici onayi
- Audit log zorunlu

### Fis Iptali
- `Adisyon Ayarlari` > `Adisyonu Iptal Et`
- Tum satirlar ve odemeler kontrol edilir
- Odenmis ticket icin iade akisi ayrik calisir

### Iade
- Gecmis siparisten fis secilir
- Iade edilecek satirlar ve adet girilir
- Iade yontemi secilir
- Kasa, muhasebe ve audit kaydi beraber olusur

## 10. Masa Yönetimi Akisi

### Masa Tasima
- Ticket actions > `Masa Tasi`
- Uygun bos masa listesi ve durum renkleri gelir
- Realtime lock uygulanir

### Masa Birlestirme
- Iki veya daha fazla aktif ticket secilir
- Hedef masa secilir
- Birlesim once preview edilir
- Odeme ve kuver toplam mantigi gosterilir

### Adisyon Bolme
- Satir secimi ile yeni ticket olusturulur
- Kisi bazli veya tutar bazli bolme destegi olur

## 11. Performans Optimizasyonlari
- Sanal scroll veya chunked grid render
- Kategori ve urun cache
- Drawer lazy mount
- Realtime event debounce
- Payment ve critical mutations icin dedicated queue
- Buyuk listelerde server search + local cache hybrid
- Optimistic update + retry policy
- Printer ve label islemlerinde UI block edilmez

## 12. Ornek Component Kodları

### Production Grade Component Yaklasimi
- Presentational component + store hook ayrimi
- Pure props ile render
- Derived totals memoized hesaplanir
- Action handler'lar command mantiginda tek yerden yonetilir

## 13. Backend Endpoint Ihtiyaclari
- `GET /api/v1/pos/catalog`
- `GET /api/v1/pos/tables`
- `POST /api/v1/pos/tickets`
- `PATCH /api/v1/pos/tickets/:id`
- `POST /api/v1/pos/tickets/:id/items`
- `PATCH /api/v1/pos/tickets/:id/items/:itemId`
- `DELETE /api/v1/pos/tickets/:id/items/:itemId`
- `POST /api/v1/pos/tickets/:id/notes`
- `POST /api/v1/pos/tickets/:id/discounts`
- `POST /api/v1/pos/tickets/:id/payments`
- `POST /api/v1/pos/tickets/:id/split`
- `POST /api/v1/pos/tickets/:id/merge`
- `POST /api/v1/pos/tickets/:id/transfer`
- `POST /api/v1/pos/tickets/:id/void`
- `POST /api/v1/pos/tickets/:id/refund`
- `GET /api/v1/pos/pending-orders`
- `POST /api/v1/pos/approvals`
- `POST /api/v1/pos/printers/dispatch`
- `POST /api/v1/pos/drawer/open`

## 14. Veritabani Tablolari
- `Ticket`
- `TicketItem`
- `TicketNote`
- `TicketDiscount`
- `TicketPayment`
- `TicketSplit`
- `PendingOrder`
- `RefundRequest`
- `ApprovalRequest`
- `TableSession`
- `QueueTicket`
- `DeliveryOrder`
- `PrinterJob`
- `DrawerEvent`

## 15. Hata Senaryolari ve Cozumleri

### Realtime Catisma
- Sorun: ayni ticket iki terminalde duzenleniyor
- Cozum: soft lock + latest version check + conflict drawer

### Offline
- Sorun: baglanti koptu
- Cozum: local mutation queue + offline banner + replay

### Printer Basarisiz
- Sorun: mutfak yazicisi cevap vermiyor
- Cozum: async retry + fallback printer + warning toast

### Payment Timeout
- Sorun: kart cevabi gec geldi
- Cozum: `processing` status + duplicate payment guard

### Yetki Eksigi
- Sorun: kasiyer iade yapmak istiyor
- Cozum: approval drawer + supervisor PIN / QR
