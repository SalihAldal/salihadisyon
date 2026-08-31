import { allPermissionKeys, permissionCatalog } from "./permissions";

export type AppRoleKey =
  | "super_admin"
  | "tenant_owner"
  | "branch_manager"
  | "admin"
  | "manager"
  | "cashier"
  | "waiter"
  | "kitchen"
  | "accounting"
  | "stock_manager"
  | "hr"
  | "auditor"
  | "pos_operator"
  | string;

type PermissionSubject = {
  role?: string | null;
  permissions?: string[] | null;
};

const FULL_ACCESS_ROLES = new Set<string>(["super_admin", "tenant_owner"]);
const ROLE_PRIORITY = [
  "super_admin",
  "tenant_owner",
  "branch_manager",
  "admin",
  "manager",
  "cashier",
  "pos_operator",
  "accounting",
  "stock_manager",
  "hr",
  "auditor",
  "kitchen",
  "waiter",
];

/** Canonical role → default permission map (DB seed + JWT runtime defaults). */
export const ROLE_PERMISSION_DEFAULTS: Record<string, string[]> = {
  super_admin: ["*"],
  tenant_owner: ["*"],
  branch_manager: [
    "dashboard.view",
    "ciro.view",
    "menu.view",
    "menu.manage",
    "campaign.view",
    "campaign.manage",
    "table.view",
    "table.manage",
    "ticket.view",
    "ticket.manage",
    "payment.manage",
    "pos_settings.view",
    "pos_settings.manage",
    "customer.view",
    "customer.manage",
    "staff.view",
    "staff.manage",
    "attendance.approve",
    "attendance.view",
    "attendance.manage",
    "inventory.view",
    "inventory.manage",
    "inventory.transfer",
    "inventory.export",
    "accounting.view",
    "accounting.manage",
    "accounting.export",
    "cash_closure.manage",
    "reports.view",
    "reports.export",
    "integrations.view",
    "integrations.manage",
    "subscription.view",
    "support.view",
    "support.manage",
    "monitoring.view",
    "register.open",
    "register.close",
    "drawer.open",
    "expense.manage",
    "table.merge",
    "table.transfer",
    "ticket.refund",
    "device.view",
    "device.manage",
  ],
  admin: [
    "ticket.view",
    "ticket.manage",
    "ticket.refund",
    "payment.manage",
    "expense.manage",
    "register.open",
    "register.close",
    "drawer.open",
    "table.merge",
    "table.transfer",
    "reports.view",
    "reports.export",
    "ciro.view",
    "ciro.export",
    "pos_settings.view",
    "pos_settings.manage",
    "product.manage",
    "product.price.manage",
    "payment_method.view",
    "payment_method.manage",
    "device.view",
    "device.manage",
    "integrations.view",
    "integrations.manage",
    "staff.view",
    "staff.manage",
    "attendance.view",
    "attendance.manage",
    "attendance.approve",
    "inventory.view",
    "inventory.manage",
    "accounting.view",
    "accounting.manage",
    "goal.manage",
    "menu.view",
    "menu.manage",
    "table.view",
    "table.manage",
    "customer.view",
    "customer.manage",
  ],
  manager: [
    "ticket.view",
    "ticket.manage",
    "payment.manage",
    "expense.manage",
    "register.open",
    "register.close",
    "drawer.open",
    "table.merge",
    "table.transfer",
    "reports.view",
    "ciro.view",
    "pos_settings.view",
    "product.manage",
    "product.price.manage",
    "payment_method.view",
    "device.view",
    "staff.view",
    "attendance.view",
    "attendance.manage",
    "inventory.view",
    "accounting.view",
    "menu.view",
    "table.view",
  ],
  cashier: [
    "dashboard.view",
    "table.view",
    "ticket.view",
    "ticket.manage",
    "payment.manage",
    "customer.view",
    "attendance.view",
    "register.open",
    "register.close",
    "drawer.open",
    "expense.manage",
    "reports.view",
  ],
  waiter: ["table.view", "ticket.view", "ticket.manage", "customer.view", "attendance.view"],
  kitchen: ["ticket.view"],
  accounting: ["accounting.view", "accounting.manage", "reports.view", "reports.export"],
  stock_manager: ["inventory.view", "inventory.manage", "inventory.transfer", "inventory.export", "reports.view", "reports.export"],
  hr: ["staff.view", "staff.manage", "attendance.view", "attendance.manage", "attendance.approve", "goal.manage"],
  auditor: ["reports.view", "reports.export", "dashboard.view", "ciro.view"],
  pos_operator: [
    "ticket.view",
    "ticket.manage",
    "payment.manage",
    "expense.manage",
    "register.open",
    "register.close",
    "drawer.open",
    "reports.view",
    "ticket.refund",
    "table.view",
  ],
};

/** Alias used by API seed and IAM modules. */
export const roleMatrix = {
  super_admin: allPermissionKeys,
  tenant_owner: [
    ...permissionCatalog.dashboard,
    ...permissionCatalog.ciro,
    ...permissionCatalog.menu,
    ...permissionCatalog.campaigns,
    ...permissionCatalog.tables,
    ...permissionCatalog.pos,
    ...permissionCatalog.pos_operations,
    ...permissionCatalog.pos_settings,
    ...permissionCatalog.products,
    ...permissionCatalog.payment_methods,
    ...permissionCatalog.devices,
    ...permissionCatalog.customers,
    ...permissionCatalog.staff,
    ...permissionCatalog.attendance,
    ...permissionCatalog.inventory,
    ...permissionCatalog.accounting,
    ...permissionCatalog.reports,
    ...permissionCatalog.integrations,
    ...permissionCatalog.subscription,
    ...permissionCatalog.support,
    ...permissionCatalog.feature_flags,
    ...permissionCatalog.monitoring,
  ],
  branch_manager: ROLE_PERMISSION_DEFAULTS.branch_manager,
  cashier: ROLE_PERMISSION_DEFAULTS.cashier,
  waiter: ROLE_PERMISSION_DEFAULTS.waiter,
  kitchen: ROLE_PERMISSION_DEFAULTS.kitchen,
  accounting: ROLE_PERMISSION_DEFAULTS.accounting,
  stock_manager: ROLE_PERMISSION_DEFAULTS.stock_manager,
  hr: ROLE_PERMISSION_DEFAULTS.hr,
  auditor: ROLE_PERMISSION_DEFAULTS.auditor,
} as const;

export type RoleKey = keyof typeof roleMatrix;

export function isWaiterRole(role?: string | null) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "waiter" || normalized === "garson";
}

export function resolvePrimaryRole(roleKeys: string[]) {
  for (const role of ROLE_PRIORITY) {
    if (roleKeys.includes(role)) {
      return role;
    }
  }
  return roleKeys[0] ?? "waiter";
}

export function getRoleDefaultPermissions(role: string) {
  return ROLE_PERMISSION_DEFAULTS[role] ?? [];
}

export function mergeEffectivePermissions(roleKeys: string[], explicitPermissions: string[]) {
  const merged = new Set<string>();
  for (const roleKey of roleKeys) {
    for (const permission of getRoleDefaultPermissions(roleKey)) {
      merged.add(permission);
    }
  }
  for (const permission of explicitPermissions) {
    merged.add(permission);
  }
  return [...merged];
}

export function isFullAccessRole(role?: string | null) {
  return Boolean(role && FULL_ACCESS_ROLES.has(role));
}

export function hasPermission(subject: PermissionSubject, permission: string) {
  if (isFullAccessRole(subject.role)) {
    return true;
  }
  const permissions = subject.permissions ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function hasAnyPermission(subject: PermissionSubject, permissions: string[]) {
  if (!permissions.length) {
    return true;
  }
  return permissions.some((permission) => hasPermission(subject, permission));
}

export function hasAllPermissions(subject: PermissionSubject, permissions: string[]) {
  if (!permissions.length) {
    return true;
  }
  return permissions.every((permission) => hasPermission(subject, permission));
}
