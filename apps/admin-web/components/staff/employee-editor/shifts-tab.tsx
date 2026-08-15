"use client";

import { AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap, resolveBadgeTone } from "../../ui/admin-ui";
import { formatTrDateTimeSafe } from "../../../lib/utils/admin-format";
import type { EmployeeShiftFilters, EmployeeShiftFormData } from "./types";

export function ShiftsTab({
  employeeName,
  employeeActive,
  overtimeEnabled,
  summary,
  items,
  loading,
  filters,
  shiftForm,
  shiftModalOpen,
  selectedShift,
  saving,
  onFilterChange,
  onShiftFormChange,
  onOpenCreateShift,
  onCloseShiftModal,
  onSubmitShift,
  onExport,
  onSelectShift,
}: {
  employeeName: string;
  employeeActive: boolean;
  overtimeEnabled: boolean;
  summary: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  loading: boolean;
  filters: EmployeeShiftFilters;
  shiftForm: EmployeeShiftFormData;
  shiftModalOpen: boolean;
  selectedShift: Record<string, unknown> | null;
  saving: boolean;
  onFilterChange: (value: EmployeeShiftFilters) => void;
  onShiftFormChange: (value: EmployeeShiftFormData) => void;
  onOpenCreateShift: () => void;
  onCloseShiftModal: () => void;
  onSubmitShift: () => void;
  onExport: () => void;
  onSelectShift: (value: Record<string, unknown>) => void;
}) {
  const grouped = items.reduce<Record<string, Array<Record<string, unknown>>>>((acc, item) => {
    const dateKey = String(item.scheduledStartAt ?? "").slice(0, 10) || "Diger";
    acc[dateKey] = [...(acc[dateKey] ?? []), item];
    return acc;
  }, {});

  return (
    <div className="admin-employee-editor__content-stack">
      <AdminStatsGrid className="admin-employee-editor__stats">
        <AdminStatCard label="Toplam Kayit" value={String(summary.totalShifts ?? items.length ?? 0)} helper={`${summary.workCount ?? 0} mesai / ${summary.leaveCount ?? 0} izin`} />
        <AdminStatCard label="Off Day" value={String(summary.offDayCount ?? 0)} helper={`${summary.totalBreakMinutes ?? 0} dk toplam mola`} />
        <AdminStatCard label="Fazla Mesai" value={`${summary.totalOvertimeMinutes ?? 0} dk`} helper={overtimeEnabled ? `${summary.totalLateMinutes ?? 0} dk gecikme` : "Mesai kapali, fazla mesai sadece kayit bazli izlenir"} />
      </AdminStatsGrid>

      <AdminTableCard
        title="Shift Bilgileri"
        description={`${employeeName} icin takvim, liste ve detay akisi.`}
        actions={
          <>
            <button className="admin-outline-button" type="button" onClick={onExport} disabled={saving}>
              Indir / Export
            </button>
            <button className="admin-primary-button" type="button" onClick={onOpenCreateShift} disabled={!employeeActive || saving}>
              Yeni Mesai Ekle
            </button>
          </>
        }
      >
        <div className="admin-employee-editor__shift-toolbar">
          <div className="admin-employee-editor__view-switch">
            {[
              { key: "month", label: "Ay" },
              { key: "week", label: "Hafta" },
              { key: "day", label: "Gun" },
              { key: "list", label: "Liste" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                className={filters.viewMode === option.key ? "admin-outline-button admin-outline-button--active" : "admin-outline-button"}
                onClick={() => onFilterChange({ ...filters, viewMode: option.key as EmployeeShiftFilters["viewMode"] })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="admin-employee-editor__shift-filters">
            <input
              className="admin-employee-editor__filter-input"
              type="date"
              value={filters.focusDate}
              onChange={(event) => onFilterChange({ ...filters, focusDate: event.target.value })}
            />
            <select
              className="admin-select"
              value={filters.shiftType}
              onChange={(event) => onFilterChange({ ...filters, shiftType: event.target.value })}
            >
              <option value="all">Tum Kayitlar</option>
              <option value="WORK">Mesai</option>
              <option value="LEAVE">Izin</option>
              <option value="OFF_DAY">Off Day</option>
            </select>
          </div>
        </div>

        {!employeeActive ? <AdminStateCard message="Personel pasif durumda. Yeni vardiya ekleme kapatildi." tone="warning" /> : null}

        {loading ? (
          <AdminStateCard message="Vardiya kayitlari yukleniyor..." tone="info" />
        ) : items.length ? (
          <>
            {filters.viewMode === "list" ? (
              <AdminTableWrap>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Tur</th>
                      <th>Sube</th>
                      <th>Baslangic</th>
                      <th>Bitis</th>
                      <th>Mola</th>
                      <th>Gecikme</th>
                      <th>Mesai</th>
                      <th>Durum</th>
                      <th>Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={String(item.id)}>
                        <td>
                          <AdminStatusBadge tone={String(item.shiftType ?? "WORK") === "LEAVE" ? "warning" : String(item.shiftType ?? "WORK") === "OFF_DAY" ? "info" : "success"}>
                            {String(item.shiftTypeLabel ?? item.shiftType ?? "-")}
                          </AdminStatusBadge>
                        </td>
                        <td>{String(item.branchName ?? "-")}</td>
                        <td>{formatTrDateTimeSafe(String(item.scheduledStartAt ?? ""), "-")}</td>
                        <td>{formatTrDateTimeSafe(String(item.scheduledEndAt ?? ""), "-")}</td>
                        <td>{String(item.totalBreakMinutes ?? 0)} dk</td>
                        <td>{String(item.lateMinutes ?? 0)} dk</td>
                        <td>{String(item.overtimeMinutes ?? 0)} dk</td>
                        <td>{String(item.approvalStatus ?? "-")}</td>
                        <td>
                          <button className="admin-text-link" type="button" onClick={() => onSelectShift(item)}>
                            Detay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableWrap>
            ) : (
              <div className="admin-shift-groups">
                {Object.entries(grouped).map(([dateKey, groupItems]) => (
                  <div key={dateKey} className="admin-shift-group">
                    <div className="admin-shift-group__head">
                      <strong>{formatTrDateTimeSafe(`${dateKey}T00:00:00.000Z`, dateKey)}</strong>
                      <AdminStatusBadge tone="info">{groupItems.length} kayit</AdminStatusBadge>
                    </div>
                    <AdminTableWrap>
                      <table className="admin-table admin-table--compact">
                        <thead>
                          <tr>
                            <th>Tur</th>
                            <th>Baslangic</th>
                            <th>Bitis</th>
                            <th>Durum</th>
                            <th>Mesai</th>
                            <th>Detay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupItems.map((item) => (
                            <tr key={String(item.id)}>
                              <td>{String(item.shiftTypeLabel ?? item.shiftType ?? "-")}</td>
                              <td>{formatTrDateTimeSafe(String(item.scheduledStartAt ?? ""), "-")}</td>
                              <td>{formatTrDateTimeSafe(String(item.scheduledEndAt ?? ""), "-")}</td>
                              <td>
                                <AdminStatusBadge tone={resolveBadgeTone(String(item.approvalStatus ?? "neutral"))}>{String(item.approvalStatus ?? "-")}</AdminStatusBadge>
                              </td>
                              <td>{String(item.overtimeMinutes ?? 0)} dk</td>
                              <td>
                                <button className="admin-text-link" type="button" onClick={() => onSelectShift(item)}>
                                  Detay
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </AdminTableWrap>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <AdminStateCard message="Bu personel icin vardiya kaydi bulunmuyor." tone="neutral" />
        )}
      </AdminTableCard>

      {selectedShift ? (
        <AdminTableCard title="Vardiya Detayi" description="Secilen kaydin zaman, durum ve olusturma bilgileri.">
          <div className="admin-employee-editor__summary-grid">
            <div className="admin-employee-editor__summary-block">
              <strong>Tur</strong>
              <p>{String(selectedShift.shiftTypeLabel ?? selectedShift.shiftType ?? "-")}</p>
            </div>
            <div className="admin-employee-editor__summary-block">
              <strong>Olusturan</strong>
              <p>{String(selectedShift.createdBy ?? "-")}</p>
            </div>
            <div className="admin-employee-editor__summary-block">
              <strong>Baslangic</strong>
              <p>{formatTrDateTimeSafe(String(selectedShift.scheduledStartAt ?? ""), "-")}</p>
            </div>
            <div className="admin-employee-editor__summary-block">
              <strong>Bitis</strong>
              <p>{formatTrDateTimeSafe(String(selectedShift.scheduledEndAt ?? ""), "-")}</p>
            </div>
            <div className="admin-employee-editor__summary-block">
              <strong>Gercek Giris / Cikis</strong>
              <p>
                {formatTrDateTimeSafe(String(selectedShift.actualStartAt ?? ""), "-")} / {formatTrDateTimeSafe(String(selectedShift.actualEndAt ?? ""), "-")}
              </p>
            </div>
            <div className="admin-employee-editor__summary-block">
              <strong>Not</strong>
              <p>{String(selectedShift.notes ?? "-")}</p>
            </div>
          </div>
        </AdminTableCard>
      ) : null}

      {shiftModalOpen ? (
        <div className="admin-modal-backdrop" onClick={onCloseShiftModal}>
          <section className="admin-modal-card admin-employee-payment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Yeni Vardiya</p>
                <h3>Mesai / izin / off day kaydi ekle</h3>
              </div>
              <button className="admin-outline-button" type="button" onClick={onCloseShiftModal}>
                Kapat
              </button>
            </div>
            {!overtimeEnabled ? <AdminStateCard message="Mesai aktif degil. Fazla mesai alanlari otomatik hesapta pasif izlenecek." tone="info" /> : null}
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Kayit Turu</span>
                <select value={shiftForm.shiftType} onChange={(event) => onShiftFormChange({ ...shiftForm, shiftType: event.target.value as EmployeeShiftFormData["shiftType"] })}>
                  <option value="WORK">Mesai</option>
                  <option value="LEAVE">Izin</option>
                  <option value="OFF_DAY">Off Day</option>
                </select>
              </label>
              <label className="admin-field">
                <span>Baslangic</span>
                <input type="datetime-local" value={shiftForm.scheduledStartAt} onChange={(event) => onShiftFormChange({ ...shiftForm, scheduledStartAt: event.target.value })} />
              </label>
              <label className="admin-field">
                <span>Bitis</span>
                <input type="datetime-local" value={shiftForm.scheduledEndAt} onChange={(event) => onShiftFormChange({ ...shiftForm, scheduledEndAt: event.target.value })} />
              </label>
              <label className="admin-field admin-field--full">
                <span>Not</span>
                <textarea rows={3} value={shiftForm.notes} onChange={(event) => onShiftFormChange({ ...shiftForm, notes: event.target.value })} />
              </label>
            </div>
            <div className="admin-filter-actions">
              <button className="admin-outline-button" type="button" onClick={onCloseShiftModal} disabled={saving}>
                Vazgec
              </button>
              <button className="admin-primary-button" type="button" onClick={onSubmitShift} disabled={saving}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
