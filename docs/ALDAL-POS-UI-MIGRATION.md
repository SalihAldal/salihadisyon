# ALDAL POS — UI Migration Tracking

Bu doküman **Aldal POS / Adisyon Admin Panel** UI dönüşümünün “tek kaynaktan takip” dosyasıdır.

## Live Tracking Summary (AUTO)

<!-- AUTO_SUMMARY_START -->

- **TOTAL DISCOVERED SCREENS**: 96
- **COMPLETED**: 0
- **IN PROGRESS**: 3
- **PENDING**: 93
- **BLOCKED**: 0

- **HIGH MATCH**: 0
- **MEDIUM MATCH**: 3
- **LOW MATCH**: 0
- **UNKNOWN MATCH**: 93

- **LEGACY UI REMAINING**: 96

<!-- AUTO_SUMMARY_END -->

> Not: “DISCOVERED SCREENS” hesabı filesystem route sayısı değil; dynamic route altındaki her gerçek slug ekranı ayrı satırdır.

## Visual QA Runner (Playwright)

- **Stage 1**: `scripts/stage1-visual-qa.spec.mjs`
- **Batch (öncelikli ekranlar)**: `scripts/panel-batch-visual-qa.spec.mjs`
- **Not**: API gerçek data ile ayağa kalkmadan (Postgres `localhost:5433`) login + data ekranları “VISUAL QA” olarak tamamlanamaz.

## Canonical UI References

- **REFERENCE 01 (Dashboard / Shell yönü)**: `ChatGPT_Image_30_Ağu_2026_23_49_23`
- **REFERENCE 02 (Design System tokens/components)**: `ChatGPT_Image_31_Ağu_2026_00_00_16`

## Kurallar (bu migration için)

- **İşlevsellik korunur**: API contract / backend / RBAC / validation / CRUD davranışları değişmez.
- **UI değişir**: layout/spacing/typography/tokens/components/states canonical sistemle hizalanır.
- **Reusable-first**: aynı problemin 20 yerde tekrarı yerine shared component/tokens güçlendirilir.
- **No fake completion**: “COMPLETED” demek; responsive + interaction states + regression smoke check yapıldı demektir.

---

## Phase 0 — Master UI Inventory (expanded)

> Kaynak (koddan çıkarıldı):
> - Catch-all slug listeleri: `apps/admin-web/lib/*-config.ts`, `apps/admin-web/lib/pos-settings-config.ts`
> - Sidebar route/hiyerarşi: `apps/admin-web/lib/navigation.ts`
> - Route manifest: `apps/admin-web/lib/route-manifest.ts`
> - Container render branch’leri: `apps/admin-web/app/**/page.tsx`

### Inventory schema (per screen)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | FUNCTIONAL SMOKE | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

### Core (non-dynamic)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | FUNCTIONAL SMOKE | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard | Dashboard | `/` | - | `DashboardScreen` | Analytics | - | - | ✅ | - | - | - | - | - | - | PASS | PASS | NOT RUN | MEDIUM | IN PROGRESS |
| Auth | Login | `/login` | - | `apps/admin-web/app/login/page.tsx` | Form | - | ✅ | - | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Business | İşletme | `/isletme` | - | `CompaniesScreen` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Business | Şubeler | `/subeler` | - | `BranchesScreen` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Revenue | Ciro (Genel) | `/ciro` | - | `RevenueOverviewScreen` | Analytics | ✅ | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Revenue | Ciro (Şube) | `/ciro/sube-bazli` | - | `BranchRevenueScreen` | Analytics | ✅ | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Monitoring | Monitoring | `/monitoring` | - | `MonitoringScreen` | Ops | ✅ | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Security | Audit Log | `/audit` | - | `AuditLogScreen` | Data mgmt | ✅ | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Attendance | Mesai / Mola QR | `/mesai-qr` | - | `AttendanceQrScreen` | Ops | ✅ | ✅ | ✅ | - | - | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Platform | Abonelik | `/abonelik` | - | `SubscriptionScreen` | Settings | - | ✅ | - | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Platform | Destek | `/destek` | - | `SupportScreen` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Platform | Ürün Puanları | `/urun-puanlari` | - | `ProductRatingsScreen` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Platform | Satış Ekranına Git | `/satis-ekranina-git` | - | `GoPosLinkScreen` | CTA | - | - | - | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Garson Logları | `/personel/garson-loglari` | - | `WaiterActivityScreen` | Ops | ✅ | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Kategori Ciro | `/raporlar/kategori-ciro` | - | `CategoryRevenueScreen` | Analytics | ✅ | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | İptal Listesi | `/raporlar/iptal-listesi` | - | `CancelListScreen` | Data mgmt | ✅ | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |

### POS Ayarları (catch-all container + expanded slugs)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | FUNCTIONAL SMOKE | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POS Settings | Container | `/pos-ayarlari` | (none) | `PosSettingsScreen` (module grid) | Hub | - | - | - | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Menü Yönetimi | `/pos-ayarlari/menu` | menu | `PosSettingsScreen` → `resource=menu-management` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Ürünler | `/pos-ayarlari/urunler` | urunler | `PosSettingsScreen` → `resource=menu-products` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | PASS | PASS | NOT RUN | MEDIUM | IN PROGRESS |
| POS Settings | Kategoriler | `/pos-ayarlari/kategoriler` | kategoriler | `PosSettingsScreen` → `resource=menu-categories` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | PASS | PASS | NOT RUN | MEDIUM | IN PROGRESS |
| POS Settings | Kampanyalar | `/pos-ayarlari/kampanyalar` | kampanyalar | `PosSettingsScreen` → `resource=campaigns` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Happy Hour | `/pos-ayarlari/happy-hour` | happy-hour | `PosSettingsScreen` → `resource=happy-hour` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Süreli İndirimler | `/pos-ayarlari/sureli-indirimler` | sureli-indirimler | `PosSettingsScreen` → `resource=timed-discounts` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | QR Menü | `/pos-ayarlari/qr-menu` | qr-menu | `PosSettingsScreen` → `resource=qr-menu` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Bölümler / Masalar | `/pos-ayarlari/masalar` | masalar | `PosSettingsScreen` → `resource=table-sections` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Paket Servis Adresleri | `/pos-ayarlari/paket-servis-adresleri` | paket-servis-adresleri | `PosSettingsScreen` → `resource=delivery-addresses` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Müşteriler | `/pos-ayarlari/musteriler` | musteriler | `PosSettingsScreen` → `resource=customers` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Opsiyonel Ürünler | `/pos-ayarlari/opsiyonel-urunler` | opsiyonel-urunler | `PosSettingsScreen` → `resource=optional-products` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Zorunlu Seçim Grupları | `/pos-ayarlari/zorunlu-secim-gruplari` | zorunlu-secim-gruplari | `PosSettingsScreen` → `resource=required-choice-groups` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Ödeme Yöntemleri | `/pos-ayarlari/odeme-yontemleri` | odeme-yontemleri | `PosSettingsScreen` → `resource=payment-methods` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Tanımlı Cihazlar | `/pos-ayarlari/tanimli-cihazlar` | tanimli-cihazlar | `PosSettingsScreen` → `resource=defined-devices` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Terminaller | `/pos-ayarlari/terminaller` | terminaller | `PosSettingsScreen` → `resource=terminals` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Yazıcılar | `/pos-ayarlari/yazicilar` | yazicilar | `PosSettingsScreen` → `resource=printers` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Fiş Entegrasyonları | `/pos-ayarlari/fis-entegrasyonlari` | fis-entegrasyonlari | `PosSettingsPage` special-case → `PrintIntegrationsScreen` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Arka Ekran Slider | `/pos-ayarlari/arka-ekran-slider` | arka-ekran-slider | `PosSettingsScreen` → `resource=back-screen-slider` | Content | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Masa Renkleri | `/pos-ayarlari/masa-renkleri` | masa-renkleri | `PosSettingsScreen` → `resource=table-colors` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | İndirim Türleri | `/pos-ayarlari/indirim-turleri` | indirim-turleri | `PosSettingsScreen` → `resource=discount-types` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Ön Tanımlı Notlar | `/pos-ayarlari/on-tanimli-notlar` | on-tanimli-notlar | `PosSettingsScreen` → `resource=preset-notes` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| POS Settings | Ayarlar | `/pos-ayarlari/ayarlar` | ayarlar | `PosSettingsScreen` → `resource=settings` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| System | Yedekleme | `/pos-ayarlari/yedekleme` | yedekleme | `PosSettingsPage` special-case → `BackupScreen` | Ops | ✅ | ✅ | - | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| System | Feature Flags | `/pos-ayarlari/feature-flags` | feature-flags | `PosSettingsPage` special-case → `FeatureFlagsScreen` | Settings | - | ✅ | - | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |

### Personel (catch-all container + expanded slugs)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | FUNCTIONAL SMOKE | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Staff | Container | `/personel` | (none) | `StaffScreen` (module grid) | Hub | - | - | - | - | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Yönetici & Personel | `/personel/yonetici-ve-personel` | yonetici-ve-personel | `StaffScreen` → `resource=team` + `EmployeeEditModal` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Hedefler | `/personel/hedefler` | hedefler | `StaffScreen` → `resource=goals` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Görev & To-Do | `/personel/gorev-ve-todo` | gorev-ve-todo | `StaffScreen` → `resource=tasks` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Personel Bildirimleri | `/personel/personel-bildirimleri` | personel-bildirimleri | `StaffScreen` → `resource=notifications` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Maaş Yönetimi | `/personel/maas-yonetimi` | maas-yonetimi | `StaffScreen` → `resource=payroll` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Mesai Yönetimi | `/personel/mesai-yonetimi` | mesai-yonetimi | `StaffScreen` → `resource=shifts` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Mola Süreleri | `/personel/mola-sureleri` | mola-sureleri | `StaffScreen` → `resource=breaks` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Personel Takip | `/personel/personel-takip` | personel-takip | `StaffScreen` → `resource=tracking` | Ops | ✅ | - | ✅ | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Personel Rolleri | `/personel/personel-rolleri` | personel-rolleri | `StaffScreen` special-case → `IamRolesScreen` | IAM | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Operasyon Devamlı Sorular | `/personel/operasyon-devamli-sorular` | operasyon-devamli-sorular | `StaffScreen` → `resource=audit-questions` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Operasyon Devamlı Anketi | `/personel/operasyon-devamli-anketi` | operasyon-devamli-anketi | `StaffScreen` → `resource=audit-survey` | Ops | ✅ | - | ✅ | - | - | - | - | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Staff | Personel İndirimleri | `/personel/personel-indirimleri` | personel-indirimleri | `StaffScreen` → `resource=staff-discounts` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | UNKNOWN | PENDING |

### Muhasebe (catch-all container + expanded slugs)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Accounting | Container | `/muhasebe` | (none) | `AccountingScreen` (module grid) | Hub | - | - | - | - | - | - | - | - | - | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Hesaplar | `/muhasebe/hesaplar` | hesaplar | `AccountingScreen` → `resource=accounts` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Adisyon Listesi | `/muhasebe/adisyon-listesi` | adisyon-listesi | `AccountingScreen` → `resource=ticket-ledger` | Data mgmt | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Satılan Ürünler | `/muhasebe/satilan-urunler` | satilan-urunler | `AccountingScreen` → `resource=sold-products` | Data mgmt | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Ödemeler | `/muhasebe/odemeler` | odemeler | `AccountingScreen` → `resource=payments` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Ürün KDV Oranları | `/muhasebe/urun-kdv-oranlari` | urun-kdv-oranlari | `AccountingScreen` → `resource=vat-rates` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Tedarikçiler | `/muhasebe/tedarikciler` | tedarikciler | `AccountingScreen` → `resource=suppliers` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Tedarikçi KDV Raporları | `/muhasebe/tedarikci-kdv-raporlari` | tedarikci-kdv-raporlari | `AccountingScreen` → `resource=supplier-vat` | Reports | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Müşteri İşletmeler | `/muhasebe/musteri-isletmeler` | musteri-isletmeler | `AccountingScreen` → `resource=business-customers` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Müşteri KDV Raporları | `/muhasebe/musteri-kdv-raporlari` | musteri-kdv-raporlari | `AccountingScreen` → `resource=customer-vat` | Reports | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Faturalar | `/muhasebe/faturalar` | faturalar | `AccountingScreen` → `resource=invoices` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Fatura Kalemleri | `/muhasebe/fatura-kalemleri` | fatura-kalemleri | `AccountingScreen` → `resource=invoice-items` | Data mgmt | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Birim Maliyetler | `/muhasebe/birim-maliyetler` | birim-maliyetler | `AccountingScreen` → `resource=unit-costs` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Kasa Kapanışları | `/muhasebe/kasa-kapanislari` | kasa-kapanislari | `AccountingScreen` → `resource=cash-closures` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Sabit Maliyetler | `/muhasebe/sabit-maliyetler` | sabit-maliyetler | `AccountingScreen` → `resource=fixed-costs` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Personel Ödemeleri | `/muhasebe/personel-odemeleri` | personel-odemeleri | `AccountingScreen` → `resource=payroll` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Accounting | Diğer Ödemeler | `/muhasebe/diger-odemeler` | diger-odemeler | `AccountingScreen` → `resource=other-payments` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |

### Stok (catch-all container + expanded slugs)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Inventory | Container | `/stok` | (none) | `InventoryScreen` (module grid + overview) | Hub | ✅ | - | - | - | - | - | - | - | - | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Depolar | `/stok/depolar` | depolar | `InventoryScreen` → `resource=warehouses` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Depo Transfer | `/stok/depo-transfer` | depo-transfer | `InventoryScreen` → `resource=stock-transfer` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Stok Birimleri | `/stok/stok-birimleri` | stok-birimleri | `InventoryScreen` → `resource=inventory-units` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Stoklu Ürün Kategorileri | `/stok/stoklu-urun-kategorileri` | stoklu-urun-kategorileri | `InventoryScreen` → `resource=inventory-categories` | Settings | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Stoklu Ürünler | `/stok/stoklu-urunler` | stoklu-urunler | `InventoryScreen` → `resource=inventory-items` | Data mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Stok Girişi | `/stok/stok-girisi` | stok-girisi | `InventoryScreen` → `resource=stock-entry` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Stok Durumu | `/stok/stok-durumu` | stok-durumu | `InventoryScreen` → `resource=stock-status` | Ops | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Stok Kartları | `/stok/stok-kartlari` | stok-kartlari | `InventoryScreen` → `resource=stock-cards` | Ops | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Inventory | Atık Ürünler | `/stok/atik-urunler` | atik-urunler | `InventoryScreen` → `resource=waste-products` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |

### Raporlar (catch-all container + expanded slugs)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Reports | Container | `/raporlar` | (none) | `ReportScreen` (report catalog) | Hub | - | - | ✅ | - | - | - | - | - | - | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Satış Raporları | `/raporlar/satis-raporlari` | satis-raporlari | `ReportScreen` → `report=sales-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Ödeme Tipi Raporları | `/raporlar/odeme-tipi-raporlari` | odeme-tipi-raporlari | `ReportScreen` → `report=payment-method-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Gider Raporları | `/raporlar/gider-raporlari` | gider-raporlari | `ReportScreen` → `report=expense-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Kasa Kapanış Raporları | `/raporlar/kasa-kapanis-raporlari` | kasa-kapanis-raporlari | `ReportScreen` → `report=cash-closure-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | İndirim Raporları | `/raporlar/indirim-raporlari` | indirim-raporlari | `ReportScreen` → `report=discount-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Ürün Raporları | `/raporlar/urun-raporlari` | urun-raporlari | `ReportScreen` → `report=product-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Maliyet & Karlılık | `/raporlar/maliyet-karlilik-raporlari` | maliyet-karlilik-raporlari | `ReportScreen` → `report=profitability-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Stok Raporları | `/raporlar/stok-raporlari` | stok-raporlari | `ReportScreen` → `report=stock-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Hammadde Tüketim | `/raporlar/hammadde-tuketim-raporlari` | hammadde-tuketim-raporlari | `ReportScreen` → `report=consumption-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Finans Raporları | `/raporlar/finans-raporlari` | finans-raporlari | `ReportScreen` → `report=finance-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Çalışan Raporları | `/raporlar/calisan-raporlari` | calisan-raporlari | `ReportScreen` → `report=employee-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Mesai Raporları | `/raporlar/mesai-raporlari` | mesai-raporlari | `ReportScreen` → `report=shift-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |
| Reports | Hedef & Prim Raporları | `/raporlar/hedef-ve-prim-raporlari` | hedef-ve-prim-raporlari | `ReportScreen` → `report=goal-bonus-reports` | Analytics | ✅ | - | ✅ | - | - | - | - | - | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |

### Entegrasyonlar (catch-all container + expanded child)

| MODULE | PAGE | ROUTE | SLUG | COMPONENT / RENDER BRANCH | PAGE TYPE | TABLE | FORM | FILTER | MODAL | DIALOG | DRAWER | CREATE | EDIT | DETAIL | RESPONSIVE | VISUAL QA | REFERENCE MATCH | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Integrations | Container | `/entegrasyonlar` | (none) | `IntegrationsScreen` | Ops | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | NOT RUN | NOT RUN | UNKNOWN | PENDING |

---

## Phase Tracking

### Phase 1 — Design Foundation
- [x] Token sistemi normalize edildi (colors/neutral/surface/semantic)
- [x] Typography (Inter) standardize edildi
- [ ] Spacing (8px grid) standardize edildi
- [x] Radius standardize edildi
- [x] Shadow standardize edildi

### Phase 2 — Global Application Shell
- [x] Sidebar canonical
- [x] Topbar canonical
- [x] Page padding/max width canonical
- [x] Mobile navigation (drawer/collapse) canonical

### Phase 3 — POS Settings Navigation Architecture
- [ ] Primary/secondary nav ayrımı
- [ ] Overflow / grouping

### Phase 4 — Shared Component Library
- **Primitive implemented (code mevcut)**:
  - [ ] Button family
  - [ ] Input family
  - [x] DataTable primitives (`AdminTableCard`, `AdminTableWrap`, `AdminRowActionMenu`)
  - [x] Pagination primitive (`AdminPagination`)
  - [x] Empty / Loading / Error primitives (`AdminEmptyState`, `AdminLoadingState`, `AdminErrorState`)
  - [x] Modal/ConfirmDialog (`AdminModal`, `AdminConfirmDialog`)

- **Full-panel rollout (96 screen’e uygulanmış)**:
  - [ ] Button family rollout complete
  - [ ] Input family rollout complete
  - [ ] DataTable family rollout complete
  - [ ] Pagination rollout complete
  - [ ] Empty/Loading/Error rollout complete

#### Canonical UI Primitives (live)

- `AdminModal` + `AdminConfirmDialog`: canonical modal anatomy (header + optional subheader + scroll body + sticky footer)
- `AdminRowActionMenu`: canonical row action menu (three-dot + real menu)
- `AdminSwitchField`: canonical boolean UX
- `AdminTableCard` + `AdminTableWrap`: canonical table surface + overflow

### Phase 10 — Page-by-page (status)

> Her sayfa COMPLETED olmadan diğerine geçilmez.

- [ ] Dashboard
- [ ] Login
- [ ] İşletme
- [ ] Şubeler
- [ ] Ciro
- [ ] POS Ayarları (landing + nav + core screens)
- [ ] Fiş Entegrasyonları
- [ ] Personel
- [ ] Mesai QR
- [ ] Monitoring
- [ ] Muhasebe
- [ ] Stok
- [ ] Raporlar
- [ ] Audit
- [ ] Abonelik
- [ ] Destek
- [ ] Personel İndirimleri
- [ ] Ürün Puanları
- [ ] Satış Ekranına Git

