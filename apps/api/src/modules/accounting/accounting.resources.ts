export const accountingResources = [
  "accounts",
  "ticket-ledger",
  "sold-products",
  "payments",
  "vat-rates",
  "suppliers",
  "supplier-vat",
  "business-customers",
  "customer-vat",
  "invoices",
  "invoice-items",
  "unit-costs",
  "cash-closures",
  "fixed-costs",
  "payroll",
  "other-payments",
] as const;

export type AccountingResource = (typeof accountingResources)[number];
