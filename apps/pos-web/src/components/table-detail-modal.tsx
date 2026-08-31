import { useMemo, useState } from "react";
import { formatCurrency, formatTableDuration } from "../pos-helpers";

type TabKey = "orders" | "ticket" | "payment" | "notes";

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

const icons = {
  print: "M6 8V3h12v5h2v8h-4v4H8v-4H4V8h2Zm2-3v3h8V5H8Zm8 13v-4H8v4h8Z",
  note: "M4 4h16v14H7l-3 3V4Zm4 4v2h8V8H8Zm0 4v2h6v-2H8Z",
  history:
    "M12 5a7 7 0 1 1-6.32 4H3l3.5-3.5L10 9H7.68A5 5 0 1 0 12 7v2l3-3-3-3v2Z",
  close: "M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z",
  kebab: "M12 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4a2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4Z",
  plus: "M19 11H13V5h-2v6H5v2h6v6h2v-6h6v-2Z",
  clock: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h5v-2h-4V6h-2v7Z",
  users:
    "M16 11a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm0 2c-3.33 0-6 1.34-6 4v1h12v-1c0-2.66-2.67-4-6-4Z",
  money: "M12 1a11 11 0 1 0 11 11A11 11 0 0 0 12 1Zm1 18h-2v-1.07a5.3 5.3 0 0 1-3.3-1.64l1.45-1.45A3.6 3.6 0 0 0 11 16.2V13.8l-.6-.2c-1.9-.6-3.4-1.3-3.4-3.3a3.6 3.6 0 0 1 3-3.5V6h2v.77a5 5 0 0 1 2.87 1.33l-1.3 1.55A3.2 3.2 0 0 0 13 8.8V11l.8.26c2 .66 3.2 1.5 3.2 3.2a3.7 3.7 0 0 1-3 3.6V19Zm-2-9.6v2l.4.14c1.2.4 1.6.6 1.6 1.2s-.5 1-1.4 1.2a2.2 2.2 0 0 1-.6.08V9.4c.1 0 .3 0 .4.0Zm2 .7v2.8c.7-.2 1.1-.6 1.1-1.1s-.3-.8-1.1-1.1Z",
} as const;

function money(value: unknown) {
  return formatCurrency(Number(value ?? 0));
}

function readItemPrice(item: Record<string, any>) {
  const unit = Number(item.unitPrice ?? item.price ?? item.unit_price ?? 0);
  const qty = Number(item.quantity ?? 0);
  const total = Number(item.lineTotal ?? item.total ?? item.totalPrice ?? unit * qty);
  return { unit, total, qty };
}

export function PosTableDetailModal({
  ticket,
  tableLabel,
  statusLabel,
  pending,
  isWaiterMode,
  canMutateItems,
  onClose,
  onOpenCatalog,
  onOpenActions,
  onOpenHistory,
  onOpenNote,
  onPrint,
  onSendToKitchen,
  onRequestBill,
  billRequested,
  onOpenPayment,
  onChangeQuantity,
  onRemoveItem,
}: {
  ticket: Record<string, any> | null;
  tableLabel: string;
  statusLabel?: string | null;
  pending: boolean;
  isWaiterMode: boolean;
  canMutateItems: boolean;
  onClose: () => void;
  onOpenCatalog: () => void;
  onOpenActions: () => void;
  onOpenHistory: () => void;
  onOpenNote: () => void;
  onPrint: () => void;
  onSendToKitchen: () => void;
  onRequestBill: () => void;
  billRequested: boolean;
  onOpenPayment: () => void;
  onChangeQuantity: (item: Record<string, any>, diff: number) => void;
  onRemoveItem: (item: Record<string, any>) => void;
}) {
  const [tab, setTab] = useState<TabKey>("orders");
  const items = useMemo(() => ((ticket?.items as Array<Record<string, any>> | undefined) ?? []), [ticket]);
  const noteItems = useMemo(() => {
    const notes: Array<{ key: string; label: string; meta?: string }> = [];
    const ticketNote = String(ticket?.note ?? ticket?.notes ?? "").trim();
    if (ticketNote) {
      notes.push({ key: "ticket-note", label: ticketNote, meta: "Adisyon Notu" });
    }
    for (const item of items) {
      const itemId = String(item.id ?? item.productId ?? item.productName ?? Math.random());
      const rawNotes = Array.isArray(item.notes) ? item.notes : item.note ? [item.note] : [];
      for (const [idx, raw] of rawNotes.entries()) {
        const label = String(raw ?? "").trim();
        if (!label) continue;
        notes.push({
          key: `${itemId}-${idx}`,
          label,
          meta: String(item.productName ?? item.name ?? "Ürün"),
        });
      }
    }
    return notes;
  }, [items, ticket]);
  const openedAt = ticket?.openedAt ? String(ticket.openedAt) : null;
  const duration = openedAt ? formatTableDuration(openedAt) : null;
  const coverCount = Number(ticket?.coverCount ?? 0) || null;
  const grandTotal = Number(ticket?.grandTotal ?? 0);
  const paidTotal = Number(ticket?.paidTotal ?? ticket?.paidAmount ?? 0);
  const remaining = Math.max(grandTotal - paidTotal, 0);

  return (
    <div className="pos-table-modal">
      <header className="pos-table-modal__header">
        <div className="pos-table-modal__head-left">
          <p className="pos-table-modal__eyebrow">MASA DETAY</p>
          <div className="pos-table-modal__head-title">
            <h2>{tableLabel}</h2>
            {statusLabel ? <span className="pos-pill pos-pill--danger">{statusLabel}</span> : null}
          </div>
        </div>

        <div className="pos-table-modal__head-actions">
          <button type="button" className="pos-ghost-btn" onClick={onPrint} disabled={pending}>
            <Icon d={icons.print} /> {isWaiterMode ? "Mutfak" : "Yazdır"}
          </button>
          <button type="button" className="pos-ghost-btn" onClick={onOpenNote} disabled={pending}>
            <Icon d={icons.note} /> Not Ekle
          </button>
          {!isWaiterMode ? (
            <button type="button" className="pos-ghost-btn" onClick={onOpenHistory} disabled={pending}>
              <Icon d={icons.history} /> Geçmiş
            </button>
          ) : null}
          <button type="button" className="pos-icon-x" aria-label="Kapat" onClick={onClose}>
            <Icon d={icons.close} />
          </button>
        </div>
      </header>

      <section className="pos-table-modal__meta">
        <div className="pos-meta-card">
          <span className="pos-meta-card__label">Adisyon No</span>
          <strong className="pos-meta-card__value">{String(ticket?.ticketName ?? ticket?.id ?? "-")}</strong>
        </div>
        <div className="pos-meta-card">
          <span className="pos-meta-card__label">Açılış</span>
          <strong className="pos-meta-card__value">{openedAt ? new Date(openedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "-"}</strong>
        </div>
        <div className="pos-meta-card">
          <span className="pos-meta-card__label">Süre</span>
          <strong className="pos-meta-card__value">{duration ?? "-"}</strong>
        </div>
        <div className="pos-meta-card">
          <span className="pos-meta-card__label">Kişi</span>
          <strong className="pos-meta-card__value">{coverCount ? String(coverCount) : "-"}</strong>
        </div>
        <div className="pos-meta-card pos-meta-card--total">
          <span className="pos-meta-card__label">Toplam</span>
          <strong className="pos-meta-card__value">{money(grandTotal)}</strong>
          {!isWaiterMode ? (
            <button type="button" className="pos-kebab" aria-label="Daha fazla" onClick={onOpenActions}>
              <Icon d={icons.kebab} />
            </button>
          ) : null}
        </div>
      </section>

      <nav className="pos-tabs" aria-label="Masa sekmeleri">
        <button type="button" className={`pos-tab ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          Siparişler
        </button>
        {!isWaiterMode ? (
          <button type="button" className={`pos-tab ${tab === "ticket" ? "active" : ""}`} onClick={() => setTab("ticket")}>
            Adisyon
          </button>
        ) : null}
        {!isWaiterMode ? (
          <button type="button" className={`pos-tab ${tab === "payment" ? "active" : ""}`} onClick={() => setTab("payment")}>
            Ödeme
          </button>
        ) : null}
        <button type="button" className={`pos-tab ${tab === "notes" ? "active" : ""}`} onClick={() => setTab("notes")}>
          Notlar
        </button>
      </nav>

      {tab === "orders" ? (
        <div className="pos-table-modal__content">
          <section className="pos-card">
            <header className="pos-card__head">
              <strong>Siparişler</strong>
              <div className="pos-card__head-actions">
                <button type="button" className="pos-icon-btn-sm" aria-label="Sipariş ekle" onClick={onOpenCatalog} disabled={pending}>
                  <Icon d={icons.plus} />
                </button>
                {!isWaiterMode ? (
                  <button type="button" className="pos-icon-btn-sm" aria-label="Menü" onClick={onOpenActions}>
                    <Icon d={icons.kebab} />
                  </button>
                ) : null}
              </div>
            </header>

            <div className="pos-chip-row" aria-label="Sipariş filtreleri">
              {["Tümü", "Yemek", "İçecek", "Tatlı", "Diğer"].map((label) => (
                <button key={label} type="button" className={`pos-chip ${label === "Tümü" ? "active" : ""}`} disabled>
                  {label}
                </button>
              ))}
            </div>

            <div className="pos-orders-table">
              <div className="pos-orders-table__head">
                <span>Ürün</span>
                <span>Miktar</span>
                <span>Birim Fiyat</span>
                <span>Tutar</span>
                <span />
              </div>
              {items.length === 0 ? <div className="pos-empty">Henüz sipariş yok.</div> : null}
              {items.map((item) => {
                const { unit, total, qty } = readItemPrice(item);
                const name = String(item.productName ?? item.name ?? "Ürün");
                return (
                  <div key={String(item.id ?? name)} className="pos-orders-table__row">
                    <div className="pos-orders-table__cell pos-orders-table__product">
                      <strong>{name}</strong>
                      {item.categoryName ? <small>{String(item.categoryName)}</small> : null}
                    </div>
                    <div className="pos-orders-table__cell">
                      <div className="pos-stepper">
                        <button type="button" onClick={() => onChangeQuantity(item, -1)} disabled={isWaiterMode || pending || !canMutateItems}>
                          –
                        </button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => onChangeQuantity(item, 1)} disabled={pending || !canMutateItems}>
                          +
                        </button>
                      </div>
                    </div>
                    <div className="pos-orders-table__cell">{money(unit)}</div>
                    <div className="pos-orders-table__cell pos-orders-table__total">{money(total)}</div>
                    <div className="pos-orders-table__cell">
                      <button type="button" className="pos-row-kebab" aria-label="Satır işlemleri" onClick={() => onRemoveItem(item)} disabled={isWaiterMode || pending || !canMutateItems}>
                        <Icon d={icons.kebab} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="pos-side">
            <section className="pos-card">
              <header className="pos-card__head">
                <strong>Sipariş Özeti</strong>
              </header>
              <div className="pos-summary">
                <div className="pos-summary__row">
                  <span>Ara Toplam</span>
                  <strong>{money(ticket?.subtotal ?? grandTotal)}</strong>
                </div>
                <div className="pos-summary__row">
                  <span>İndirim</span>
                  <strong className="pos-summary__muted">-{money(ticket?.discountTotal ?? 0)}</strong>
                </div>
                <div className="pos-summary__row">
                  <span>Hizmet Bedeli (%10)</span>
                  <strong>{money(ticket?.serviceCharge ?? 0)}</strong>
                </div>
                <div className="pos-summary__row">
                  <span>KDV (%10)</span>
                  <strong>{money(ticket?.taxTotal ?? 0)}</strong>
                </div>
                <div className="pos-summary__divider" />
                <div className="pos-summary__row pos-summary__row--total">
                  <span>Genel Toplam</span>
                  <strong>{money(grandTotal)}</strong>
                </div>
                <div className="pos-summary__row">
                  <span>Ödenen</span>
                  <strong className="pos-summary__muted">{money(paidTotal)}</strong>
                </div>
                <div className="pos-summary__row pos-summary__row--remaining">
                  <span>Kalan</span>
                  <strong>{money(remaining)}</strong>
                </div>
              </div>
            </section>

            <section className="pos-card">
              <header className="pos-card__head">
                <strong>Hızlı İşlemler</strong>
              </header>
              <div className="pos-quick-grid">
                <button type="button" className="pos-quick" onClick={onOpenActions} disabled={pending}>
                  <span className="pos-quick__icon">
                    <Icon d={icons.plus} />
                  </span>
                  Ürün Ekle
                </button>
                <button type="button" className="pos-quick" onClick={onOpenActions} disabled={pending}>
                  <span className="pos-quick__icon">
                    <Icon d={icons.money} />
                  </span>
                  İndirim Uygula
                </button>
                <button type="button" className="pos-quick" onClick={onOpenNote} disabled={pending}>
                  <span className="pos-quick__icon">
                    <Icon d={icons.note} />
                  </span>
                  Not Ekle
                </button>
                <button type="button" className="pos-quick" onClick={onPrint} disabled={pending}>
                  <span className="pos-quick__icon">
                    <Icon d={icons.print} />
                  </span>
                  Yazdır
                </button>
              </div>
            </section>
          </aside>
        </div>
      ) : tab === "ticket" ? (
        <div className="pos-table-modal__content pos-table-modal__content--single">
          <section className="pos-card">
            <header className="pos-card__head">
              <strong>Adisyon</strong>
            </header>
            <div className="pos-ticket-grid">
              <div className="pos-ticket-kv">
                <span>Adisyon No</span>
                <strong>{String(ticket?.ticketName ?? ticket?.id ?? "-")}</strong>
              </div>
              <div className="pos-ticket-kv">
                <span>Masa</span>
                <strong>{tableLabel}</strong>
              </div>
              <div className="pos-ticket-kv">
                <span>Durum</span>
                <strong>{statusLabel ?? "-"}</strong>
              </div>
              <div className="pos-ticket-kv">
                <span>Açılış</span>
                <strong>{openedAt ? new Date(openedAt).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "-"}</strong>
              </div>
              <div className="pos-ticket-kv">
                <span>Süre</span>
                <strong>{duration ?? "-"}</strong>
              </div>
              <div className="pos-ticket-kv">
                <span>Kişi</span>
                <strong>{coverCount ? String(coverCount) : "-"}</strong>
              </div>
            </div>
          </section>

          <section className="pos-card">
            <header className="pos-card__head">
              <strong>Özet</strong>
            </header>
            <div className="pos-summary">
              <div className="pos-summary__row">
                <span>Ara Toplam</span>
                <strong>{money(ticket?.subtotal ?? grandTotal)}</strong>
              </div>
              <div className="pos-summary__row">
                <span>İndirim</span>
                <strong className="pos-summary__muted">-{money(ticket?.discountTotal ?? 0)}</strong>
              </div>
              <div className="pos-summary__row">
                <span>Hizmet</span>
                <strong>{money(ticket?.serviceCharge ?? 0)}</strong>
              </div>
              <div className="pos-summary__row">
                <span>KDV</span>
                <strong>{money(ticket?.taxTotal ?? 0)}</strong>
              </div>
              <div className="pos-summary__divider" />
              <div className="pos-summary__row pos-summary__row--total">
                <span>Genel Toplam</span>
                <strong>{money(grandTotal)}</strong>
              </div>
              <div className="pos-summary__row">
                <span>Ödenen</span>
                <strong className="pos-summary__muted">{money(paidTotal)}</strong>
              </div>
              <div className="pos-summary__row pos-summary__row--remaining">
                <span>Kalan</span>
                <strong>{money(remaining)}</strong>
              </div>
            </div>
          </section>
        </div>
      ) : tab === "payment" ? (
        <div className="pos-table-modal__content pos-table-modal__content--single">
          <section className="pos-card">
            <header className="pos-card__head">
              <strong>Ödeme</strong>
            </header>
            <div className="pos-payment-stack">
              <div className="pos-payment-hero">
                <div>
                  <span className="pos-payment-hero__label">Kalan Tutar</span>
                  <strong className="pos-payment-hero__value">{money(remaining)}</strong>
                </div>
                <button type="button" className="pos-footer-primary" onClick={onOpenPayment} disabled={pending || !ticket}>
                  Ödeme Al
                </button>
              </div>

              <div className="pos-payment-split">
                <div className="pos-payment-split__head">
                  <strong>Böl & Paylaş</strong>
                  <span>Ödeme ekranında kullanılacak</span>
                </div>
                <div className="pos-payment-split__grid">
                  <button type="button" className="pos-quick" onClick={onOpenPayment} disabled={pending || !ticket}>
                    <span className="pos-quick__icon">
                      <Icon d={icons.money} />
                    </span>
                    Eşit Böl
                  </button>
                  <button type="button" className="pos-quick" onClick={onOpenPayment} disabled={pending || !ticket}>
                    <span className="pos-quick__icon">
                      <Icon d={icons.users} />
                    </span>
                    Kişiye Böl
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="pos-card">
            <header className="pos-card__head">
              <strong>Ödeme Özeti</strong>
            </header>
            <div className="pos-summary">
              <div className="pos-summary__row pos-summary__row--total">
                <span>Genel Toplam</span>
                <strong>{money(grandTotal)}</strong>
              </div>
              <div className="pos-summary__row">
                <span>Ödenen</span>
                <strong className="pos-summary__muted">{money(paidTotal)}</strong>
              </div>
              <div className="pos-summary__row pos-summary__row--remaining">
                <span>Kalan</span>
                <strong>{money(remaining)}</strong>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="pos-table-modal__content pos-table-modal__content--single">
          <section className="pos-card">
            <header className="pos-card__head">
              <strong>Notlar</strong>
              <div className="pos-card__head-actions">
                <button type="button" className="pos-ghost-btn" onClick={onOpenNote} disabled={pending}>
                  <Icon d={icons.note} /> Not Ekle
                </button>
              </div>
            </header>
            <div className="pos-notes">
              {noteItems.length === 0 ? <div className="pos-empty">Not bulunamadı.</div> : null}
              {noteItems.map((note) => (
                <div key={note.key} className="pos-note-row">
                  <div>
                    <strong>{note.label}</strong>
                    {note.meta ? <small>{note.meta}</small> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pos-card">
            <header className="pos-card__head">
              <strong>Hızlı</strong>
            </header>
            <div className="pos-quick-grid">
              <button type="button" className="pos-quick" onClick={onOpenNote} disabled={pending}>
                <span className="pos-quick__icon">
                  <Icon d={icons.note} />
                </span>
                Not Ekle
              </button>
              <button type="button" className="pos-quick" onClick={onPrint} disabled={pending}>
                <span className="pos-quick__icon">
                  <Icon d={icons.print} />
                </span>
                Yazdır
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className="pos-table-modal__footer">
        {isWaiterMode ? (
          <>
            <button type="button" className="pos-footer-menu" onClick={onOpenCatalog} disabled={pending}>
              Ürün Ekle
            </button>
            <button type="button" className="pos-footer-secondary" onClick={onSendToKitchen} disabled={pending || !ticket}>
              Mutfağa Gönder
            </button>
            <button type="button" className="pos-footer-primary" onClick={onRequestBill} disabled={pending || !ticket || billRequested}>
              {billRequested ? "Hesap İstendi" : "Hesap İste"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="pos-footer-menu" onClick={onOpenActions}>
              Masa İşlemleri
            </button>
            <button type="button" className="pos-footer-secondary" onClick={onOpenActions} disabled>
              Adisyona Dönüştür
            </button>
            <button type="button" className="pos-footer-primary" onClick={onOpenPayment} disabled={pending || !ticket}>
              Ödeme Al
            </button>
          </>
        )}
        <div className="pos-footer-mobile">
          <button type="button" className="pos-footer-mobile__summary" onClick={onOpenActions}>
            <span>Kalan</span>
            <strong>{money(remaining)}</strong>
          </button>
          <button type="button" className="pos-footer-mobile__cta" onClick={onOpenPayment} disabled={pending || !ticket}>
            Ödeme Al
          </button>
        </div>
      </footer>
    </div>
  );
}

