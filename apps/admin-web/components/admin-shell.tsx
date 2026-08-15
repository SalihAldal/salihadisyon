"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { adminSidebar } from "../lib/navigation";
import { filterSidebarByPermission, getStoredUser, type StoredAdminUser } from "../lib/auth/session";
import { AdminRealtimeBridge } from "./admin-realtime-bridge";
import { FeatureFlagProvider } from "./feature-flags/feature-flag-provider";
import { AdminFeedbackLayer } from "./ui/admin-feedback-layer";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [userInfo, setUserInfo] = useState<StoredAdminUser | null>(null);

  const isLimitedRole = useMemo(() => {
    const roleKey = String(userInfo?.role ?? "").toLowerCase();
    return ["waiter", "garson", "cashier", "pos_operator"].some((role) => roleKey.includes(role));
  }, [userInfo?.role]);

  const visibleSidebar = useMemo(() => {
    const baseSidebar = isLimitedRole ? adminSidebar.filter((item) => item.key === "go-pos") : adminSidebar;
    return filterSidebarByPermission(baseSidebar, userInfo);
  }, [isLimitedRole, userInfo]);

  const hasSession = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem("adisyon.accessToken"));
  }, [pathname]);

  useEffect(() => {
    if (!hasSession && !isLoginPage) {
      router.replace("/login");
      return;
    }
    if (hasSession && isLoginPage) {
      router.replace("/");
    }
  }, [hasSession, isLoginPage, router]);

  useEffect(() => {
    if (!hasSession || isLoginPage || !isLimitedRole) {
      return;
    }
    if (!pathname.startsWith("/satis-ekranina-git")) {
      router.replace("/satis-ekranina-git");
    }
  }, [hasSession, isLimitedRole, isLoginPage, pathname, router]);

  useEffect(() => {
    const nextState: Record<string, boolean> = {};
    for (const item of adminSidebar) {
      if (item.children?.length) {
        const isActiveParent = pathname === item.href || item.children.some((child) => pathname.startsWith(child.href));
        nextState[item.key] = isActiveParent;
      }
    }
    setOpenGroups(nextState);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!window.localStorage.getItem("adisyon.user")) {
        setUserInfo(null);
        return;
      }
      setUserInfo(getStoredUser());
    } catch {
      setUserInfo(null);
    }
  }, [pathname]);

  if (isLoginPage) {
    return <div className="admin-login-wrap">{children}</div>;
  }

  return (
    <FeatureFlagProvider>
      <div className="admin-shell">
        <AdminFeedbackLayer />
        <AdminRealtimeBridge user={userInfo} />
        <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand__mark">K</div>
          <div>
            <p className="admin-brand__eyebrow">Aldal Pos</p>
            <h1 className="admin-brand__title">İşletme Yönetimi</h1>
          </div>
        </div>

        <div className="admin-sidebar__tenant">
          <div>
            <p className="admin-sidebar__tenant-label">Aktif İşletme</p>
            <strong>{userInfo?.email ? "Yetkili Oturum" : "Aktif Oturum"}</strong>
          </div>
          <span className="admin-status-pill admin-status-pill--success">Canlı</span>
        </div>

        <nav className="admin-nav">
          {visibleSidebar.map((item) => (
            <div key={item.key} className="admin-nav__group">
              {item.enabled && item.children?.length ? (
                <button
                  className={`admin-nav__item admin-nav__toggle ${pathname === item.href || item.children.some((child) => pathname.startsWith(child.href)) ? "admin-nav__item--active" : ""}`}
                  type="button"
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [item.key]: !current[item.key],
                    }))
                  }
                >
                  <span>
                    <span className="admin-nav__label">{item.label}</span>
                    {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                  </span>
                  <span className="admin-nav__chevron">{openGroups[item.key] ? "−" : "+"}</span>
                </button>
              ) : item.enabled ? (
                <Link
                  className={`admin-nav__item ${pathname === item.href ? "admin-nav__item--active" : ""}`}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                >
                  <span>
                    <span className="admin-nav__label">{item.label}</span>
                    {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                  </span>
                  {item.badge ? <span className="admin-status-pill admin-status-pill--danger">{item.badge}</span> : null}
                </Link>
              ) : (
                <div className="admin-nav__item admin-nav__item--disabled">
                  <span>
                    <span className="admin-nav__label">{item.label}</span>
                    {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                  </span>
                  {item.badge ? <span className="admin-status-pill admin-status-pill--danger">{item.badge}</span> : null}
                </div>
              )}
              {item.children && openGroups[item.key] ? (
                <div className="admin-nav__children">
                  {item.children.map((child) =>
                    child.enabled ? (
                      <Link key={child.key} className={`admin-nav__child ${pathname.startsWith(child.href) ? "admin-nav__child--active" : ""}`} href={child.href}>
                        <span>{child.label}</span>
                        {child.badge ? <span className="admin-status-pill admin-status-pill--warning">{child.badge}</span> : null}
                      </Link>
                    ) : (
                      <div key={child.key} className="admin-nav__child admin-nav__child--disabled">
                        <span>{child.label}</span>
                        {child.badge ? <span className="admin-status-pill admin-status-pill--warning">{child.badge}</span> : null}
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <div>
            <p className="admin-sidebar__tenant-label">Sürüm</p>
            <strong>Panel hazır</strong>
          </div>
          <span className="admin-status-pill admin-status-pill--info">v1.0</span>
        </div>
        </aside>

        <main className="admin-main">
          <header className="admin-topbar">
          <div className="admin-topbar__left">
            <div className="admin-search">
              <span className="admin-search__icon">ARA</span>
              <input aria-label="Global arama" placeholder="Ara (modül, müşteri, ürün, adisyon)" />
            </div>
          </div>

          <div className="admin-topbar__right">
            <button
              className="admin-outline-button"
              type="button"
              onClick={() => {
                window.localStorage.removeItem("adisyon.accessToken");
                window.localStorage.removeItem("adisyon.refreshToken");
                window.localStorage.removeItem("adisyon.user");
                router.replace("/login");
              }}
            >
              Cikis Yap
            </button>
            <div className="admin-user-pill">
              <div className="admin-user-pill__avatar">SA</div>
              <div>
                <strong>{userInfo?.fullName ?? "Panel Kullanıcısı"}</strong>
                <p>{userInfo?.role ?? "Yetkili Kullanıcı"}</p>
              </div>
            </div>
          </div>
          </header>

          <div className="admin-page-shell">
            {children}
          </div>
        </main>
      </div>
    </FeatureFlagProvider>
  );
}
