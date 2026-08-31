import { useEffect, useState } from "react";
import { formatCurrency, formatTableDuration } from "../pos-helpers";
import { getOpenTicketsForTable } from "../ticket-hierarchy-utils";
import { getTableLobbyMeta, isTableBusy } from "../waiter-pos-utils";

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

  const busyCount = tables.filter((table) => isTableBusy(table)).length;

  return (
    <div className="waiter-lobby">
      <div className="waiter-lobby__header">
        <h3>{floorLabel}</h3>
        <span className="waiter-lobby__hint">
          {tables.length} masa · {busyCount} dolu · {tables.length - busyCount} bos
        </span>
      </div>
      <div className="waiter-lobby__grid">
        {tables.map((table) => {
          const openTicketCount = getOpenTicketsForTable(openTickets, String(table.id)).length;
          const meta = getTableLobbyMeta(table, openTicketCount);
          return (
            <button
              key={String(table.id)}
              type="button"
              className={`waiter-table-card ${meta.busy ? "waiter-table-card--busy" : "waiter-table-card--free"}`}
              disabled={pending}
              onClick={() => onSelectTable(table)}
            >
              <div className="waiter-table-card__top">
                <strong>{meta.tableCode}</strong>
                <span className={`waiter-table-card__badge waiter-table-card__badge--${meta.busy ? "busy" : "free"}`}>
                  {meta.statusLabel}
                </span>
              </div>
              <span className="waiter-table-card__name">{meta.tableLabel}</span>
              {meta.busy ? (
                <div className="waiter-table-card__ticket">
                  {meta.openTicketCount > 1 ? <span>{meta.openTicketCount} adisyon</span> : null}
                  <span className={`waiter-ticket-status waiter-ticket-status--${meta.ticketStatusTone}`}>
                    {meta.ticketStatusLabel}
                  </span>
                  {meta.openedAt ? <span>{formatTableDuration(meta.openedAt, nowMs) ?? "-"}</span> : null}
                  {meta.coverCount ? <span>{meta.coverCount} kisi</span> : null}
                  {meta.billRequested ? <span className="waiter-table-card__bill">Hesap istendi</span> : null}
                  <span>{meta.itemCount} urun</span>
                  <strong>{formatCurrency(meta.grandTotal)}</strong>
                </div>
              ) : (
                <span className="waiter-table-card__cta">Adisyon ac</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
