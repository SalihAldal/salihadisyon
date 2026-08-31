import { useMemo, useState, type ReactNode } from "react";
import { formatCurrency } from "../pos-helpers";
import {
  buildTicketSummary,
  formatTicketLabel,
  formatTicketSummaryLine,
  getOpenTicketsForTable,
  groupTicketItemsByCategory,
  groupTicketItemsByStation,
  type TicketGroupingMode,
  type TicketItemDetailLine,
} from "../ticket-hierarchy-utils";
import { formatTicketStatus, getTicketStatusTone } from "../waiter-pos-utils";

type TicketHierarchyViewProps = {
  ticket: Record<string, any> | null;
  tableTickets: Array<Record<string, any>>;
  tableLabel?: string;
  categories: Array<Record<string, any>>;
  productLookup: Map<string, Record<string, any>>;
  isWaiterMode: boolean;
  canMutateItems: boolean;
  selectedItemId: string | null;
  pending: boolean;
  onSelectTicket: (ticketId: string) => void;
  onCreateTicket?: () => void;
  onSelectItem: (itemId: string) => void;
  onChangeQuantity: (item: Record<string, any>, diff: number) => void;
  onRemoveItem: (item: Record<string, any>) => void;
  footer?: ReactNode;
};

function ItemDetailLines({ lines }: { lines: TicketItemDetailLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="ticket-hierarchy-item__details">
      {lines.map((line, index) => (
        <li key={`${line.kind}-${index}`} className={`ticket-hierarchy-item__detail ticket-hierarchy-item__detail--${line.kind}`}>
          {line.kind === "note" ? `Not: ${line.label}` : line.label}
        </li>
      ))}
    </ul>
  );
}

export function TicketHierarchyView({
  ticket,
  tableTickets,
  tableLabel,
  categories,
  productLookup,
  isWaiterMode,
  canMutateItems,
  selectedItemId,
  pending,
  onSelectTicket,
  onCreateTicket,
  onSelectItem,
  onChangeQuantity,
  onRemoveItem,
  footer,
}: TicketHierarchyViewProps) {
  const [groupingMode, setGroupingMode] = useState<TicketGroupingMode>("category");
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});

  const summary = useMemo(() => buildTicketSummary(ticket), [ticket]);
  const items = useMemo(() => ((ticket?.items as Array<Record<string, any>> | undefined) ?? []), [ticket]);
  const groups = useMemo(() => {
    if (!items.length) return [];
    return groupingMode === "station"
      ? groupTicketItemsByStation(items, productLookup, categories)
      : groupTicketItemsByCategory(items, productLookup, categories);
  }, [items, groupingMode, productLookup, categories]);

  const showTicketPicker = tableTickets.length > 1;

  function toggleItemExpanded(itemId: string) {
    setExpandedItemIds((current) => ({ ...current, [itemId]: !current[itemId] }));
  }

  return (
    <div className="ticket-hierarchy">
      {tableLabel ? (
        <div className="ticket-hierarchy__table-head">
          <strong>{tableLabel}</strong>
          {tableTickets.length > 0 ? <span>{tableTickets.length} acik adisyon</span> : null}
        </div>
      ) : null}

      {showTicketPicker ? (
        <div className="ticket-hierarchy__ticket-picker">
          <div className="ticket-hierarchy__ticket-picker-head">
            <span>Bu masada birden fazla adisyon var. Hangisi uzerinde calisacaksin?</span>
            {!isWaiterMode && onCreateTicket ? (
              <button type="button" className="ticket-hierarchy__new-ticket" onClick={onCreateTicket} disabled={pending}>
                + Yeni Adisyon
              </button>
            ) : null}
          </div>
          <div className="ticket-hierarchy__ticket-list">
            {tableTickets.map((tableTicket) => {
              const active = String(ticket?.id ?? "") === String(tableTicket.id);
              return (
                <button
                  key={String(tableTicket.id)}
                  type="button"
                  className={`ticket-hierarchy__ticket-card ${active ? "ticket-hierarchy__ticket-card--active" : ""}`}
                  disabled={pending}
                  onClick={() => onSelectTicket(String(tableTicket.id))}
                >
                  <div className="ticket-hierarchy__ticket-card-top">
                    <strong>{formatTicketLabel(tableTicket)}</strong>
                    <span className={`waiter-ticket-status waiter-ticket-status--${getTicketStatusTone(String(tableTicket.status ?? "OPEN"))}`}>
                      {formatTicketStatus(String(tableTicket.status ?? "OPEN"))}
                    </span>
                  </div>
                  <span>{formatCurrency(Number(tableTicket.grandTotal ?? 0))}</span>
                  <small>{formatTicketSummaryLine(buildTicketSummary(tableTicket))}</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!ticket ? (
        <div className="ticket-hierarchy__empty">Adisyon secilmedi.</div>
      ) : (
        <>
          <div className="ticket-hierarchy__ticket-head">
            <div>
              <h4>{formatTicketLabel(ticket)}</h4>
              <p>
                {`Masa: ${summary.tableName}${summary.customerName ? ` · Musteri: ${summary.customerName}` : ""}`}
              </p>
            </div>
            <span className={`waiter-ticket-status waiter-ticket-status--${summary.statusTone}`}>{summary.statusLabel}</span>
          </div>

          <div className="ticket-hierarchy__group-toggle">
            <button type="button" className={groupingMode === "category" ? "active" : ""} onClick={() => setGroupingMode("category")}>
              Kategori
            </button>
            <button type="button" className={groupingMode === "station" ? "active" : ""} onClick={() => setGroupingMode("station")}>
              Mutfak/Bar
            </button>
          </div>

          {!items.length ? (
            <div className="ticket-hierarchy__empty">Bu adisyonda urun yok.</div>
          ) : (
            <div className="ticket-hierarchy__groups">
              {groups.map((group) => (
                <section key={group.key} className="ticket-hierarchy__group">
                  <header className="ticket-hierarchy__group-head">
                    <strong>{group.emoji ? `${group.emoji} ` : ""}{group.title}</strong>
                    <span>{formatCurrency(group.subtotal)}</span>
                  </header>
                  <div className="ticket-hierarchy__group-items">
                    {group.items.map(({ item, detailLines, lineTotal }) => {
                      const itemId = String(item.id);
                      const expanded = expandedItemIds[itemId] ?? detailLines.length > 0;
                      const hasDetails = detailLines.length > 0;
                      return (
                        <article
                          key={itemId}
                          className={`ticket-hierarchy-item ${selectedItemId === itemId ? "ticket-hierarchy-item--active" : ""}`}
                          onClick={() => onSelectItem(itemId)}
                        >
                          <div className="ticket-hierarchy-item__row">
                            <div className="ticket-hierarchy-item__main">
                              <button
                                type="button"
                                className="ticket-hierarchy-item__toggle"
                                disabled={!hasDetails}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleItemExpanded(itemId);
                                }}
                              >
                                {hasDetails ? (expanded ? "▾" : "▸") : "•"}
                              </button>
                              <div>
                                <strong>{String(item.productName)} ×{Number(item.quantity)}</strong>
                                {item.addedByName ? <small className="ticket-hierarchy-item__staff">{String(item.addedByName)}</small> : null}
                                {expanded ? <ItemDetailLines lines={detailLines} /> : null}
                              </div>
                            </div>
                            <span className="ticket-hierarchy-item__price">{formatCurrency(lineTotal)}</span>
                          </div>
                          {!isWaiterMode ? (
                            <div className="ticket-hierarchy-item__actions">
                              <div className="quantity-stepper">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onChangeQuantity(item, -1);
                                  }}
                                  disabled={pending || !canMutateItems}
                                >
                                  -
                                </button>
                                <span>{Number(item.quantity)}</span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onChangeQuantity(item, 1);
                                  }}
                                  disabled={pending || !canMutateItems}
                                >
                                  +
                                </button>
                              </div>
                              <button
                                type="button"
                                className="ticket-item__remove"
                                disabled={pending || !canMutateItems}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemoveItem(item);
                                }}
                              >
                                Sil
                              </button>
                            </div>
                          ) : (
                            <div className="ticket-hierarchy-item__actions">
                              <span className="waiter-ticket-item__qty">Adet: {Number(item.quantity)}</span>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="ticket-hierarchy__summary">
            <div className="ticket-hierarchy__summary-row">
              <span>Ara Toplam</span>
              <strong>{formatCurrency(summary.subtotal)}</strong>
            </div>
            {summary.discountTotal > 0 ? (
              <div className="ticket-hierarchy__summary-row">
                <span>Indirim</span>
                <strong>-{formatCurrency(summary.discountTotal)}</strong>
              </div>
            ) : null}
            {summary.taxTotal > 0 ? (
              <div className="ticket-hierarchy__summary-row">
                <span>Vergi</span>
                <strong>{formatCurrency(summary.taxTotal)}</strong>
              </div>
            ) : null}
            {summary.paidTotal > 0 ? (
              <div className="ticket-hierarchy__summary-row">
                <span>Odenen</span>
                <strong>{formatCurrency(summary.paidTotal)}</strong>
              </div>
            ) : null}
            <div className="ticket-hierarchy__summary-row ticket-hierarchy__summary-row--total">
              <span>Toplam</span>
              <strong>{formatCurrency(summary.grandTotal)}</strong>
            </div>
          </div>

          {footer}
        </>
      )}
    </div>
  );
}

export function getTableTicketsFromList(
  allOpenTickets: Array<Record<string, any>>,
  tableId?: string | null,
) {
  return getOpenTicketsForTable(allOpenTickets, tableId);
}
