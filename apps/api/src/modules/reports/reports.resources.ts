export const reportResources = [
  "sales-reports",
  "payment-method-reports",
  "expense-reports",
  "cash-closure-reports",
  "discount-reports",
  "product-reports",
  "profitability-reports",
  "stock-reports",
  "consumption-reports",
  "finance-reports",
  "employee-reports",
  "shift-reports",
  "goal-bonus-reports",
] as const;

export type ReportResource = (typeof reportResources)[number];
