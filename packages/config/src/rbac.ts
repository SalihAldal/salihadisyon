export type AppRoleKey =
  | "super_admin"
  | "tenant_owner"
  | "admin"
  | "manager"
  | "cashier"
  | "waiter"
  | "pos_operator"
  | string;

type PermissionSubject = {
  role?: string | null;
  permissions?: string[] | null;
};

const FULL_ACCESS_ROLES = new Set<string>(["super_admin", "tenant_owner"]);
const ROLE_PRIORITY = ["super_admin", "tenant_owner", "admin", "manager", "cashier", "waiter", "pos_operator"];

export const ROLE_PERMISSION_DEFAULTS: Record<string, string[]> = {
  super_admin: ["*"],
  tenant_owner: ["*"],
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
  ],
  cashier: [
    "ticket.view",
    "ticket.manage",
    "payment.manage",
    "expense.manage",
    "register.open",
    "register.close",
    "drawer.open",
    "reports.view",
    "ciro.view",
  ],
  waiter: [
    "ticket.view",
    "ticket.manage",
    "table.transfer",
  ],
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
  ],
};

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
