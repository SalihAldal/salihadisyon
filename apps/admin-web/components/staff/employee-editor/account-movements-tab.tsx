"use client";

import { AdminInput, AdminSelect, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../../ui/admin-ui";
import { formatTrDateTimeSafe, formatTryCurrencySafe } from "../../../lib/utils/admin-format";

export function AccountMovementsTab({
  summary,
  items,
  loading,
  filters,
  onFilterChange,
}: {
  summary: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  loading: boolean;
  filters: { search: string; sourceType: string };
  onFilterChange: (next: { search: string; sourceType: string }) => void;
}) {
  return (
    <div className="admin-employee-editor__content-stack">
      <AdminStatsGrid className="admin-employee-editor__stats">
        <AdminStatCard label="Toplam Hareket" value={String(summary.movementCount ?? items.length ?? 0)} />
        <AdminStatCard label="Toplam Alacak" value={formatTryCurrencySafe(summary.totalRequired)} />
        <AdminStatCard label="Toplam Odeme" value={formatTryCurrencySafe(summary.totalPaid)} />
        <AdminStatCard label="Kalan Tutar" value={formatTryCurrencySafe(summary.remainingAmount ?? summary.net)} helper={`${summary.statusChangeCount ?? 0} statu hareketi`} />
      </AdminStatsGrid>

      <AdminTableCard
        title="Hesap Hareketleri"
        description="Finansal ve statusel tum personel hareketlerini tek timeline mantiginda izle."
        actions={
          <div className="admin-button-row">
            <AdminInput
              value={filters.search}
              onChange={(event) => onFilterChange({ ...filters, search: event.target.value })}
              placeholder="Aciklama / referans / kisi ara"
              className="admin-employee-editor__filter-input"
            />
            <AdminSelect value={filters.sourceType} onChange={(event) => onFilterChange({ ...filters, sourceType: event.target.value })}>
              <option value="all">Tum Kaynaklar</option>
              <option value="financial">Finansal</option>
              <option value="status">Durum Loglari</option>
            </AdminSelect>
          </div>
        }
      >
        {loading ? (
          <AdminStateCard message="Hesap hareketleri yukleniyor..." tone="info" />
        ) : items.length ? (
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Hareket Tipi</th>
                  <th>Tutar</th>
                  <th>Aciklama</th>
                  <th>Olusturan Kullanici</th>
                  <th>Referans Kayit</th>
                  <th>Kaynak</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={String(item.id)}>
                    <td>{formatTrDateTimeSafe(String(item.occurredAt ?? item.entryDate ?? ""), "-")}</td>
                    <td>
                      <div className="admin-employee-editor__movement-cell">
                        <AdminStatusBadge tone={String(item.sourceType ?? "") === "status" ? "info" : String(item.movementType ?? "") === "Alacak" ? "warning" : "success"}>
                          {String(item.movementType ?? "-")}
                        </AdminStatusBadge>
                        <span>{String(item.transactionType ?? "-")}</span>
                      </div>
                    </td>
                    <td>{item.amount ? formatTryCurrencySafe(item.amount) : "-"}</td>
                    <td>{String(item.description ?? "-")}</td>
                    <td>{String(item.createdBy ?? "-")}</td>
                    <td>{String(item.referenceRecord ?? "-")}</td>
                    <td>{String(item.sourceType ?? "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        ) : (
          <AdminStateCard message="Bu personel icin hesap hareketi bulunmuyor." tone="neutral" />
        )}
      </AdminTableCard>
    </div>
  );
}
