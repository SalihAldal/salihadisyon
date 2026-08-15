# 15 Code Skeleton

## Frontend
- `apps/admin-web/app/layout.tsx`: ana shell ve premium sidebar
- `apps/admin-web/lib/navigation.ts`: sidebar kapsami
- `apps/admin-web/lib/route-manifest.ts`: tum ekran manifesti
- `apps/pos-web/src/App.tsx`: POS ekran yerlesimi
- `apps/pos-web/src/pos-flow.ts`: POS capability manifesti
- `apps/mobile-manager/app/index.tsx`: yonetici dashboard girisi
- `apps/mobile-manager/app/screen-manifest.ts`: mobil ekran listesi

## Backend
- `apps/api/src/main.ts`: bootstrap
- `apps/api/src/app.module.ts`: tum modullerin registry'si
- `apps/api/prisma/schema.prisma`: production veri modeli
- `apps/api/src/common/auth/permissions.ts`: permission katalogu
- `apps/api/src/common/auth/rbac.ts`: rol matrisi
- `apps/api/src/contracts/api-catalog.ts`: endpoint katalogu
- `apps/api/src/contracts/realtime-events.ts`: realtime event sozlesmesi
- `apps/api/src/contracts/background-jobs.ts`: queue job katalogu
