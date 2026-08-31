import { adminSidebar, type AdminSidebarItem } from "../navigation";

export type RoutePermissionRule = {
  /** Exact path or prefix (prefix ends with *) */
  path: string;
  allPermissions?: string[];
  anyPermissions?: string[];
  /** Routes that bypass permission check (login, go-pos for limited roles handled separately) */
  public?: boolean;
};

function collectSidebarRules(items: AdminSidebarItem[]): RoutePermissionRule[] {
  const rules: RoutePermissionRule[] = [];

  for (const item of items) {
    if (item.href && (item.allPermissions?.length || item.anyPermissions?.length)) {
      rules.push({
        path: item.href,
        allPermissions: item.allPermissions,
        anyPermissions: item.anyPermissions,
      });
    }

    if (item.children?.length) {
      rules.push(...collectSidebarRules(item.children));
    }
  }

  return rules;
}

/** Longest-prefix match wins. Paths ending with * are prefix rules. */
export const adminRoutePermissionRules: RoutePermissionRule[] = [
  { path: "/login", public: true },
  { path: "/satis-ekranina-git", public: true },
  { path: "/", anyPermissions: ["dashboard.view"] },
  { path: "/subeler", anyPermissions: ["dashboard.view", "staff.manage"] },
  { path: "/isletme", anyPermissions: ["subscription.manage"] },
  { path: "/audit", anyPermissions: ["reports.view"] },
  { path: "/abonelik", anyPermissions: ["subscription.view", "subscription.manage"] },
  { path: "/destek", anyPermissions: ["support.view", "support.manage"] },
  { path: "/urun-puanlari", anyPermissions: ["reports.view", "product.manage"] },
  ...collectSidebarRules(adminSidebar),
];

export function normalizeAdminPath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
}

export function resolveRoutePermissionRule(pathname: string): RoutePermissionRule | null {
  const normalized = normalizeAdminPath(pathname);

  let bestMatch: RoutePermissionRule | null = null;
  let bestLength = -1;

  for (const rule of adminRoutePermissionRules) {
    if (rule.public) {
      if (normalized === rule.path) {
        return rule;
      }
      continue;
    }

    const isPrefix = rule.path.endsWith("*");
    const rulePath = isPrefix ? rule.path.slice(0, -1) : rule.path;
    const matches = isPrefix ? normalized.startsWith(rulePath) : normalized === rulePath || normalized.startsWith(`${rulePath}/`);

    if (matches && rulePath.length > bestLength) {
      bestMatch = rule;
      bestLength = rulePath.length;
    }
  }

  return bestMatch;
}
