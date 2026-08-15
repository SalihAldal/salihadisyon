# 21 Mobile Manager Spec

## 1. Bilgi Mimarisi

### Uygulama Amaci
Mobil uygulama, POS yapmak icin degil; isletme sahibi, bolge yoneticisi, sube yoneticisi ve operasyon sorumlusu icin cebinden canli operasyon kontrolu saglamak icin tasarlanir.

### Ana Bilgi Kategorileri
- Kimlik ve oturum
- Sube baglami
- Finansal ozet
- Operasyon yogunlugu
- Personel ve vardiya
- Stok ve kritik alarmlar
- Kampanya ve ticari performans
- Gorev ve onaylar
- Bildirim ve profil

### Kullanici Tipine Gore Oncelik
- `isletme sahibi`: genel finans, sube karsilastirma, kritik alarmlar, abonelik, kasa kapanisi
- `bolge yoneticisi`: sube bazli karsilastirma, performans ve personel hareketleri
- `sube yoneticisi`: aktif siparis, vardiya, mola, stok ve kampanya
- `operasyon sorumlusu`: gorevler, denetim, personel takibi, anlik uyarilar

## 2. Navigation Map

### Root Flow
1. `AuthStack`
2. `BranchContextGate`
3. `MainTabs`
4. `DetailStacks`

### Bottom Tab Yapisi
- `Dashboard`
- `Operations`
- `Alerts`
- `Reports`
- `Profile`

### Stack Navigation
- `LoginScreen`
- `SessionSecurityScreen`
- `BranchSelectorScreen`
- `DashboardScreen`
- `RevenueDetailScreen`
- `BranchComparisonScreen`
- `OrdersIntensityScreen`
- `CampaignStatusScreen`
- `AttendanceStatusScreen`
- `BreakMonitorScreen`
- `CriticalStockScreen`
- `TasksScreen`
- `ApprovalQueueScreen`
- `CashClosureSummaryScreen`
- `TopProductsScreen`
- `LowPerformanceProductsScreen`
- `StaffPerformanceScreen`
- `NotificationCenterScreen`
- `ProfileScreen`

## 3. Tum Ekranlarin Aciklamasi

### Giris / Guvenli Oturum
- Amac: kullanici auth + cihaz dogrulamasi
- Icerik: email/telefon, sifre, 2FA, cihaz adlandirma
- Durumlar: login loading, invalid credentials, 2FA retry, token refresh error

### Sube Secimi
- Amac: kullanicinin yetkili oldugu subeler arasinda aktif baglam secmek
- Icerik: sube kartlari, son secilenler, favori subeler
- Aksiyon: `Sec ve Devam Et`

### Dashboard
- Amac: tek ekranda gunluk kontrol
- Icerik: anlik ciro, aktif siparis yogunlugu, kritik stoklar, aktif kampanyalar, mesai durumu, kasa kapanis ozetleri, uyarilar

### Gunluk Ciro
- Saatlik ciro trendi
- Odeme dagilimi
- Gunun hedefe gore performansi

### Haftalik/Aylik Ozet
- Haftalik ve aylik trend kartlari
- Gecen donem ile fark
- Ortalama fis ve siparis adedi

### Sube Karsilastirmalari
- Sube listesi + karsilastirma kartlari
- Ciro, siparis, personel verimliligi, stok riski

### Aktif Siparis Yogunlugu
- Aktif siparis sayisi
- Kanal bazli dagilim
- Bekleyen QR/paket/gel-al akislari

### Aktif Kampanyalar
- Kampanya durumu
- Canli ac/kapat
- Etkiledigi sube ve satis katkisi

### Personel Mesai Durumu
- Kim aktif vardiyada
- Gec kalanlar
- Fazla mesai adaylari

### Mola Takibi
- Mola baslatan/bitiren personel
- Uzayan mola uyarilari

### Kritik Stoklar
- Esik altina dusen urunler
- Depo bazli gorunum
- Satin alma aksiyonlari

### Gorevler
- Gunluk operasyon gorevleri
- Acik, gecikmis, tamamlanan

### Operasyon Bildirimleri / Bildirim Merkezi
- Push ile gelen tum olaylar
- Filtre: kritik, finans, personel, sistem

### Kasa Kapanis Ozeti
- Son closure kayitlari
- Fark, terminal, onay durumu

### En Cok Satan / Dusuk Performansli Urunler
- Urun trendleri
- Kategori ve sube filtresi

### Personel Performansi
- KPI kartlari
- Hedefe ulasma
- Satis katkisi

### Hesap / Profil
- cihazlar, token oturumlari, bildirim tercihleri, profil bilgisi

## 4. Component Sistemi

### Layout Components
- `AppShell`
- `StickyBranchFilter`
- `SectionHeader`
- `BottomTabBar`

### Data Components
- `MetricCard`
- `TrendCard`
- `BranchComparisonCard`
- `AlertCard`
- `StaffStatusRow`
- `StockAlertRow`
- `TaskCard`
- `NotificationListItem`

### Action Components
- `QuickApprovalButton`
- `CampaignToggleCard`
- `BranchPickerSheet`
- `DateRangeChips`
- `EmptyStateCard`

### Feedback Components
- `OfflineBanner`
- `RealtimePulse`
- `LoadingBlock`
- `ErrorRetryCard`

## 5. State Yapisi

### Zustand Store'lar
- `authStore`: access token, refresh token, active device, 2FA durumu
- `branchStore`: secili sube, yetkili subeler, tarih filtresi
- `dashboardStore`: KPI cache, compare mode, quick filters
- `notificationStore`: unread count, channel preferences, last sync
- `networkStore`: online/offline, last refresh, websocket connected

### Query Katmani
- `useDashboardOverviewQuery`
- `useRevenueSummaryQuery`
- `useBranchComparisonQuery`
- `useActiveOrdersQuery`
- `useAttendanceSummaryQuery`
- `useCriticalStocksQuery`
- `useCampaignsQuery`
- `useCashClosuresQuery`
- `useNotificationsQuery`

### Cache Politikasi
- dashboard ozetleri: `30-60 sn`
- kritik alarmlar: `10-20 sn`
- rapor ozetleri: `60-180 sn`
- profil/bildirim tercihleri: uzun sureli cache

## 6. API Entegrasyon Plani

### Auth
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/2fa/verify`

### Branch Context
- `GET /api/v1/iam/me/branches`
- `POST /api/v1/iam/me/active-branch`

### Dashboard ve Reports
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/revenue-trend`
- `GET /api/v1/dashboard/branch-comparison`
- `GET /api/v1/reports/sales`
- `GET /api/v1/reports/finance`
- `GET /api/v1/reports/staff`

### Operations
- `GET /api/v1/pos/pending-orders`
- `GET /api/v1/attendance/shifts`
- `GET /api/v1/inventory/critical-alerts`
- `GET /api/v1/campaigns`
- `PATCH /api/v1/campaigns/:id/toggle`
- `GET /api/v1/accounting/cash-closures`
- `POST /api/v1/approvals/:id/approve`

### Notifications
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:id/read`
- `POST /api/v1/notifications/push-token`

## 7. Bildirim Sistemi Plani

### Push Kategorileri
- kritik stok
- kasa kapanis farki
- approval required
- personel gec kalma
- kampanya cakisma veya bitis
- sistem uyarisi

### In-App Notification Center
- unread badge
- grouped by date
- action CTA destekli

### Delivery Rules
- push + in-app birlikte
- kritik olaylar sessize alinamaz
- kullanici kanal bazli tercih duzenleyebilir

## 8. Guvenlik Akisi

### Auth Stratejisi
- access token kisa omurlu
- refresh token secure storage
- token yenileme arka planda
- expiry durumunda silent refresh

### Device Security
- cihaz kaydi
- oturum listeleme
- supheli cihaz cikisi

### API Guvenligi
- branch scope her requestte header veya token claim ile
- role bazli feature gizleme
- app lock / biometric opsiyonu

## 9. Ornek Ekran Kodlari

### Ornekler
- dashboard screen
- branch picker
- alert summary card
- quick approval panel

Bu ekranlar `apps/mobile-manager/app` ve `apps/mobile-manager/components` altinda orneklenir.

## 10. Performans Optimizasyonlari

### UI
- FlatList / SectionList kullanimi
- chartlar lazy mount
- agir ekranlarda segmentli fetch

### Data
- React Query stale time
- optimistic approval mutations
- websocket event ile ince-grain invalidation

### Network
- offline indicator
- reconnect backoff
- push token ve refresh token retry

### UX
- tek elle kullanima uygun thumb zone placement
- primary aksiyonlar ekran altina yakin
- kritik badge ve alarm renkleri net ama boğucu degil
