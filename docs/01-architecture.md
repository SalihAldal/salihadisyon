# 01 Architecture

## Monorepo Topolojisi
- `apps/admin-web`: Next.js + TypeScript yonetim paneli
- `apps/pos-web`: React + TypeScript POS istemcisi
- `apps/mobile-manager`: React Native Expo yonetici uygulamasi
- `apps/api`: NestJS + Prisma backend
- `packages/ui`: ortak tasarim tokenlari ve bilesen kontratlari
- `packages/types`: paylasilan enum ve tipler
- `packages/config`: runtime config katmani
- `packages/utils`: formatlama ve yardimci fonksiyonlar

## Ana Ilkeler
- Shared schema multi-tenant veri modeli
- Tüm is kayitlarinda `companyId`, operasyonel kayitlarda `branchId`
- JWT + refresh token + RBAC + audit log
- Redis + BullMQ ile queue ve schedule
- S3 uyumlu dosya depolama
- WebSocket ile anlik operasyon akislari

## Veri Akisi
1. Kullanici admin, POS veya mobilden islem baslatir.
2. API katmani kullaniciyi dogrular ve tenant/branch scope uygular.
3. Prisma servis katmani PostgreSQL uzerinden is kurallarini isletir.
4. Kritik aksiyonlar `AuditLog` ve `ApiLog` olarak kaydedilir.
5. Realtime event varsa WebSocket gateway uzerinden ilgili istemcilere dagitilir.
6. Export, bildirim, kampanya zamanlama ve stok mutabakati BullMQ islerine gider.
