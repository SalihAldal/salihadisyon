"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { adminSidebar } from "../lib/navigation";
import { clearStoredSession, filterSidebarByPermission, getStoredUser, type StoredAdminUser } from "../lib/auth/session";
import { AdminRealtimeBridge } from "./admin-realtime-bridge";
import { FeatureFlagProvider } from "./feature-flags/feature-flag-provider";
import { AdminFeedbackLayer } from "./ui/admin-feedback-layer";
import { RoutePermissionGuard } from "./auth/route-permission-guard";
import { fetchBranches, type BranchRecord } from "../lib/services/branches-service";
import { AdminBellIcon, AdminChevronDown, AdminChevronRight, AdminHelpIcon, AdminIcon, AdminLogOutIcon, AdminMenuIcon, AdminSearchIcon } from "./ui/admin-icons";
import { AdminButton, AdminIconButton, AdminInput, AdminSelect, AdminStatusBadge } from "./ui/admin-ui";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [userInfo, setUserInfo] = useState<StoredAdminUser | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [branches, setBranches] = useState<BranchRecord[] | null>(null);
  const [searchString, setSearchString] = useState("");

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
    if (typeof window === "undefined") return;
    try {
      const nextCollapsed = window.localStorage.getItem("adisyon.admin.sidebarCollapsed") === "1";
      setSidebarCollapsed(nextCollapsed);
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);

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
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setSearchString(window.location.search ?? "");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
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

  useEffect(() => {
    if (!hasSession || isLoginPage) return;
    let active = true;
    void (async () => {
      try {
        const list = await fetchBranches();
        if (!active) return;
        setBranches(Array.isArray(list) ? list : []);
      } catch {
        if (!active) return;
        setBranches([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [hasSession, isLoginPage]);

  if (isLoginPage) {
    return <div className="admin-login-wrap">{children}</div>;
  }

  const toolKeys = useMemo(
    () => new Set(["support", "subscription", "audit", "product-ratings", "staff-discounts-shortcut", "go-pos"]),
    [],
  );

  const mainNavItems = useMemo(() => visibleSidebar.filter((item) => !toolKeys.has(item.key)), [toolKeys, visibleSidebar]);
  const toolNavItems = useMemo(() => visibleSidebar.filter((item) => toolKeys.has(item.key)), [toolKeys, visibleSidebar]);

  function logout() {
    clearStoredSession();
    router.replace("/login");
  }

  function toggleCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("adisyon.admin.sidebarCollapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  function setBranchId(nextId: string) {
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    if (!nextId || nextId === "all") params.delete("branchId");
    else params.set("branchId", nextId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const currentBranchId = useMemo(() => {
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    return params.get("branchId") ?? "all";
  }, [searchString]);

  return (
    <FeatureFlagProvider>
      <div className={`admin-shell ${sidebarCollapsed ? "admin-shell--collapsed" : ""} ${mobileNavOpen ? "admin-shell--mobile-open" : ""}`}>
        <AdminFeedbackLayer />
        <AdminRealtimeBridge user={userInfo} />
        <div className="admin-sidebar-overlay" role="presentation" onClick={() => setMobileNavOpen(false)} />
        <aside className="admin-sidebar" aria-label="Admin navigasyon">
        <div className="admin-brand">
          <div className="admin-brand__mark">AL</div>
          <div>
            <p className="admin-brand__eyebrow">Aldal Pos</p>
            <h1 className="admin-brand__title">İşletme Yönetimi</h1>
          </div>
          <button type="button" className="admin-icon-button admin-sidebar__collapse" onClick={toggleCollapsed} aria-label={sidebarCollapsed ? "Sidebar aç" : "Sidebar daralt"}>
            <AdminChevronRight width={18} height={18} />
          </button>
        </div>

        <div className="admin-sidebar__tenant">
          <div>
            <p className="admin-sidebar__tenant-label">Aktif İşletme</p>
            <strong>{userInfo?.email ? "Yetkili Oturum" : "Aktif Oturum"}</strong>
          </div>
          <AdminStatusBadge tone="success">Canlı</AdminStatusBadge>
        </div>

        <nav className="admin-nav">
          <div className="admin-nav__section">
            <p className="admin-nav__section-title">ANA MENÜ</p>
            {mainNavItems.map((item) => (
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
                  <span className="admin-nav__left">
                    <span className="admin-nav__icon">
                      <AdminIcon name={item.icon} />
                    </span>
                    <span className="admin-nav__text">
                      <span className="admin-nav__label">{item.label}</span>
                      {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                    </span>
                  </span>
                  <span className="admin-nav__chevron" aria-hidden="true">
                    {openGroups[item.key] ? <AdminChevronDown width={16} height={16} /> : <AdminChevronRight width={16} height={16} />}
                  </span>
                </button>
              ) : item.enabled ? (
                <Link
                  className={`admin-nav__item ${pathname === item.href ? "admin-nav__item--active" : ""}`}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                >
                  <span className="admin-nav__left">
                    <span className="admin-nav__icon">
                      <AdminIcon name={item.icon} />
                    </span>
                    <span className="admin-nav__text">
                      <span className="admin-nav__label">{item.label}</span>
                      {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                    </span>
                  </span>
                  {item.badge ? <AdminStatusBadge tone="danger">{item.badge}</AdminStatusBadge> : null}
                </Link>
              ) : (
                <div className="admin-nav__item admin-nav__item--disabled">
                  <span className="admin-nav__left">
                    <span className="admin-nav__icon">
                      <AdminIcon name={item.icon} />
                    </span>
                    <span className="admin-nav__text">
                      <span className="admin-nav__label">{item.label}</span>
                      {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                    </span>
                  </span>
                  {item.badge ? <AdminStatusBadge tone="danger">{item.badge}</AdminStatusBadge> : null}
                </div>
              )}
              {item.children && openGroups[item.key] ? (
                <div className="admin-nav__children">
                  {item.children.map((child) =>
                    child.enabled ? (
                      <Link key={child.key} className={`admin-nav__child ${pathname.startsWith(child.href) ? "admin-nav__child--active" : ""}`} href={child.href}>
                        <span>{child.label}</span>
                        {child.badge ? <AdminStatusBadge tone="warning">{child.badge}</AdminStatusBadge> : null}
                      </Link>
                    ) : (
                      <div key={child.key} className="admin-nav__child admin-nav__child--disabled">
                        <span>{child.label}</span>
                        {child.badge ? <AdminStatusBadge tone="warning">{child.badge}</AdminStatusBadge> : null}
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </div>
            ))}
          </div>

          {toolNavItems.length ? (
            <div className="admin-nav__section">
              <p className="admin-nav__section-title">ARAÇLAR</p>
              {toolNavItems.map((item) => (
                <div key={item.key} className="admin-nav__group">
                  {item.enabled ? (
                    <Link
                      className={`admin-nav__item ${pathname === item.href ? "admin-nav__item--active" : ""}`}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noreferrer" : undefined}
                    >
                      <span className="admin-nav__left">
                        <span className="admin-nav__icon">
                          <AdminIcon name={item.icon} />
                        </span>
                        <span className="admin-nav__text">
                          <span className="admin-nav__label">{item.label}</span>
                          {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                        </span>
                      </span>
                      {item.badge ? <AdminStatusBadge tone="danger">{item.badge}</AdminStatusBadge> : null}
                    </Link>
                  ) : (
                    <div className="admin-nav__item admin-nav__item--disabled">
                      <span className="admin-nav__left">
                        <span className="admin-nav__icon">
                          <AdminIcon name={item.icon} />
                        </span>
                        <span className="admin-nav__text">
                          <span className="admin-nav__label">{item.label}</span>
                          {item.description ? <span className="admin-nav__description">{item.description}</span> : null}
                        </span>
                      </span>
                      {item.badge ? <AdminStatusBadge tone="danger">{item.badge}</AdminStatusBadge> : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </nav>

        <div className="admin-sidebar__footer">
          <div>
            <p className="admin-sidebar__tenant-label">Sürüm</p>
            <strong>Panel hazır</strong>
          </div>
          <AdminStatusBadge tone="info">v1.0</AdminStatusBadge>
        </div>
        </aside>

        <main className="admin-main">
          <header className="admin-topbar">
          <div className="admin-topbar__left">
            <AdminIconButton label="Menü" onClick={() => setMobileNavOpen(true)} aria-label="Menü" className="admin-topbar__hamburger">
              <AdminMenuIcon width={18} height={18} />
            </AdminIconButton>
            <div className="admin-search">
              <span className="admin-search__icon" aria-hidden="true">
                <AdminSearchIcon width={16} height={16} />
              </span>
              <AdminInput aria-label="Global arama" placeholder="Ara (modül, müşteri, ürün, adisyon)" />
            </div>
          </div>

          <div className="admin-topbar__right">
            {branches ? (
              <label className="admin-topbar__select">
                <span className="admin-topbar__select-label">Şube Seç</span>
                <AdminSelect value={currentBranchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Şube seç">
                  <option value="all">Tüm yetkili şubeler</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </AdminSelect>
              </label>
            ) : null}

            <AdminIconButton label="Bildirimler" aria-label="Bildirimler" disabled>
              <AdminBellIcon width={18} height={18} />
            </AdminIconButton>
            <AdminIconButton label="Yardım" aria-label="Yardım" disabled>
              <AdminHelpIcon width={18} height={18} />
            </AdminIconButton>
            <div className="admin-user-pill">
              <div className="admin-user-pill__avatar">SA</div>
              <div>
                <strong>{userInfo?.fullName ?? "Panel Kullanıcısı"}</strong>
                <p>{userInfo?.role ?? "Yetkili Kullanıcı"}</p>
              </div>
            </div>
            <AdminIconButton label="Çıkış yap" onClick={logout} aria-label="Çıkış yap">
              <AdminLogOutIcon width={18} height={18} />
            </AdminIconButton>
          </div>
          </header>

          <div className="admin-page-shell">
            <RoutePermissionGuard>{children}</RoutePermissionGuard>
          </div>
        </main>
      </div>
    </FeatureFlagProvider>
  );
}
