export const mobileManagerApiPlan = {
  auth: ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/2fa/verify"],
  branchContext: ["/api/v1/iam/me/branches", "/api/v1/iam/me/active-branch"],
  dashboard: [
    "/api/v1/dashboard/overview",
    "/api/v1/dashboard/revenue-trend",
    "/api/v1/dashboard/branch-comparison",
  ],
  operations: [
    "/api/v1/pos/pending-orders",
    "/api/v1/attendance/shifts",
    "/api/v1/inventory/critical-alerts",
    "/api/v1/accounting/cash-closures",
  ],
  actions: ["/api/v1/campaigns/:id/toggle", "/api/v1/approvals/:id/approve"],
  notifications: ["/api/v1/notifications", "/api/v1/notifications/push-token"],
} as const;

export const mobileManagerRealtimeTopics = [
  "notifications:new",
  "approval:required",
  "stock.alert.opened",
  "cash.closure.created",
  "attendance.recorded",
  "campaign.state.changed",
] as const;
