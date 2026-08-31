"use client";

import { useState } from "react";
import { AdminButton, AdminModal, AdminRowActionMenu, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../../ui/admin-ui";
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
  const [actionMenuRowId, setActionMenuRowId] = useState<string | null>(null);
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
            <AdminButton variant="outline" className={showThisMonthOnly ? "admin-outline-button--active" : ""} onClick={onToggleThisMonth}>
              {showThisMonthOnly ? "Bu Ay Filtreli" : "Bu Ayi Goster"}
            </AdminButton>
            <AdminButton variant="outline" onClick={onOpenCreateReceivable}>
              Yeni Alacak
            </AdminButton>
            <AdminButton variant="primary" onClick={onOpenCreatePayment}>
              Yeni Odeme
            </AdminButton>
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
                  const rowId = String(item.id ?? "");
                  return (
                    <tr key={rowId}>
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
                      <td className="admin-td--actions" onClick={(event) => event.stopPropagation()}>
                        <AdminRowActionMenu
                          open={actionMenuRowId === rowId}
                          onToggle={() => setActionMenuRowId((current: string | null) => (current === rowId ? null : rowId))}
                          onClose={() => setActionMenuRowId(null)}
                          items={[
                            { key: "view", label: "Detay", onSelect: () => onOpenPaymentView(item) },
                            { key: "edit", label: "Düzenle", disabled: readOnly, onSelect: () => onOpenPaymentEdit(item) },
                            { key: "delete", label: "Sil", tone: "danger", disabled: readOnly, onSelect: () => onDeletePayment(item) },
                          ]}
                        />
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
        <AdminModal
          open={Boolean(paymentModalMode)}
          size="md"
          kicker="Personel / Ödemeler"
          title={modalTitle}
          onClose={onClosePaymentModal}
          closeDisabled={creating}
          footer={
            !readOnly ? (
              <div className="admin-modal__footer-content">
                <div className="admin-modal__footer-left">
                  <AdminButton variant="text" onClick={onClosePaymentModal} disabled={creating}>
                    Vazgeç
                  </AdminButton>
                </div>
                <div className="admin-modal__footer-right">
                  <AdminButton variant="primary" onClick={onSubmitPayment} disabled={creating} loading={creating}>
                    {creating ? "Kaydediliyor..." : paymentModalMode === "edit" ? "Güncelle" : "Kaydet"}
                  </AdminButton>
                </div>
              </div>
            ) : (
              <div className="admin-modal__footer-content">
                <div className="admin-modal__footer-left">
                  <AdminButton variant="text" onClick={onClosePaymentModal}>
                    Kapat
                  </AdminButton>
                </div>
              </div>
            )
          }
        >
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
        </AdminModal>
      ) : null}
    </div>
  );
}
