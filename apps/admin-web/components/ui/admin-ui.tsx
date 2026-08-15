"use client";

import type { ReactNode } from "react";

export type AdminTone = "success" | "warning" | "danger" | "info" | "neutral";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function resolveBadgeTone(value?: string | null): AdminTone {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) return "neutral";

  if (["success", "active", "approved", "completed", "paid", "online", "live", "published"].includes(normalized)) {
    return "success";
  }
  if (["warning", "pending", "processing", "queued", "open", "reserved", "busy"].includes(normalized)) {
    return "warning";
  }
  if (["danger", "error", "failed", "cancelled", "voided", "offline", "inactive", "passive", "refunded"].includes(normalized)) {
    return "danger";
  }
  if (["info", "draft", "available", "serving"].includes(normalized)) {
    return "info";
  }

  return "neutral";
}

export function AdminStatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: AdminTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx("admin-status-pill", `admin-status-pill--${tone}`, className)}>{children}</span>;
}

export function AdminStateCard({
  message,
  tone = "neutral",
}: {
  message: string;
  tone?: AdminTone;
}) {
  return (
    <div className="admin-surface admin-empty-state admin-empty-state--rich">
      <AdminStatusBadge tone={tone}>{tone === "danger" ? "Hata" : tone === "warning" ? "Uyari" : "Bilgi"}</AdminStatusBadge>
      <p>{message}</p>
    </div>
  );
}

export function AdminPageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("admin-page-intro admin-page-header", className)}>
      <div>
        {kicker ? <p className="admin-kicker">{kicker}</p> : null}
        <h3>{title}</h3>
        {description ? <p className="admin-subtle-text">{description}</p> : null}
      </div>
      {actions ? <div className="admin-button-row">{actions}</div> : null}
    </section>
  );
}

export function AdminFilterPanel({
  kicker,
  title,
  description,
  badge,
  actions,
  children,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("admin-surface admin-filter-panel admin-filter-panel--premium", className)}>
      <div className="admin-section-head">
        <div>
          {kicker ? <p className="admin-kicker">{kicker}</p> : null}
          <h3>{title}</h3>
          {description ? <p className="admin-subtle-text">{description}</p> : null}
        </div>
        <div className="admin-button-row">
          {badge}
          {actions}
        </div>
      </div>
      {children}
    </section>
  );
}

export function AdminStatsGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cx("dashboard-grid dashboard-grid--stats", className)}>{children}</section>;
}

export function AdminStatCard({
  label,
  value,
  helper,
  badge,
  className,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <article className={cx("admin-surface admin-stat-card admin-stat-card--premium", className)}>
      <div className="admin-stat-card__header">
        <span className="admin-kicker">{label}</span>
        {badge}
      </div>
      <strong className="admin-stat-card__value">{value}</strong>
      {helper ? <p className="admin-subtle-text">{helper}</p> : null}
    </article>
  );
}

export function AdminChartCard({
  kicker,
  title,
  description,
  badge,
  actions,
  children,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={cx("admin-surface admin-chart-card admin-chart-card--premium", className)}>
      <div className="admin-section-head">
        <div>
          {kicker ? <p className="admin-kicker">{kicker}</p> : null}
          <h3>{title}</h3>
          {description ? <p className="admin-subtle-text">{description}</p> : null}
        </div>
        <div className="admin-button-row">
          {badge}
          {actions}
        </div>
      </div>
      {children}
    </article>
  );
}

export function AdminTableWrap({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("admin-table-wrap admin-table-wrap--premium", className)}>{children}</div>;
}

export function AdminTableCard({
  kicker,
  title,
  description,
  badge,
  actions,
  children,
  footer,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <article className={cx("admin-surface admin-table-card admin-table-card--premium", className)}>
      <div className="admin-section-head">
        <div>
          {kicker ? <p className="admin-kicker">{kicker}</p> : null}
          <h3>{title}</h3>
          {description ? <p className="admin-subtle-text">{description}</p> : null}
        </div>
        <div className="admin-button-row">
          {badge}
          {actions}
        </div>
      </div>
      {children}
      {footer ? <div className="admin-table-card__footer">{footer}</div> : null}
    </article>
  );
}
