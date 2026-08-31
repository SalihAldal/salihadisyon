"use client";

import type { ReactNode } from "react";
import { AdminCloseIcon } from "./admin-icons";

export type AdminTone = "success" | "warning" | "danger" | "info" | "neutral";
export type AdminModalSize = "sm" | "md" | "lg" | "xl";
export type AdminButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "text";

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

export function AdminSectionHeader({
  kicker,
  title,
  description,
  badge,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("admin-section-head", className)}>
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
  );
}

export function AdminFormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("admin-form-section", className)}>
      <div className="admin-form-section__head">
        <h4>{title}</h4>
        {description ? <p className="admin-subtle-text">{description}</p> : null}
      </div>
      <div className="admin-form-section__body">{children}</div>
    </section>
  );
}

export function AdminField({
  label,
  helper,
  fullWidth,
  children,
  className,
}: {
  label: string;
  helper?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("admin-field", fullWidth && "admin-field--full", className)}>
      <span>{label}</span>
      {children}
      {helper ? <small className="admin-field__helper">{helper}</small> : null}
    </label>
  );
}

export function AdminInput(props: React.InputHTMLAttributes<HTMLInputElement> & { tone?: AdminTone }) {
  return <input {...props} className={cx("admin-input", props.className)} />;
}

export function AdminSearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type={props.type ?? "search"} className={cx("admin-input", "admin-input--search", props.className)} />;
}

export function AdminSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx("admin-select", props.className)} />;
}

export function AdminTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx("admin-textarea", props.className)} />;
}

export function AdminNumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="number" className={cx("admin-input", props.className)} />;
}

export function AdminCheckbox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="checkbox" className={cx("admin-checkbox", props.className)} />;
}

export function AdminSwitchField({
  label,
  checked,
  onChange,
  disabled,
  helper,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  helper?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("admin-field", className)}>
      <span>{label}</span>
      <div className="admin-switch-row">
        <button
          type="button"
          className={cx("admin-switch", checked && "admin-switch--on", disabled && "admin-switch--disabled")}
          aria-pressed={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <span className="admin-switch__thumb" aria-hidden="true" />
        </button>
        <span className="admin-switch__label">{checked ? "Açık" : "Kapalı"}</span>
      </div>
      {helper ? <small className="admin-field__helper">{helper}</small> : null}
    </div>
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

export function AdminDataTable<T extends { id?: string | number }>({
  columns,
  rows,
  loading,
  emptyMessage = "Kayıt bulunamadı.",
  errorMessage,
  rowKey,
  onRowClick,
  selectedRowId,
  actionsHeader = "İşlemler",
  renderRowActions,
}: {
  columns: Array<{ key: string; label: string; align?: "left" | "right"; render?: (row: T) => ReactNode }>;
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  errorMessage?: string | null;
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  actionsHeader?: string;
  renderRowActions?: (row: T) => ReactNode;
}) {
  if (loading) {
    return <AdminLoadingState message="Yükleniyor..." />;
  }

  if (errorMessage) {
    return <AdminErrorState message={errorMessage} />;
  }

  if (!rows.length) {
    return <AdminEmptyState title="Boş" message={emptyMessage} />;
  }

  return (
    <AdminTableWrap>
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.align === "right" ? "admin-th--num" : undefined}>
                {col.label}
              </th>
            ))}
            {renderRowActions ? <th className="admin-th--actions">{actionsHeader}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowKey ? rowKey(row) : String((row as any).id ?? "");
            const selected = selectedRowId && id && selectedRowId === id;
            return (
              <tr
                key={id || JSON.stringify(row)}
                className={cx(onRowClick && "admin-table__row--clickable", selected && "is-selected")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.align === "right" ? "admin-td--num" : undefined}>
                    {col.render ? col.render(row) : String((row as any)[col.key] ?? "-")}
                  </td>
                ))}
                {renderRowActions ? <td className="admin-td--actions" onClick={(e) => e.stopPropagation()}>{renderRowActions(row)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </AdminTableWrap>
  );
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

export function AdminPagination({
  page,
  totalPages,
  onPrev,
  onNext,
  className,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const safePage = Math.min(Math.max(1, page || 1), safeTotalPages);
  return (
    <div className={cx("admin-filter-actions", className)}>
      <button className="admin-outline-button" type="button" onClick={onPrev} disabled={safePage <= 1}>
        Önceki
      </button>
      <AdminStatusBadge tone="info">
        Sayfa {safePage} / {safeTotalPages}
      </AdminStatusBadge>
      <button className="admin-outline-button" type="button" onClick={onNext} disabled={safePage >= safeTotalPages}>
        Sonraki
      </button>
    </div>
  );
}

export function AdminEmptyState({
  title = "Bilgi",
  message,
  tone = "neutral",
  actions,
  className,
}: {
  title?: string;
  message: string;
  tone?: AdminTone;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("admin-surface admin-empty-state admin-empty-state--rich", className)}>
      <AdminStatusBadge tone={tone}>{title}</AdminStatusBadge>
      <p>{message}</p>
      {actions ? <div className="admin-button-row">{actions}</div> : null}
    </div>
  );
}

export function AdminLoadingState({ message = "Yükleniyor..." }: { message?: string }) {
  return <AdminStateCard message={message} tone="info" />;
}

export function AdminErrorState({ message }: { message: string }) {
  return <AdminStateCard message={message} tone="danger" />;
}

export function AdminTabs<T extends string>({
  items,
  active,
  onChange,
  className,
}: {
  items: ReadonlyArray<{ key: T; label: string; disabled?: boolean }>;
  active: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("admin-tab-row", className)}>
      {items.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={cx("admin-tab", active === tab.key && "admin-tab--active")}
          disabled={tab.disabled}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function AdminIconButton({
  label,
  children,
  onClick,
  disabled,
  className,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type="button" className={cx("admin-icon-button", className)} aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function AdminButton({
  variant = "primary",
  loading,
  children,
  className,
  ...props
}: {
  variant?: AdminButtonVariant;
  loading?: boolean;
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const resolvedVariant =
    variant === "primary"
      ? "admin-primary-button"
      : variant === "outline"
        ? "admin-outline-button"
        : variant === "danger"
          ? "admin-primary-button admin-primary-button--danger"
          : variant === "text"
            ? "admin-text-button"
            : variant === "ghost"
              ? "admin-ghost-button"
              : "admin-secondary-button";

  return (
    <button {...props} type={props.type ?? "button"} className={cx(resolvedVariant, loading && "admin-button--loading", className)} disabled={props.disabled || loading}>
      {children}
    </button>
  );
}

export function AdminButtonLink({
  href,
  variant = "primary",
  children,
  className,
  target,
  rel,
}: {
  href: string;
  variant?: AdminButtonVariant;
  children: ReactNode;
  className?: string;
  target?: string;
  rel?: string;
}) {
  const resolvedVariant =
    variant === "primary"
      ? "admin-primary-button"
      : variant === "outline"
        ? "admin-outline-button"
        : variant === "danger"
          ? "admin-primary-button admin-primary-button--danger"
          : variant === "text"
            ? "admin-text-button"
            : variant === "ghost"
              ? "admin-ghost-button"
              : "admin-secondary-button";

  return (
    <a className={cx(resolvedVariant, className)} href={href} target={target} rel={rel}>
      {children}
    </a>
  );
}

export function AdminModal({
  open,
  size = "md",
  icon,
  kicker,
  title,
  description,
  subHeader,
  onClose,
  closeDisabled,
  footer,
  children,
}: {
  open: boolean;
  size?: AdminModalSize;
  icon?: ReactNode;
  kicker?: string;
  title: string;
  description?: ReactNode;
  subHeader?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;

  const sizeClass =
    size === "sm"
      ? "admin-modal-card--sm"
      : size === "lg"
        ? "admin-modal-card--lg"
        : size === "xl"
          ? "admin-modal-card--xl"
          : "admin-modal-card--md";

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <section className={cx("admin-modal-card", sizeClass)} onClick={(event) => event.stopPropagation()}>
        <header className="admin-modal__header">
          <div className="admin-modal__header-left">
            {icon ? <span className="admin-modal__icon" aria-hidden="true">{icon}</span> : null}
            {kicker ? <p className="admin-kicker">{kicker}</p> : null}
            <h3 className="admin-modal__title">{title}</h3>
            {description ? <p className="admin-modal__description">{description}</p> : null}
          </div>
          <button className="admin-icon-button admin-modal__close" type="button" onClick={onClose} disabled={closeDisabled} aria-label="Kapat">
            <AdminCloseIcon width={18} height={18} />
          </button>
        </header>

        {subHeader ? <div className="admin-modal__subheader">{subHeader}</div> : null}

        <div className="admin-modal__body">{children}</div>
        {footer ? <footer className="admin-modal__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  tone = "danger",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "info" | "success" | "neutral";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AdminModal
      open={open}
      size="sm"
      kicker="Onay"
      title={title}
      description={description}
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <div className="admin-modal__footer-content">
          <div className="admin-modal__footer-left">
            <button className="admin-text-button" type="button" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
          </div>
          <div className="admin-modal__footer-right">
            <button
              className={tone === "danger" ? "admin-primary-button admin-primary-button--danger" : "admin-primary-button"}
              type="button"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "İşleniyor..." : confirmLabel}
            </button>
          </div>
        </div>
      }
    >
      <div className="admin-confirm-body">{description ? null : <p className="admin-subtle-text">Bu işlem geri alınamaz.</p>}</div>
    </AdminModal>
  );
}

export function AdminRowActionMenu({
  open,
  items,
  onToggle,
  onClose,
  anchorLabel = "İşlemler",
  disabled,
}: {
  open: boolean;
  items: Array<{ key: string; label: string; tone?: AdminTone; disabled?: boolean; onSelect: () => void }>;
  onToggle: () => void;
  onClose: () => void;
  anchorLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="admin-row-menu">
      <button
        type="button"
        className="admin-icon-button"
        aria-label={anchorLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        ⋮
      </button>
      {open ? (
        <div
          className="admin-row-menu__panel"
          role="menu"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={cx("admin-row-menu__item", item.tone && `admin-row-menu__item--${item.tone}`)}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
