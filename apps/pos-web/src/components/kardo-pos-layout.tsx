import type { ReactNode } from "react";

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
      />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 2a8 8 0 1 0 4.9 14.32l4.39 4.39 1.41-1.41-4.39-4.39A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12Z"
      />
    </svg>
  );
}

export function PosTopbar({
  caption,
  search,
  onSearchChange,
  modeLabel,
  userLabel,
  onLogout,
}: {
  caption: string;
  search: string;
  onSearchChange: (value: string) => void;
  modeLabel?: string;
  userLabel?: string;
  onLogout?: () => void;
}) {
  return (
    <header className="pos-topbar">
      <div className="pos-topbar__brand">
        <strong className="pos-topbar__logo">Aldal Pos</strong>
        <span className="pos-topbar__mode">{modeLabel ?? "Satis"}</span>
      </div>

      <div className="pos-topbar__search">
        <IconSearch className="pos-topbar__search-icon" />
        <input
          aria-label="Urun arama"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Ürün ara"
        />
        <span className="pos-topbar__search-hint">Ctrl K</span>
      </div>

      <div className="pos-topbar__actions">
        <button type="button" className="pos-icon-btn" aria-label="Bildirimler">
          <span className="pos-icon-btn__badge" aria-hidden="true">
            3
          </span>
          <IconBell />
        </button>
        {onLogout ? (
          <button type="button" className="pos-logout-btn" onClick={onLogout}>
            Çıkış
          </button>
        ) : null}
        <div className="pos-user-pill" title={userLabel ?? caption}>
          <span className="pos-user-pill__avatar">{String(userLabel ?? caption ?? "M").trim().slice(0, 1).toUpperCase()}</span>
          <span className="pos-user-pill__meta">
            <span className="pos-user-pill__name">{userLabel ?? caption}</span>
            <span className="pos-user-pill__role">{modeLabel ? modeLabel.replace("Modu", "").trim() : "Personel"}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

export function CategoryStrip({ children }: { children: ReactNode }) {
  return <section className="category-row">{children}</section>;
}

export function SubcategoryStrip({ children }: { children: ReactNode }) {
  return <section className="subcategory-row">{children}</section>;
}

export function ProductGrid({ children }: { children: ReactNode }) {
  return <div className="product-grid">{children}</div>;
}

export function CatalogPane({ children }: { children: ReactNode }) {
  return <section className="catalog-shell">{children}</section>;
}

export function CatalogToolbar({ children }: { children: ReactNode }) {
  return <div className="catalog-toolbar">{children}</div>;
}

export function CatalogContent({ children }: { children: ReactNode }) {
  return <div className="catalog-content">{children}</div>;
}

export function TicketPanel({ children }: { children: ReactNode }) {
  return <aside className="ticket-panel">{children}</aside>;
}

export function TicketMain({ children }: { children: ReactNode }) {
  return <div className="ticket-main">{children}</div>;
}

export function TicketBottom({ children }: { children: ReactNode }) {
  return <div className="ticket-bottom">{children}</div>;
}

export function SummaryGrid({ children }: { children: ReactNode }) {
  return <div className="ticket-summary">{children}</div>;
}

export function BottomActionBar({ children }: { children: ReactNode }) {
  return <div className="ticket-actions ticket-actions--bottom">{children}</div>;
}

export function OperationsToolbar({ children }: { children: ReactNode }) {
  return <div className="pos-ops-toolbar">{children}</div>;
}

export function PaymentDrawer({
  open,
  title,
  eyebrow,
  compact = false,
  className,
  bodyClassName,
  hideHeader = false,
  closeLabel = "Kapat",
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow: string;
  compact?: boolean;
  className?: string;
  bodyClassName?: string;
  hideHeader?: boolean;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="pos-drawer-backdrop" onClick={onClose}>
      <div className={`pos-drawer ${compact ? "pos-drawer--compact" : ""} ${className ?? ""}`.trim()} onClick={(event) => event.stopPropagation()}>
        {!hideHeader ? (
          <div className="pos-drawer__header">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h3>{title}</h3>
            </div>
            <button type="button" aria-label="Kapat" onClick={onClose}>
              {closeLabel}
            </button>
          </div>
        ) : null}
        <div className={`pos-drawer__body ${hideHeader ? "pos-drawer__body--chromeless" : ""} ${bodyClassName ?? ""}`.trim()}>{children}</div>
      </div>
    </div>
  );
}
