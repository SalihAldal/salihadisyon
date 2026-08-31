# Proje Calistirma Adimlari

Bu dosya, projeyi lokal ortamda hizli calistirmak icin kisa komut rehberidir.

## 1) Ilk Kurulum

```bash
pnpm install
```

## 2) Altyapi Servisleri (PostgreSQL + Redis)

Docker acik degilse once Docker Desktop'i ac.

```bash
pnpm docker:up:wait
```

Kapatmak icin:

```bash
pnpm docker:down
```

## 3) Veritabani Hazirlama

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

## 4) Port Temizligi (opsiyonel ama onerilir)

3000 (Admin), 3001 (POS), 4100 (API) portlarini temizler:

```bash
pnpm kill:dev
```

## 5) Uygulamalari Calistirma

### API

```bash
pnpm dev:api
```

### Admin Web

```bash
pnpm dev:admin
```

### POS Web

```bash
pnpm --filter pos-web dev
```

> Not: API, Admin ve POS'u ayri terminalde calistir.
> Admin web varsayilan olarak `:3000` portunda baslar (`next dev -p 3000`). Root `.env` icinde `PORT=4100` tanimlamayin; API portu `apps/api/.env` icindedir.

## 6) URL'ler

- Admin: http://localhost:3000
- POS: http://localhost:3001
- API: http://localhost:4100/api/v1

## 7) Seed Kullanicilari

| Rol | Email | Sifre |
|-----|-------|-------|
| Owner | owner@aldal.local | ChangeMe123! |
| Super Admin (backup/restore) | superadmin@aldal.local | SuperAdmin123! |
| Cashier | cashier@aldal.local | Cashier123! |
| Waiter | waiter@aldal.local | Waiter123! |

## 8) Sık Kullanilan Komutlar

```bash
pnpm typecheck
pnpm build
pnpm kill:ports 3000 3001 4100
```

