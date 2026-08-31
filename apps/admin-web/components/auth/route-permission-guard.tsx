"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasAllPermissions, hasAnyPermission } from "@adisyon/config";
import { getStoredUser, type StoredAdminUser } from "../../lib/auth/session";
import { resolveRoutePermissionRule } from "../../lib/auth/route-permissions";
import { AdminButton, AdminStateCard } from "../ui/admin-ui";

function canAccessRoute(user: StoredAdminUser | null, pathname: string) {
  const rule = resolveRoutePermissionRule(pathname);
  if (!rule || rule.public) {
    return true;
  }

  const subject = {
    role: user?.role,
    permissions: user?.permissions ?? [],
  };

  if (rule.allPermissions?.length && !hasAllPermissions(subject, rule.allPermissions)) {
    return false;
  }

  if (rule.anyPermissions?.length && !hasAnyPermission(subject, rule.anyPermissions)) {
    return false;
  }

  return true;
}

export function RoutePermissionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredAdminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    setReady(true);
  }, [pathname]);

  const allowed = useMemo(() => {
    if (!ready) return true;
    return canAccessRoute(user, pathname);
  }, [ready, user, pathname]);

  useEffect(() => {
    if (!ready) return;
    const roleKey = String(user?.role ?? "").toLowerCase();
    const isLimitedRole = ["waiter", "garson", "cashier", "pos_operator"].some((role) => roleKey.includes(role));
    if (isLimitedRole && pathname !== "/satis-ekranina-git") {
      router.replace("/satis-ekranina-git");
    }
  }, [ready, user, pathname, router]);

  if (!ready) {
    return <AdminStateCard tone="info" message="Yükleniyor..." />;
  }

  if (!allowed) {
    return (
      <div className="admin-page-stack">
        <AdminStateCard tone="danger" message="Bu sayfaya erişim yetkiniz bulunmuyor. Gerekli izinlere sahip değilsiniz veya farklı bir role atanmış olabilirsiniz." />
        <AdminButton variant="outline" onClick={() => router.replace("/")}>
          Anasayfaya Dön
        </AdminButton>
      </div>
    );
  }

  return <>{children}</>;
}

export function PermissionAction({
  permission,
  anyPermissions,
  children,
  fallback = null,
}: {
  permission?: string;
  anyPermissions?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const user = getStoredUser();
  const subject = {
    role: user?.role,
    permissions: user?.permissions ?? [],
  };

  if (permission && !hasAllPermissions(subject, [permission])) {
    return <>{fallback}</>;
  }

  if (anyPermissions?.length && !hasAnyPermission(subject, anyPermissions)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
