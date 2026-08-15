"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAuditLogs } from "../../lib/services/audit-service";
import { AdminFilterPanel, AdminPageHeader, AdminStateCard, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

type WaiterLogRow = {
  id: string;
  waiterName: string;
  action: string;
  tableName: string;
  productId: string;
  quantity: number;
  enteredAt: string;
  branchId: string;
};

export function WaiterActivityScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<WaiterLogRow[]>([]);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAuditLogs({
        module: "pos",
        limit: 250,
        search: "ticket.item.add",
      });
      const mapped = (response.items ?? [])
        .filter((item) => item.action === "ticket.item.add")
        .map((item) => {
          const payload = (item.payload ?? {}) as Record<string, unknown>;
          return {
            id: String(item.id),
            waiterName: String(item.user?.fullName ?? "Bilinmeyen"),
            action: "Urun Ekleme",
            tableName: String(payload.tableName ?? payload.tableCode ?? "-"),
            productId: String(payload.productId ?? "-"),
            quantity: Number(payload.quantity ?? 0),
            enteredAt: String(payload.enteredAt ?? item.createdAt ?? ""),
            branchId: String(item.branchId ?? "-"),
          };
        });
      setRows(mapped);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Garson loglari yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.waiterName, row.tableName, row.productId, row.branchId].some((value) => value.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  if (loading) return <AdminStateCard message="Garson loglari yukleniyor..." tone="info" />;
  if (error) return <AdminStateCard message={error} tone="danger" />;

  return (
    <div className="dashboard-stack">
      <AdminPageHeader
        kicker="Personel / Garson Loglari"
        title="Garson Masa Urun Islem Gecmisi"
        description="Hangi garsonun hangi masaya hangi urunu ne zaman girdigini izleyin."
        actions={
          <button className="admin-outline-button" type="button" onClick={() => void loadLogs()}>
            Yenile
          </button>
        }
      />

      <AdminFilterPanel title="Log filtreleri">
        <div className="admin-form-grid">
          <label className="admin-field admin-field--full">
            <span>Arama</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Garson, masa, urun veya sube" />
          </label>
        </div>
      </AdminFilterPanel>

      <AdminTableCard
        title="Garson Islem Kayitlari"
        badge={<AdminStatusBadge tone="info">{filtered.length} kayit</AdminStatusBadge>}
      >
        <AdminTableWrap>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Garson</th>
                <th>Islem</th>
                <th>Masa</th>
                <th>Urun</th>
                <th>Adet</th>
                <th>Saat</th>
                <th>Sube</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>{row.waiterName}</td>
                  <td>{row.action}</td>
                  <td>{row.tableName}</td>
                  <td>{row.productId}</td>
                  <td>{row.quantity}</td>
                  <td>{new Date(row.enteredAt).toLocaleString("tr-TR")}</td>
                  <td>{row.branchId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      </AdminTableCard>
    </div>
  );
}
