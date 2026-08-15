# Deployment Disiplini

Bu proje icin amac, her deploy'u kontrollu, geri alinabilir ve staging uzerinden dogrulanabilir hale getirmektir.

## 1. API Versioning

- Aktif API versiyonu: `API_CURRENT_VERSION`
- Desteklenen versiyonlar: `API_SUPPORTED_VERSIONS`
- Ornek:
  - `API_CURRENT_VERSION=v1`
  - `API_SUPPORTED_VERSIONS=v1,v2`

Sistem su anda `api/v1` ile calisir ve `api/v2` cagrilari desteklenen versiyonlar icindeyse compatibility mode ile aktif route setine yonlenir.

Not:
- Bu yapi routing omurgasini hazirlar.
- Gercek `v2` farkli davranis istediginde controller/service seviyesinde yeni surum implementasyonu eklenmelidir.

## 2. Deploy Oncesi Preflight

Deploy oncesi zorunlu komut:

```bash
pnpm deploy:preflight
```

Bu komut su kontrolleri yapar:

1. Son migration destructive SQL paterni tasiyor mu
2. Prisma migration status temiz mi
3. Prisma client generate ediliyor mu
4. Typecheck geciyor mu
5. Build geciyor mu

## 3. Migration Kontrolu

Yardimci komutlar:

```bash
pnpm deploy:migrate:status
pnpm deploy:migrate:audit
```

`deploy:migrate:audit`, varsayilan olarak son migration klasorunu kontrol eder. Gerekirse belirli migration icin:

```bash
MIGRATION_DIR=20260421090000_system_monitoring pnpm deploy:migrate:audit
```

## 4. Staging Ortami

Staging icin:

1. `.env.staging.example` dosyasini `.env.staging` olarak kopyala
2. staging secret ve URL bilgilerini doldur
3. ortami ayaga kaldir:

```bash
pnpm deploy:staging:up
```

Log takibi:

```bash
pnpm deploy:staging:logs
```

Ortami kapat:

```bash
pnpm deploy:staging:down
```

## 5. Rollback Plani

Rollback iki seviyeli dusunulmeli:

### A. Uygulama rollback

- Son stabil release/tag'e don
- API / admin / pos container veya process'lerini bir onceki build ile tekrar ayağa kaldir

### B. Veri rollback

Migration geri almak yerine su yol izlenmeli:

1. Deploy oncesi backup al
2. Sorunlu deploy sonrasinda uygulamayi durdur
3. Son saglikli backup'tan restore yap
4. Uygulamayi once staging, sonra productionda tekrar kaldir

Prisma'da otomatik "down migration" disiplini yok; bu yuzden rollback icin ana strateji:

- backward compatible migration yazmak
- destructive migration'i ayri release'e bolmek
- deploy oncesi backup almak

## 6. Guvenli Deploy Sirası

1. Feature branch merge oncesi typecheck + test + build
2. `pnpm deploy:preflight`
3. Staging deploy
4. Smoke test
5. Backup al
6. Production migration deploy
7. Production app deploy
8. Monitoring ve error panel kontrolu
9. Gerekirse feature flag ile yeni ozellikleri kademeli ac

## 7. Risk Azaltma Kurallari

- Schema degisikligi ile davranis degisikligini ayni deploy'a yigma
- Once additive migration, sonra kod kullanimi, en son cleanup
- `v2` endpointleri canliya almadan once stagingde paralel calistir
- Kritik ozellikleri feature flag ile cikar
- Her deploy sonrasi monitoring ekraninda hata yogunlugunu kontrol et
