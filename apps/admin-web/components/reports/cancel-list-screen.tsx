"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAuditLogs } from "../../lib/services/audit-service";
import { AdminFilterPanel, AdminPageHeader, AdminStateCard, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

type CancelLogRow = {
  id: string;
  actionLabel: string;
  tableName: string;
  productName: string;
  quantity: number;
  ticketId: string;
  createdAt: string;
  userName: string;
  branchId: string;
};

export function CancelListScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CancelLogRow[]>([]);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAuditLogs({
        module: "pos",
        limit: 250,
      });
      const items = (response.items ?? []) as Array<Record<string, any>>;
      const mapped = items
        .filter((item) => ["ticket.item.cancel", "ticket.void"].includes(String(item.action)))
        .map((item) => {
          const payload = (item.payload ?? {}) as Record<string, any>;
          const action = String(item.action);
          const actionLabel = action === "ticket.void" ? "Adisyon Iptal" : "Urun Iptal";
          return {
            id: String(item.id),
            actionLabel,
            tableName: String(payload.tableName ?? payload.tableCode ?? payload.tableId ?? "-"),
            productName: String(payload.productName ?? "-"),
            quantity: Number(payload.quantity ?? 0),
            ticketId: String(payload.ticketId ?? item.entityId ?? "-"),
            createdAt: String(item.createdAt ?? payload.removedAt ?? ""),
            userName: String(item.user?.fullName ?? "Bilinmeyen"),
            branchId: String(item.branchId ?? "-"),
          };
        });
      setRows(mapped);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Iptal listesi yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.actionLabel, row.tableName, row.productName, row.ticketId, row.userName, row.branchId].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [rows, search]);

  if (loading) return <AdminStateCard message="Iptal listesi yukleniyor..." tone="info" />;
  if (error) return <AdminStateCard message={error} tone="danger" />;

  return (
    <div className="dashboard-stack">
      <AdminPageHeader
        kicker="Raporlar / Iptal Listesi"
        title="Iptal Edilen Adisyon ve Urunler"
        description="Kasadan gerceklestirilen iptallerin kaydini buradan takip edin."
        actions={
          <button className="admin-outline-button" type="button" onClick={() => void loadLogs()}>
            Yenile
          </button>
        }
      />

      <AdminFilterPanel title="Filtreler">
        <div className="admin-form-grid">
          <label className="admin-field admin-field--full">
            <span>Arama</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Garson, masa, urun, adisyon veya sube" />
          </label>
        </div>
      </AdminFilterPanel>

      <AdminTableCard title="Iptal Kayitlari" badge={<AdminStatusBadge tone="info">{filtered.length} kayit</AdminStatusBadge>}>
        <AdminTableWrap>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Islem</th>
                <th>Masa</th>
                <th>Urun</th>
                <th>Adet</th>
                <th>Personel</th>
                <th>Adisyon</th>
                <th>Sube</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt ? new Date(row.createdAt).toLocaleString("tr-TR") : "-"}</td>
                  <td>{row.actionLabel}</td>
                  <td>{row.tableName}</td>
                  <td>{row.productName}</td>
                  <td>{row.quantity || "-"}</td>
                  <td>{row.userName}</td>
                  <td>{row.ticketId}</td>
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
