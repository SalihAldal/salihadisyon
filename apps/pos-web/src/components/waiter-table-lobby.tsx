import { useEffect, useState } from "react";
import { formatCurrency, formatTableDuration } from "../pos-helpers";
import { getOpenTicketsForTable } from "../ticket-hierarchy-utils";
import { getTableLobbyMeta } from "../waiter-pos-utils";

function IconStore({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16l-1.2 6H5.2L4 4Zm2 8h12v8H6v-8Zm2 2v4h3v-4H8Zm5 0v4h3v-4h-3Z"
      />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 11a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm0 2c-3.33 0-6 1.34-6 4v1h12v-1c0-2.66-2.67-4-6-4Zm8 0c-.4 0-.78.03-1.14.08A5.2 5.2 0 0 1 18 18v1h6v-1c0-2.66-2.67-4-6-4Z"
      />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h5v-2h-4V6h-2v7Z" />
    </svg>
  );
}

function IconReceipt({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h12v20l-2-1l-2 1l-2-1l-2 1l-2-1l-2 1V2Zm3 5h6V5H9v2Zm0 4h6V9H9v2Zm0 4h6v-2H9v2Z"
      />
    </svg>
  );
}

type WaiterTableLobbyProps = {
  floorLabel: string;
  tables: Array<Record<string, any>>;
  openTickets?: Array<Record<string, any>>;
  loading: boolean;
  pending: boolean;
  onSelectTable: (table: Record<string, any>) => void;
};

export function WaiterTableLobby({ floorLabel, tables, openTickets = [], loading, pending, onSelectTable }: WaiterTableLobbyProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && tables.length === 0) {
    return (
      <div className="waiter-lobby">
        <div className="waiter-lobby__header">
          <h3>{floorLabel}</h3>
          <span className="waiter-lobby__hint">Masalar yukleniyor...</span>
        </div>
        <div className="waiter-lobby__loading">Masalar yukleniyor...</div>
      </div>
    );
  }

  if (!tables.length) {
    return (
      <div className="waiter-lobby">
        <div className="waiter-lobby__header">
          <h3>{floorLabel}</h3>
        </div>
        <div className="waiter-lobby__empty">Bu katta tanimli masa bulunamadi.</div>
      </div>
    );
  }

  const counts = tables.reduce(
    (acc, table) => {
      const status = String(table.status ?? "").toUpperCase();
      const meta = getTableLobbyMeta(table, getOpenTicketsForTable(openTickets, String(table.id)).length);
      if (status === "RESERVED") {
        acc.reserved += 1;
        return acc;
      }
      if (status === "CLEANING" || status === "CLEANUP" || status === "DIRTY") {
        acc.cleaning += 1;
        return acc;
      }
      if (meta.busy || status === "BUSY" || status === "OCCUPIED") {
        acc.busy += 1;
        return acc;
      }
      acc.open += 1;
      return acc;
    },
    { total: tables.length, busy: 0, open: 0, reserved: 0, cleaning: 0 },
  );

  return (
    <div className="pos-tables-screen">
      <div className="pos-tables-screen__header">
        <div className="pos-tables-screen__title">
          <h2>{floorLabel.split("/")[0].trim()}</h2>
          <span>/ Masalar</span>
        </div>

        <div className="pos-stats-row">
          <div className="pos-stat-card pos-stat-card--neutral">
            <span className="pos-stat-card__icon">
              <IconStore />
            </span>
            <span className="pos-stat-card__label">Toplam</span>
            <strong className="pos-stat-card__value">{counts.total}</strong>
          </div>
          <div className="pos-stat-card pos-stat-card--danger">
            <span className="pos-stat-card__icon">
              <IconUsers />
            </span>
            <span className="pos-stat-card__label">Dolu</span>
            <strong className="pos-stat-card__value">{counts.busy}</strong>
          </div>
          <div className="pos-stat-card pos-stat-card--success">
            <span className="pos-stat-card__icon">
              <IconUsers />
            </span>
            <span className="pos-stat-card__label">Açık</span>
            <strong className="pos-stat-card__value">{counts.open}</strong>
          </div>
          <div className="pos-stat-card pos-stat-card--warning">
            <span className="pos-stat-card__icon">
              <IconClock />
            </span>
            <span className="pos-stat-card__label">Rezerve</span>
            <strong className="pos-stat-card__value">{counts.reserved}</strong>
          </div>
          <div className="pos-stat-card pos-stat-card--purple">
            <span className="pos-stat-card__icon">
              <IconClock />
            </span>
            <span className="pos-stat-card__label">Temizlik</span>
            <strong className="pos-stat-card__value">{counts.cleaning}</strong>
          </div>
        </div>
      </div>

      <div className="pos-table-grid">
        {tables.map((table) => {
          const openTicketCount = getOpenTicketsForTable(openTickets, String(table.id)).length;
          const meta = getTableLobbyMeta(table, openTicketCount);
          const status = String(table.status ?? "").toUpperCase();
          const cardTone =
            status === "RESERVED"
              ? "reserved"
              : status === "CLEANING" || status === "CLEANUP" || status === "DIRTY"
                ? "cleaning"
                : meta.busy
                  ? "busy"
                  : "open";
          return (
            <button
              key={String(table.id)}
              type="button"
              className={`pos-table-card pos-table-card--${cardTone}`}
              disabled={pending}
              onClick={() => onSelectTable(table)}
            >
              <div className="pos-table-card__top">
                <strong className="pos-table-card__code">{meta.tableCode}</strong>
                <span className={`pos-table-card__badge pos-table-card__badge--${cardTone}`}>
                  {cardTone === "reserved" ? "Rezerve" : cardTone === "cleaning" ? "Temizlik" : meta.busy ? "Dolu" : "Açık"}
                </span>
              </div>
              <span className="pos-table-card__area">{String(table.areaName ?? table.area ?? "Salon")}</span>

              <div className="pos-table-card__metrics">
                <div className="pos-metric">
                  <IconClock className="pos-metric__icon" />
                  <span>{meta.openedAt ? formatTableDuration(meta.openedAt, nowMs) ?? "—" : "—"}</span>
                </div>
                <span className="pos-metric__sep" aria-hidden="true">
                  |
                </span>
                <div className="pos-metric">
                  <IconUsers className="pos-metric__icon" />
                  <span>{meta.coverCount ? String(meta.coverCount) : "—"}</span>
                </div>
                <span className="pos-metric__sep" aria-hidden="true">
                  |
                </span>
                <div className="pos-metric">
                  <IconReceipt className="pos-metric__icon" />
                  <span>{meta.busy ? String(meta.itemCount) : "0"}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
