# 02 Database Schema

## Domain Gruplari
- Tenant ve kimlik: `Company`, `Branch`, `User`, `Role`, `Permission`, `UserRole`, `Device`
- POS ve menu: `MenuCategory`, `MenuProduct`, `ProductVariant`, `DiningTable`, `Ticket`, `TicketItem`, `Payment`, `Campaign`
- Personel: `EmployeeProfile`, `Shift`, `BreakRecord`, `AttendanceQrToken`, `AttendanceEvent`, `Goal`, `Task`
- Finans: `VatRate`, `Account`, `LedgerEntry`, `Invoice`, `InvoiceItem`, `CashClosure`, `Expense`, `PayrollPayment`
- Stok: `Warehouse`, `InventoryItem`, `StockEntry`, `StockTransfer`, `WasteRecord`, `Recipe`, `StockAlert`
- SaaS: `SubscriptionPlan`, `Subscription`, `UsageLimit`, `BillingRecord`
- Sistem: `AuditLog`, `ApiLog`, `ExportJob`, `Notification`, `FileAsset`, `IntegrationProvider`, `IntegrationCredential`

## Kritik Iliskiler
- Bir `Company` birden fazla `Branch`, `User`, `Role`, `Customer`, `Supplier` kaydina sahiptir.
- Bir `Branch` kendi menusu, masalari, personeli, terminali, yazicisi ve stok alanlarina sahiptir.
- `Ticket` kayitlari `Customer`, `DiningTable`, `TicketItem` ve `Payment` ile iliskilidir.
- `Recipe`, satilan menu urunlerinin stok dusum mantigini `InventoryItem` bazinda tanimlar.
- `Subscription`, sirketin plan, limit ve faturalandirma durumunu yonetir.

## Index ve Izolasyon
- Tum liste ekranlarinda `companyId`, `branchId`, `status`, `date` kombinasyonlari indekslidir.
- Unique key'ler sube baglaminda tanimlanir: `table code`, `warehouse code`, `terminal code`.
- Rapor ve export akislari icin tarih bazli indeksler ayri tutulur.
