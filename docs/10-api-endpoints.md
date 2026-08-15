# 10 API Endpoint List

## Auth
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/2fa/verify`

## IAM
- `GET /api/v1/iam/users`
- `POST /api/v1/iam/users`
- `GET /api/v1/iam/users/:id`
- `PATCH /api/v1/iam/users/:id`
- `GET /api/v1/iam/roles`
- `POST /api/v1/iam/roles`

## Dashboard ve Ciro
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/revenue-trend`
- `GET /api/v1/dashboard/branch-comparison`
- `GET /api/v1/dashboard/peak-hours`

## POS ve Menu
- `GET /api/v1/menu/categories`
- `POST /api/v1/menu/categories`
- `GET /api/v1/menu/products`
- `POST /api/v1/menu/products`
- `PATCH /api/v1/menu/products/:id`
- `GET /api/v1/tables/layout`
- `POST /api/v1/pos/tickets`
- `PATCH /api/v1/pos/tickets/:id`
- `POST /api/v1/pos/tickets/:id/items`
- `POST /api/v1/pos/payments`
- `POST /api/v1/pos/tickets/:id/split`
- `POST /api/v1/pos/tickets/:id/merge`
- `POST /api/v1/pos/tickets/:id/transfer`

## Personel ve QR
- `GET /api/v1/staff/employees`
- `POST /api/v1/staff/employees`
- `GET /api/v1/attendance/shifts`
- `POST /api/v1/attendance/qr/generate`
- `POST /api/v1/attendance/qr/scan`
- `POST /api/v1/attendance/approvals/:id/approve`

## Finans ve Stok
- `GET /api/v1/accounting/ledger`
- `POST /api/v1/accounting/invoices`
- `POST /api/v1/accounting/cash-closures`
- `GET /api/v1/inventory/items`
- `POST /api/v1/inventory/stock-entries`
- `POST /api/v1/inventory/transfers`
- `GET /api/v1/reports/sales`
- `GET /api/v1/reports/finance`
- `GET /api/v1/reports/staff`

## SaaS ve Sistem
- `GET /api/v1/integrations/providers`
- `POST /api/v1/integrations/credentials`
- `GET /api/v1/subscriptions/current`
- `GET /api/v1/audit/logs`
- `GET /api/v1/notifications`
