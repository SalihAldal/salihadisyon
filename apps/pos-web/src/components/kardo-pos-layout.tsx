import type { ReactNode } from "react";

export function PosTopbar({
  caption,
  search,
  onSearchChange,
  modeLabel,
  userLabel,
}: {
  caption: string;
  search: string;
  onSearchChange: (value: string) => void;
  modeLabel?: string;
  userLabel?: string;
}) {
  return (
    <header className="pos-topbar">
      <div className="pos-topbar__brand">
        <strong className="pos-topbar__logo">Aldal Pos</strong>
        <span className="pos-topbar__meta">{modeLabel ?? "Satis"}</span>
      </div>
      <div className="pos-topbar__tools">
        <div className="pos-search">
          <span className="pos-search__label">Ara</span>
          <input aria-label="Urun arama" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Ürün ara" />
        </div>
        <div className="pos-session">
          {modeLabel ? <span className="pos-mode-chip">{modeLabel}</span> : null}
          <span className="pos-user-chip">{userLabel ?? caption}</span>
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
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="pos-drawer-backdrop" onClick={onClose}>
      <div className={`pos-drawer ${compact ? "pos-drawer--compact" : ""} ${className ?? ""}`.trim()} onClick={(event) => event.stopPropagation()}>
        <div className="pos-drawer__header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h3>{title}</h3>
          </div>
          <button type="button" aria-label="Kapat" onClick={onClose}>{closeLabel}</button>
        </div>
        <div className={`pos-drawer__body ${bodyClassName ?? ""}`.trim()}>{children}</div>
      </div>
    </div>
  );
}
