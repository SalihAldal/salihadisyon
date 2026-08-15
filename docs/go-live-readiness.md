# Go-Live Readiness Raporu

Tarih: 2026-04-21

Genel durum: `Hazir degil`

Bu rapor, canliya cikis oncesi teknik kontrol listesi ve mevcut repo uzerinde yapilabilen otomatik denetimlerin sonucunu ozetler.

## Ozet

Bloker seviyesinde aciklar:

- Environment degiskenleri bos/default degerlerle calisabilir durumda.
- Migration status canli benzeri sekilde dogrulanamadi; lokal veritabani bile hazir degil.
- Health/readiness endpoint yok.
- Backup stratejisi repoda tanimli degil.
- Rollback plani veya runbook repoda tanimli degil.
- `admin-web` API base URL konfigurasyonu `/api/v1` eksik tam URL ile kolayca bozulabilir.

Pozitif taraflar:

- Monorepo `typecheck` temiz geciyor.
- Merkezi hata loglama ve exception filter aktif.
- POS odeme method string ailesi backend enum / DTO ile uyumlu.
- POS cihaz/yazici tarafinda fallback ve diagnostic mantigi mevcut.

## Otomatik Calistirilan Kontroller

### 1. Typecheck

Komut:

```bash
pnpm typecheck
```

Sonuc: `Gecti`

### 2. Test suite

Komut:

```bash
pnpm test
```

Sonuc: `Gecti`

Detay:

- API: `16/16` test gecti
- POS frontend: `6/6` test gecti

### 3. Prisma migration status

Komut:

```bash
pnpm exec prisma migrate status --schema prisma/schema.prisma
```

Calisma dizini:

```bash
apps/api
```

Sonuc: `Gecmedi`

Detay:

- `P1003: Database "adisyon" does not exist`

Yorum:

- Bu, migration zincirinin bozuk oldugunu kanitlamaz.
- Ama go-live readiness icin cok kritik bir eksik: release oncesi `migrate deploy` akisi gercek DB uzerinde test edilmemis.

## Checklist

| Baslik | Durum | Ozet |
|---|---|---|
| Environment degiskenleri | Riskli | Zorunlu degerler bos string ile gecebilir; `.env.example` var ama runtime validation zayif |
| Migration durumu | Bloker | `prisma migrate status` DB olmadigi icin dogrulanamadi; prod icin `migrate deploy` script'i yok |
| Eksik foreign key | Kismi gecti | Prisma schema ve migration taramasinda bariz FK eksigi gorulmedi; canli DB introspection yapilamadi |
| Hatali endpointler | Riskli | `admin-web` tam URL kullanirken `/api/v1` eklenmemisse endpointler 404 olur |
| Bos configler | Riskli | `pos-web` icin net `.env.example` yok; API/socket base drift riski var |
| Payment method eslesmeleri | Gecti | DTO, Prisma enum, POS fallback ve bootstrap alanlari uyumlu |
| Device baglantilari | Kismi gecti | Kod seviyesinde fallback ve diagnostics var; runtime cihaz testi yapilamadi |
| Loglama aktif mi | Gecti | Bootstrap ve HTTP exception loglari aktif |
| Backup stratejisi var mi | Bloker | Repo icinde backup/restore proseduru yok |
| Rollback plani var mi | Bloker | Repo icinde rollback runbook veya migration rollback proseduru yok |

## Detayli Bulgular

### Environment degiskenleri

Durum: `Riskli`

Bulgu:

- `packages/config/src/env.ts` icinde `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` bos string fallback ile donebiliyor.
- `apps/api/.env.example` mevcut ama secret degerler placeholder.
- `apps/admin-web/lib/api/client.ts` tam URL geldiginde bunu aynen kullaniyor; URL `/api/v1` icermiyorsa tum istekler yanlis path'e gider.

Go-live oncesi aksiyon:

- Runtime env validation ekle.
- Production secret'larin placeholder olmadigini release step'inde kontrol et.
- `NEXT_PUBLIC_API_URL` ve socket URL formatini sabitle.

### Migration durumu

Durum: `Bloker`

Bulgu:

- `apps/api/package.json` icinde prod odakli `prisma migrate deploy` script'i yok.
- CI sadece `lint`, `typecheck`, `build` calistiriyor; migration apply/check yok.
- Otomatik denetimde DB'nin bile olusmadigi goruldu.

Go-live oncesi aksiyon:

- `prisma:migrate:deploy` script'i ekle.
- CI veya staging release pipeline'ina `prisma migrate status` ve `prisma migrate deploy` adimi koy.
- Staging DB uzerinde migration dry-run yap.

### Foreign key ve veri butunlugu

Durum: `Kismi gecti`

Bulgu:

- Prisma schema relation yogun ve migration SQL'lerinde FK kullanimi var.
- Bariz "relation var ama FK yok" bulgusu yok.
- Ancak bu kontrol DB introspection ile dogrulanmadi.

Go-live oncesi aksiyon:

- Staging DB uzerinde FK ve orphan row kontrol SQL'i calistir.
- Kritik tablolar icin orphan sorgulari ekle: `Ticket`, `Payment`, `RegisterTransaction`, `PosDeviceAssignment`.

### Endpoint sagligi

Durum: `Riskli`

Bulgu:

- `apps/api/src/main.ts` icinde global prefix `api/v1`.
- Ama `apps/admin-web/lib/api/client.ts` tam URL konfigurasyonunda `/api/v1` garanti etmiyor.
- Repo icinde `/health`, `/ready`, `liveness` endpoint yok.
- `api-catalog.ts` ile gercek route'lar arasinda drift riski var.

Go-live oncesi aksiyon:

- API'ye `GET /health` ve tercihen DB ping'li `GET /ready` ekle.
- Frontend base URL format kontrolu ekle.
- Route catalog drift kontrolunu otomatiklestir.

### Bos configler

Durum: `Riskli`

Bulgu:

- `pos-web` tarafinda net bir `.env.example` yapisi yok.
- `REDIS_URL` tanimli ama backend kodunda aktif kullanim izi zayif.
- Device/payment/config ekranlari fallback destekli ama bos config durumlari release checklist'inde resmi olarak izlenmiyor.

Go-live oncesi aksiyon:

- `admin-web` ve `pos-web` icin ayrik `.env.example` hazirla.
- Kullanilmayan env'leri kaldir veya "opsiyonel" diye etiketle.
- Bos config tarama script'i ekle.

### Payment method eslesmeleri

Durum: `Gecti`

Bulgu:

- `CollectPaymentDto`, `PaymentMethod` enum ve POS payment method stringleri ayni aileyi kullaniyor.
- `catalog.paymentMethods` ile POS `paymentForm.method` uyumlu.

Go-live oncesi aksiyon:

- Seed veya smoke test ile payment method config kayitlarinin her subede aktif oldugunu kontrol et.

### Device baglantilari

Durum: `Kismi gecti`

Bulgu:

- POS admin/device servislerinde fallback ve diagnostic mantigi mevcut.
- Yazici ve terminal secimi icin uyari mekanizmasi var.
- Fakat runtime baglanti sagligi bu raporda canli olarak test edilmedi.

Go-live oncesi aksiyon:

- Staging ortaminda `/pos/connections/status` ve printer test endpoint smoke testi yap.
- Terminal / printer / pos device bazli "hazir degil" durumlarini release gate'e bagla.

### Loglama

Durum: `Gecti`

Bulgu:

- `main.ts` icinde `unhandledRejection` ve `uncaughtException` loglari var.
- `http-exception.filter.ts` request bazli hata logluyor.

Eksik taraf:

- Access log / merkezi log shipping / alerting zinciri repoda gorunmuyor.

Go-live oncesi aksiyon:

- En azindan error loglarin nereye aktigini operasyon tarafinda netlestir.
- Request log ve Sentry benzeri izleme katmani dusun.

### Backup stratejisi

Durum: `Bloker`

Bulgu:

- `infra/docker/docker-compose.yml` volume tanimliyor ama backup planini tanimlamiyor.
- Repo icinde `pg_dump`, restore, snapshot veya PITR runbook yok.

Go-live oncesi aksiyon:

- Veritabani backup frekansi, retention ve restore sorumlulugunu netlestir.
- En az bir restore denemesi yapmadan canliya cikma.

### Rollback plani

Durum: `Bloker`

Bulgu:

- Rollback proseduru veya release runbook bulunmadi.
- Migration geri donus plani dokumante degil.

Go-live oncesi aksiyon:

- Uygulama rollback, DB rollback/snapshot restore ve feature flag fallback plani yaz.
- "Kim, ne zaman, hangi komutla" net olsun.

## Canli Oncesi Minimum Tamamlanmasi Gerekenler

1. Production env validation ve secret kontrolu
2. `prisma migrate deploy` release akisi
3. Staging DB uzerinde migration + smoke test
4. `health` / `ready` endpoint
5. Backup + restore runbook
6. Rollback runbook
7. Frontend API URL format guard

## Mevcut Hukum

Su anki repo durumuna gore:

`Canliya cikis icin hazir degil`

Neden:

- Backup ve rollback plani yok
- Migration release zinciri eksik
- Health endpoint yok
- Environment validation sert degil
- API base URL kaynakli endpoint kirilma riski var
