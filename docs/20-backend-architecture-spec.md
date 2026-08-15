# 20 Backend Architecture Spec

## 1. Moduler Backend Mimarisi

### Core Katmanlar
- `auth`: login, refresh, logout, device session, 2FA
- `iam`: users, roles, permissions, staff roles
- `tenancy`: companies, branches, subscription scope, feature flags
- `observability`: audit log, api log, metrics, request context
- `realtime`: websocket gateway, event publishing, room strategy
- `jobs`: queue processors, cron orchestrators, retry policies

### Domain Katmanlari
- `dashboard`, `revenue`
- `menu-management`, `categories`, `products`, `product-variants`
- `optional-products`, `required-choice-groups`
- `discounts`, `campaigns`, `happy-hour`, `qr-menu`
- `floor-sections`, `tables`, `tickets/orders`, `payments`, `sold-products`
- `customers`, `delivery-addresses`
- `devices`, `terminals`, `printers`, `predefined-notes`, `settings`
- `staff-management`, `shifts`, `breaks`, `shift-qr`, `attendance`, `goals`, `notifications`, `staff-tracking`, `tasks`, `audit-surveys`
- `accounting`, `accounts`, `vat-rates`, `suppliers`, `supplier-vat-reports`, `customer-businesses`, `customer-vat-reports`, `invoices`, `invoice-items`, `unit-costs`, `cash-closures`, `fixed-costs`, `payroll`, `other-payments`
- `inventory`, `warehouses`, `warehouse-transfers`, `stock-units`, `stock-categories`, `stock-products`, `stock-in`, `stock-status`, `stock-cards`, `waste-products`
- `reports`, `integrations`, `subscription`, `product-ratings`, `staff-discounts`, `support`

### Teknik Standart
- Controller ince, service kalin, query/repository ayrimi net
- DTO ve validation zorunlu
- Her modulde policy ve audit noktasi tanimli
- Kritik mutasyonlar transaction + idempotency ile korunur

## 2. Prisma Schema Taslagi

Ana schema dosyasi: `apps/api/prisma/schema.prisma`

### Tenant ve Access
- `Company`
- `Branch`
- `User`
- `Role`
- `Permission`
- `UserRole`
- `Device`

### POS ve Operasyon
- `Terminal`
- `Printer`
- `TableArea`
- `DiningTable`
- `Ticket`
- `TicketItem`
- `TicketEvent`
- `TicketNote`
- `TicketDiscount`
- `TicketSplit`
- `Payment`
- `PendingOrder`
- `RefundRequest`
- `ApprovalRequest`
- `DrawerEvent`
- `PrinterJob`
- `TableSession`

### Menu
- `MenuCategory`
- `MenuProduct`
- `ProductVariant`
- `ProductBranchPrice`
- `ModifierGroup`
- `ModifierOption`
- `RequiredChoiceGroup`
- `RequiredChoiceOption`
- `Campaign`
- `VatRate`

### Customer
- `Customer`
- `CustomerAddress`
- `CustomerVatReport`

### Staff
- `EmployeeProfile`
- `Shift`
- `BreakRecord`
- `AttendanceQrToken`
- `AttendanceEvent`
- `Goal`
- `Task`

### Accounting
- `Account`
- `LedgerEntry`
- `Supplier`
- `SupplierVatReport`
- `Invoice`
- `InvoiceItem`
- `UnitCost`
- `CashClosure`
- `Expense`
- `PayrollPayment`
- `OtherPayment`

### Inventory
- `Warehouse`
- `InventoryUnit`
- `InventoryCategory`
- `InventoryItem`
- `StockEntry`
- `StockTransfer`
- `WasteRecord`
- `Recipe`
- `RecipeItem`
- `StockAlert`

### SaaS ve Sistem
- `SubscriptionPlan`
- `Subscription`
- `UsageLimit`
- `BillingRecord`
- `AuditLog`
- `ApiLog`
- `ExportJob`
- `Notification`
- `FileAsset`
- `IntegrationProvider`
- `IntegrationCredential`

## 3. Entity Iliskileri

### Tenant Iliskileri
- Bir `Company`, birden fazla `Branch`, `User`, `Role`, `Customer`, `Supplier` ve tek `Subscription` kaydina sahiptir.
- Bir `Branch`; POS, inventory, accounting ve staff operasyonlarinin temel scope alanidir.

### POS Iliskileri
- `DiningTable` -> aktif `Ticket` baglar.
- `Ticket` -> `TicketItem`, `Payment`, `TicketEvent`, `TicketNote`, `TicketDiscount` iliskileri tasir.
- `PendingOrder`, QR veya delivery kaynakli siparisleri aktif `Ticket`'e donusturur.
- `ApprovalRequest`, indirim override, refund, void, merge ve drawer open gibi islemleri denetler.

### Inventory ve Accounting Kopruleri
- `Recipe`, satilan `MenuProduct` ile `InventoryItem` arasinda tuketim baglantisi kurar.
- `Payment`, `LedgerEntry` ve `CashClosure` ile finansal zinciri besler.
- `UnitCost`, `InvoiceItem` ve `Recipe` birlikte urun karlilik hesaplarini olusturur.

## 4. DTO Yapilari

### Temel Desen
- `query dto`: filtre, pagination, sorting, export
- `command dto`: create/update/mutation operasyonlari
- `response dto`: controller disina cikarken normalize payload

### Kritik DTO Gruplari
- Auth: `LoginDto`, `RefreshTokenDto`, `VerifyTwoFactorDto`
- User/IAM: `CreateUserDto`, `UpdateRoleDto`, `AssignBranchRoleDto`
- POS: `CreateTicketDto`, `AddTicketItemDto`, `CollectPaymentDto`, `TransferTicketDto`, `RefundTicketDto`
- Inventory: `CreateStockEntryDto`, `TransferStockDto`, `CreateWasteRecordDto`
- Accounting: `CreateInvoiceDto`, `CreateCashClosureDto`, `CreateLedgerEntryDto`
- Attendance: `GenerateShiftQrDto`, `ScanShiftQrDto`, `ApproveAttendanceDto`

### Query DTO Standardi
- `page`, `limit`
- `sortBy`, `sortOrder`
- `search`
- `branchId`
- `dateFrom`, `dateTo`
- modüle özel filtreler

## 5. Guards / Interceptors / Filters

### Guards
- `TenantScopeGuard`: her request'te tenant ve branch scope baglamini kurar
- `PermissionsGuard`: handler uzerindeki permission metadata'yi denetler
- ilerde eklenecek: `JwtAccessGuard`, `FeatureFlagGuard`, `BranchAccessGuard`

### Interceptors
- `RequestContextInterceptor`: request id ve idempotency key olusturur
- `AuditInterceptor`: duration ve audit meta biriktirir
- `IdempotencyInterceptor`: POST/PATCH mutasyonlarinda replay korumasi saglar

### Filters
- `HttpExceptionFilter`: merkezi hata cikisi, request id ve path ile standart response dondurur

## 6. RBAC Mimarisi

### Rol Seviyeleri
- `super_admin`
- `tenant_owner`
- `branch_manager`
- `cashier`
- `waiter`
- `kitchen`
- `accounting`
- `hr`
- `auditor`

### RBAC Karari
- Route seviyesinde coarse-grained permission
- Service/query seviyesinde scope ve data ownership enforcement
- Branch bazli rol atamasi `UserRole.branchId` ile saglanir

### Kritik Yetki Alanlari
- `payment.manage`
- `ticket.refund`
- `discount.override`
- `cash_closure.manage`
- `attendance.approve`
- `inventory.transfer`

## 7. Tenant Isolation Stratejisi

### Shared Schema + Strong Scope
- Tum business tablolarinda `companyId`
- Operasyonel tablolarda `branchId`
- Her query default olarak tenant filter ile calisir

### Savunma Katmanlari
1. Guard seviyesinde tenant context
2. Service seviyesinde allowed branch kontrolu
3. Prisma query helper ile zorunlu scope
4. Audit log ile cross-tenant anomali takibi

### Index Stratejisi
- `companyId + branchId + status`
- `companyId + createdAt`
- `branchId + date`
- unique alanlar sube veya tenant bazinda tanimlanir

## 8. Endpoint Listesi

Detay katalog dosyalari:
- `apps/api/src/contracts/api-catalog.ts`
- `apps/api/src/contracts/pos-contracts.ts`

### Kritik Gruplar
- Auth: `/auth/*`
- IAM: `/iam/users`, `/iam/roles`
- POS: `/pos/catalog`, `/pos/tickets`, `/pos/payments`, `/pos/approvals`
- Menu: `/menu/categories`, `/menu/products`
- Attendance: `/attendance/qr/generate`, `/attendance/qr/scan`
- Accounting: `/accounting/ledger`, `/accounting/invoices`, `/accounting/cash-closures`
- Inventory: `/inventory/items`, `/inventory/stock-entries`, `/inventory/transfers`
- Reports: `/reports/sales`, `/reports/finance`, `/reports/staff`
- Audit: `/audit/logs`
- Subscription: `/subscriptions/current`

## 9. Websocket Eventleri

Kaynak dosya: `apps/api/src/contracts/realtime-events.ts`

### Core Eventler
- `table.status.changed`
- `ticket.updated`
- `ticket.locked`
- `ticket.item.cancelled`
- `pending-order.created`
- `pending-order.accepted`
- `payment.processing`
- `payment.completed`
- `refund.requested`
- `approval.required`
- `kitchen.status.changed`
- `terminal.heartbeat`
- `sync.conflict`

### Oda Stratejisi
- `tenant:{companyId}`
- `branch:{branchId}`
- `ticket:{ticketId}`
- `terminal:{terminalId}`
- `user:{userId}`

## 10. Queue Job Listesi

### Queue'lar
- `pos`
- `payments`
- `inventory`
- `reports`
- `notifications`
- `integrations`
- `attendance`
- `exports`

### Joblar
- printer dispatch
- payment settlement callback processing
- refund settlement processing
- recipe-based stock deduction
- report export generation
- shift QR rotation
- cash closure reminder
- integration sync retry

## 11. Cron Job Listesi

### Dakikalik
- campaign scheduler
- terminal heartbeat stale check
- pending order SLA monitor

### Saatlik
- stock reconciliation
- stale approval cleanup
- failed printer job retry

### Gunluk
- branch revenue snapshot
- cash closure anomaly detection
- attendance lateness summary
- subscription usage recalculation

### Aylik
- VAT report pre-aggregation
- billing record generation

## 12. Audit Log Yaklasimi

### Zorunlu Audit Olaylari
- login / logout / refresh
- role/permission degisimi
- ticket create/update/void/refund/split/merge/transfer
- payment start/complete/fail/refund
- stock transfer / waste record / cost update
- invoice create/update/cancel
- cash closure create/approve
- export create/download
- device/terminal binding

### Audit Payload
- actor
- tenant / branch
- entity type / entity id
- before / after snapshot
- reason
- request id
- ip + user agent

## 13. Odeme Transaction Guvenligi

### Guvenlik Kurallari
- her odeme bir transaction icinde acilir
- idempotency key olmadan kritik POST odeme islemi kabul edilmez
- amount validation ve overpayment guard uygulanir
- provider callback'leri duplicate-safe islenir
- payment state machine: `PENDING -> AUTHORIZED -> COMPLETED | FAILED | REFUNDED`

### Transaction Zinciri
1. payment row create
2. ticket payment total hesapla
3. ticket status update
4. ticket event create
5. ledger/payout event publish
6. audit log write

## 14. Stok Dusum Mantigi

### Kaynak
- Sadece `paid` veya policy'e gore `preparing` ticket'lar stok dusurur
- `Recipe` tablosu tuketim map'ini verir

### Akis
1. ticket item listesi okunur
2. her urun icin recipe bulunur
3. inventory hareketleri `StockEntry` olarak yazilir
4. mevcut stok guncellenir
5. threshold asildiysa `StockAlert` acilir
6. atik/iade durumunda ters hareket uygulanir

### Kurallar
- fractional quantity desteklenir
- sube ve depo baglantisi zorunludur
- stok hareketleri immutable tutulur

## 15. Kampanya Kural Motoru

### Girdi Parametreleri
- channel
- branch
- order time
- cart lines
- quantity
- customer segment
- payment method

### Rule Engine Asamalari
1. eligible campaign filtrele
2. time-window kontrolu
3. branch/channel kontrolu
4. precedence puani hesapla
5. stackability ve conflict kurallari uygula
6. line-level ve cart-level sonucu birlestir

### Precedence
- zorunlu manuel override
- system priority
- most specific scope
- max discount policy

## 16. Kasa Kapanis Mantigi

### Inputlar
- beklenen nakit
- sayilan nakit
- terminal breakdown
- kasiyer notu
- supervisor onayi

### Akis
1. vardiya ve terminal kontrolu
2. odeme toplamlarini hesapla
3. beklenen/sayilan farki bul
4. variance threshold asilirsa approval request ac
5. closure kaydi ve ledger entry yaz
6. audit ve notification olustur

## 17. QR Guvenligi

### Shift QR
- signed payload
- short expiry
- branch bound token
- replay korumasi
- tek kullanim veya kisa TTL

### QR Menu / QR Order
- masa bagli token
- rate limit
- source fingerprint
- duplicate order guard

## 18. Ornek NestJS Modul ve Controller / Service Kodlari

### Mevcut Ornekler
- `apps/api/src/modules/pos/pos.controller.ts`
- `apps/api/src/modules/pos/pos.service.ts`
- `apps/api/src/modules/pos/dto/*.ts`
- `apps/api/src/modules/pos/pos.gateway.ts`
- `apps/api/src/common/guards/*.ts`
- `apps/api/src/common/interceptors/*.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`

### Ornek Akis
- `createTicket`: branch scope resolve + audit + event publish
- `addItem`: product lookup + transaction + totals recompute
- `collectPayment`: split payment + status transition + realtime publish

## 19. Test Stratejisi

### Unit Test
- guard, policy, discount engine, campaign engine
- payment calculator
- stock deduction calculator
- cash closure validator

### Integration Test
- auth + refresh
- tenant isolation
- pos create/add/pay flow
- refund + approval flow
- stock movement + alert creation

### E2E Test
- branch user ticket create
- split payment
- shift QR scan
- cash closure with variance

### Non-functional
- load test for POS peak hours
- websocket fanout test
- retry/idempotency test

## 20. Deployment Plani

### Runtime
- `apps/api` container
- PostgreSQL
- Redis
- reverse proxy
- S3 compatible object storage

### Environments
- local
- staging
- production

### Pipeline
1. lint
2. unit/integration test
3. prisma validate
4. build
5. docker image publish
6. migration deploy
7. health check rollout

### Gozlemleme
- request-id loglama
- error filter output
- audit table
- metrics endpoint
- queue health

### Production Notlari
- read replica opsiyonu
- Redis HA opsiyonu
- background workers ayri deployment
- websocket gateway yatay olcek icin Redis adapter ile genisletilmeli
