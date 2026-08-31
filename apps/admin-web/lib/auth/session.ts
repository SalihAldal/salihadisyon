import { hasAllPermissions, hasAnyPermission } from "@adisyon/config";
import type { SidebarItem } from "@adisyon/types";

export interface StoredAdminUser {
  id?: string;
  fullName?: string;
  email?: string;
  tenantId?: string;
  defaultBranchId?: string | null;
  role?: string;
  permissions?: string[];
  branchIds?: string[];
}

type SidebarPermissionItem = SidebarItem & {
  allPermissions?: string[];
  anyPermissions?: string[];
  children?: SidebarPermissionItem[];
};

export function getStoredAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem("adisyon.accessToken");
  } catch {
    return null;
  }
}

export function getStoredRefreshToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem("adisyon.refreshToken");
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem("adisyon.accessToken");
    window.localStorage.removeItem("adisyon.refreshToken");
    window.localStorage.removeItem("adisyon.user");
  } catch {
    // ignore storage errors
  }
}

export function requireStoredAccessToken() {
  const token = getStoredAccessToken();
  if (!token) {
    throw new Error("Oturum bulunamadi. Once giris yapmalisin.");
  }

  return token;
}

export function getStoredUser() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem("adisyon.user");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredAdminUser;
    return {
      ...parsed,
      role: String(parsed.role ?? ""),
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions.map((item) => String(item)) : [],
      branchIds: Array.isArray(parsed.branchIds) ? parsed.branchIds.map((item) => String(item)) : [],
    };
  } catch {
    return null;
  }
}

export function hasStoredPermission(user: StoredAdminUser | null | undefined, permission: string) {
  return hasAllPermissions(
    {
      role: user?.role,
      permissions: user?.permissions ?? [],
    },
    [permission],
  );
}

export function canAccessSidebarItem(user: StoredAdminUser | null | undefined, item: SidebarPermissionItem) {
  const subject = {
    role: user?.role,
    permissions: user?.permissions ?? [],
  };

  if (item.allPermissions?.length && !hasAllPermissions(subject, item.allPermissions)) {
    return false;
  }

  if (item.anyPermissions?.length && !hasAnyPermission(subject, item.anyPermissions)) {
    return false;
  }

  return true;
}

export function filterSidebarByPermission(items: SidebarPermissionItem[], user: StoredAdminUser | null | undefined): SidebarPermissionItem[] {
  return items.reduce<SidebarPermissionItem[]>((acc, item) => {
      const children = item.children ? filterSidebarByPermission(item.children, user) : undefined;
      const canAccessSelf = canAccessSidebarItem(user, item);
      const hasVisibleChildren = Boolean(children?.length);

      if (!canAccessSelf && !hasVisibleChildren) {
        return acc;
      }

      acc.push({
        ...item,
        children,
      });
      return acc;
    }, []);
}
