"use client";

import { AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../../ui/admin-ui";
import { formatTrDateTimeSafe, formatTryCurrencySafe } from "../../../lib/utils/admin-format";
import { EmployeeSelectField, EmployeeTextField, EmployeeTextareaField } from "./employee-editor-fields";
import type { EmployeePaymentFormData, EmployeeSelectOption } from "./types";

const PAYMENT_METHOD_OPTIONS: EmployeeSelectOption[] = [
  { label: "Nakit", value: "CASH" },
  { label: "Kredi Karti", value: "CREDIT_CARD" },
  { label: "Yemek Karti", value: "MEAL_CARD" },
  { label: "Hediye Kart / Cek", value: "GIFT_CARD" },
  { label: "Havale / EFT", value: "BANK_TRANSFER" },
  { label: "Diger", value: "OTHER" },
];

export function PaymentsTab({
  summary,
  items,
  loading,
  showThisMonthOnly,
  onToggleThisMonth,
  paymentForm,
  onPaymentFormChange,
  accountOptions,
  paymentModalMode,
  selectedPayment,
  onOpenCreatePayment,
  onOpenCreateReceivable,
  onOpenPaymentView,
  onOpenPaymentEdit,
  onClosePaymentModal,
  onSubmitPayment,
  onDeletePayment,
  creating,
}: {
  summary: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  loading: boolean;
  showThisMonthOnly: boolean;
  onToggleThisMonth: () => void;
  paymentForm: EmployeePaymentFormData;
  accountOptions: EmployeeSelectOption[];
  onPaymentFormChange: (next: EmployeePaymentFormData) => void;
  paymentModalMode: "create" | "edit" | "view" | null;
  selectedPayment: Record<string, unknown> | null;
  onOpenCreatePayment: () => void;
  onOpenCreateReceivable: () => void;
  onOpenPaymentView: (item: Record<string, unknown>) => void;
  onOpenPaymentEdit: (item: Record<string, unknown>) => void;
  onClosePaymentModal: () => void;
  onSubmitPayment: () => void;
  onDeletePayment: (item: Record<string, unknown>) => void;
  creating?: boolean;
}) {
  const lastPayment = summary.lastPayment as Record<string, unknown> | null;
  const totalRequired = summary.totalRequired ?? 0;
  const totalPaid = summary.totalPaid ?? summary.totalAmount ?? 0;
  const remainingAmount = summary.remainingAmount ?? 0;
  const paymentCount = summary.paymentCount ?? 0;
  const receivableCount = summary.receivableCount ?? 0;
  const readOnly = paymentModalMode === "view";
  const modalTitle =
    paymentModalMode === "edit"
      ? "Hareketi Duzenle"
      : paymentModalMode === "view"
        ? "Hareket Detayi"
        : paymentForm.movementType === "RECEIVABLE"
          ? "Yeni Alacak"
          : "Yeni Odeme";

  return (
    <div className="admin-employee-editor__content-stack">
      <AdminStatsGrid className="admin-employee-editor__stats">
        <AdminStatCard label="Toplam Yapilmasi Gereken" value={formatTryCurrencySafe(totalRequired)} helper={`${receivableCount} alacak`} />
        <AdminStatCard label="Toplam Yapilan Odeme" value={formatTryCurrencySafe(totalPaid)} helper={`${paymentCount} odeme`} />
        <AdminStatCard label="Kalan Tutar" value={formatTryCurrencySafe(remainingAmount)} helper={showThisMonthOnly ? "Bu aya gore filtreli" : "Tum hareketler"} />
        <AdminStatCard
          label="Son Odeme"
          value={lastPayment ? formatTryCurrencySafe(lastPayment.amount) : "-"}
          helper={lastPayment ? formatTrDateTimeSafe(String(lastPayment.paymentDate ?? "")) : "Henuz odeme yok"}
        />
      </AdminStatsGrid>

      <section className="admin-surface admin-employee-editor__payment-form">
        <div className="admin-section-head">
          <div>
            <h3>Odeme Yonetimi</h3>
            <p className="admin-subtle-text">Odeme ve alacak hareketlerini tek merkezden yonet.</p>
          </div>
          <div className="admin-button-row">
            <button type="button" className={`admin-outline-button ${showThisMonthOnly ? "admin-outline-button--active" : ""}`} onClick={onToggleThisMonth}>
              {showThisMonthOnly ? "Bu Ay Filtreli" : "Bu Ayi Goster"}
            </button>
            <button type="button" className="admin-outline-button" onClick={onOpenCreateReceivable}>
              Yeni Alacak
            </button>
            <button type="button" className="admin-primary-button" onClick={onOpenCreatePayment}>
              Yeni Odeme
            </button>
          </div>
        </div>
      </section>

      <AdminTableCard title="Odeme Listesi" description="Tum odeme ve alacak hareketlerini filtreli tablo olarak izle.">
        {loading ? (
          <AdminStateCard message="Odeme kayitlari yukleniyor..." tone="info" />
        ) : items.length ? (
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Hareket</th>
                  <th>Islem Turu</th>
                  <th>Odeme Sekli</th>
                  <th>Tutar</th>
                  <th>Hesap</th>
                  <th>Belge</th>
                  <th>Olusturulma</th>
                  <th>Not</th>
                  <th>Islem</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const movementType = String(item.movementType ?? "PAYMENT");
                  return (
                    <tr key={String(item.id)}>
                      <td>{formatTrDateTimeSafe(String(item.paymentDate ?? ""), "-")}</td>
                      <td>
                        <AdminStatusBadge tone={movementType === "RECEIVABLE" ? "warning" : "success"}>
                          {movementType === "RECEIVABLE" ? "Alacak" : "Odeme"}
                        </AdminStatusBadge>
                      </td>
                      <td>{String(item.transactionType ?? "-")}</td>
                      <td>{String(item.paymentMethod ?? "-")}</td>
                      <td>{formatTryCurrencySafe(item.amount)}</td>
                      <td>{String(item.accountName ?? "-")}</td>
                      <td>
                        {item.documentUrl ? (
                          <a href={String(item.documentUrl)} target="_blank" rel="noreferrer" className="admin-text-link">
                            Belge
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{formatTrDateTimeSafe(String(item.createdAt ?? ""), "-")}</td>
                      <td>{String(item.notes ?? "-")}</td>
                      <td>
                        <div className="admin-button-row">
                          <button type="button" className="admin-ghost-button" onClick={() => onOpenPaymentView(item)}>
                            Detay
                          </button>
                          <button type="button" className="admin-ghost-button" onClick={() => onOpenPaymentEdit(item)}>
                            Duzenle
                          </button>
                          <button type="button" className="admin-ghost-button" onClick={() => onDeletePayment(item)}>
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTableWrap>
        ) : (
          <AdminStateCard message="Bu personel icin odeme kaydi bulunmuyor." tone="neutral" />
        )}
      </AdminTableCard>

      {paymentModalMode ? (
        <div className="admin-modal-backdrop" onClick={onClosePaymentModal}>
          <section className="admin-modal-card admin-employee-payment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Personel Odemeleri</p>
                <h3>{modalTitle}</h3>
              </div>
              <button type="button" className="admin-outline-button" onClick={onClosePaymentModal}>
                Kapat
              </button>
            </div>

            <div className="admin-form-grid">
              <EmployeeSelectField
                label="Hareket Tipi"
                value={paymentForm.movementType}
                onChange={(movementType) =>
                  onPaymentFormChange({
                    ...paymentForm,
                    movementType: movementType === "RECEIVABLE" ? "RECEIVABLE" : "PAYMENT",
                    paymentMethod: movementType === "RECEIVABLE" ? "" : paymentForm.paymentMethod,
                  })
                }
                options={[
                  { label: "Odeme", value: "PAYMENT" },
                  { label: "Alacak", value: "RECEIVABLE" },
                ]}
                disabled={readOnly}
              />
              <EmployeeTextField
                label="Islem Turu"
                value={paymentForm.transactionType}
                onChange={(transactionType) => onPaymentFormChange({ ...paymentForm, transactionType })}
                disabled={readOnly}
              />
              <EmployeeSelectField
                label="Odeme Sekli"
                value={paymentForm.paymentMethod}
                onChange={(paymentMethod) => onPaymentFormChange({ ...paymentForm, paymentMethod })}
                options={PAYMENT_METHOD_OPTIONS}
                disabled={readOnly || paymentForm.movementType === "RECEIVABLE"}
                helper={paymentForm.movementType === "RECEIVABLE" ? "Alacak hareketlerinde zorunlu degil." : undefined}
              />
              <EmployeeSelectField
                label="Hesap"
                value={paymentForm.accountId}
                onChange={(accountId) => onPaymentFormChange({ ...paymentForm, accountId })}
                options={accountOptions}
                disabled={readOnly}
                helper="Muhasebe hesabi secimi hareket kaydina dogrudan yansir."
              />
              <EmployeeTextField
                label="Tutar"
                type="number"
                value={paymentForm.amount}
                onChange={(amount) => onPaymentFormChange({ ...paymentForm, amount })}
                disabled={readOnly}
              />
              <EmployeeTextField
                label="Odeme Tarihi"
                type="date"
                value={paymentForm.paymentDate}
                onChange={(paymentDate) => onPaymentFormChange({ ...paymentForm, paymentDate })}
                disabled={readOnly}
              />
              <EmployeeTextField
                label="Belge Alani"
                value={paymentForm.documentUrl}
                onChange={(documentUrl) => onPaymentFormChange({ ...paymentForm, documentUrl })}
                disabled={readOnly}
                fullWidth
              />
              <EmployeeTextareaField
                label="Not"
                value={paymentForm.notes}
                onChange={(notes) => onPaymentFormChange({ ...paymentForm, notes })}
                fullWidth
              />
            </div>

            {!readOnly ? (
              <div className="admin-filter-actions">
                <button type="button" className="admin-primary-button" onClick={onSubmitPayment} disabled={creating}>
                  {creating ? "Kaydediliyor..." : paymentModalMode === "edit" ? "Guncelle" : "Kaydet"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
