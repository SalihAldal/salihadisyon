export const permissionCatalog = {
  dashboard: ["dashboard.view", "dashboard.export"],
  ciro: ["ciro.view", "ciro.export"],
  menu: ["menu.view", "menu.manage", "menu.publish"],
  campaigns: ["campaign.view", "campaign.manage", "campaign.approve"],
  tables: ["table.view", "table.manage", "table.merge", "table.transfer"],
  pos: ["ticket.view", "ticket.manage", "ticket.refund", "payment.manage"],
  pos_operations: ["register.open", "register.close", "drawer.open", "expense.manage"],
  pos_settings: ["pos_settings.view", "pos_settings.manage"],
  products: ["product.manage", "product.price.manage"],
  payment_methods: ["payment_method.view", "payment_method.manage"],
  devices: ["device.view", "device.manage"],
  customers: ["customer.view", "customer.manage"],
  staff: ["staff.view", "staff.manage", "attendance.approve", "goal.manage"],
  attendance: ["attendance.view", "attendance.manage", "attendance.approve"],
  inventory: ["inventory.view", "inventory.manage", "inventory.transfer", "inventory.export"],
  accounting: ["accounting.view", "accounting.manage", "accounting.export", "cash_closure.manage"],
  reports: ["reports.view", "reports.export"],
  integrations: ["integrations.view", "integrations.manage"],
  subscription: ["subscription.view", "subscription.manage"],
  support: ["support.view", "support.manage"],
  backup: ["backup.view", "backup.manage", "backup.restore"],
  feature_flags: ["feature_flags.view", "feature_flags.manage"],
  monitoring: ["monitoring.view"],
} as const;

export type PermissionDomain = keyof typeof permissionCatalog;

export const allPermissionKeys = Object.values(permissionCatalog).flat();
