# 09 Backend Module Structure

## Moduller
- `auth`: login, refresh, logout, 2FA
- `iam`: kullanici, rol, permission, cihaz, oturum
- `dashboard`: KPI, trend, compare, activity feed
- `menu`: kategori, urun, varyant, modifier, fiyat
- `campaigns`: kampanya, conflict resolver, scheduler
- `tables`: alan, masa, durum, birlestirme, tasima
- `pos`: ticket, item, payment, split, merge, note
- `customers`: musteri, adres, sadakat, puan
- `staff`: personel, hedef, gorev, bildirim
- `attendance`: QR token, mesai, mola, onay
- `accounting`: hesaplar, ledger, invoice, KDV, closure
- `inventory`: depo, stok, transfer, atik, recete
- `reports`: satis, urun, stok, finans, personel raporlari
- `integrations`: cihaz, odeme, e-fatura, provider adapter
- `subscriptions`: plan, limit, billing, usage tracking
- `audit`: audit log ve degisiklik gecmisi
- `notifications`: bildirim dagitimi ve inbox

## Katman Standarti
- `controller`
- `service`
- `repository`
- `dto`
- `policies`
- `events`
- `jobs`
- `tests`
