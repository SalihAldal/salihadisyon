# Prisma Migration Baslangici

Sprint 1 icin migration omurgasi hazirlandi:

1. `schema.prisma` tenant, branch, user, role, permission ve refresh session alanlarini icerir.
2. Root seviyede `prisma:migrate`, `prisma:generate`, `prisma:seed` scriptleri tanimlidir.
3. Ilk migration'i olusturmak icin:

```bash
pnpm install
pnpm docker:up
pnpm prisma:generate
pnpm prisma:migrate -- --name sprint1_init
pnpm prisma:seed
```

Not:
- Bu repo icinde kapsamli domain schema oldugu icin migration dosyasi komutla generate edilmelidir.
- Seed senaryosu `owner@aldal.local` ve `manager@aldal.local` kullanicilarini olusturur.
