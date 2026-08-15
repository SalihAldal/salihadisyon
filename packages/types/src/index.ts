export type AppChannel = "table" | "self_service" | "delivery" | "takeaway" | "qr_menu";

export type TicketStatus =
  | "draft"
  | "open"
  | "preparing"
  | "served"
  | "payment_pending"
  | "paid"
  | "cancelled";

export type TableStatus = "available" | "occupied" | "reserved" | "cleaning";

export type PaymentMethod =
  | "cash"
  | "credit_card"
  | "meal_card"
  | "gift_card"
  | "bank_transfer"
  | "other";

export type SubscriptionState = "trial" | "active" | "passive" | "suspended";

export type PermissionKey =
  | "dashboard.view"
  | "ciro.view"
  | "menu.manage"
  | "campaign.manage"
  | "table.manage"
  | "ticket.manage"
  | "payment.manage"
  | "inventory.manage"
  | "accounting.manage"
  | "reports.view"
  | "staff.manage"
  | "subscription.manage"
  | "integrations.manage"
  | "support.manage";

export interface TenantScopedEntity {
  id: string;
  tenantId: string;
  branchId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SidebarItem {
  key: string;
  label: string;
  href: string;
  description?: string;
  icon?: string;
  badge?: string;
  external?: boolean;
  defaultOpen?: boolean;
  enabled?: boolean;
  children?: SidebarItem[];
}
