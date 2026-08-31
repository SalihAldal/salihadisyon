"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getStoredUser } from "../../lib/auth/session";
import { fetchAuditLogs, type AuditLogsResponse } from "../../lib/services/audit-service";
import { fetchBranches } from "../../lib/services/branches-service";
import { formatTrDateTimeSafe } from "../../lib/utils/admin-format";
import {
  AdminButton,
  AdminField,
  AdminFilterPanel,
  AdminPageHeader,
  AdminInput,
  AdminSelect,
  AdminStateCard,
  AdminStatusBadge,
  AdminTableCard,
  AdminTableWrap,
} from "../ui/admin-ui";

type AuditItem = AuditLogsResponse["items"][number];

export function AuditLogScreen() {
  const user = getStoredUser();
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [module, setModule] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [auditResponse, branchItems] = await Promise.all([
        fetchAuditLogs({
          branchId: branchId || undefined,
          module: module || undefined,
          search: search.trim() || undefined,
          limit,
        }),
        fetchBranches().catch(() => []),
      ]);
      setLogs(auditResponse.items ?? []);
      setBranches(
        (Array.isArray(branchItems) ? branchItems : []).map((branch) => ({
          id: branch.id,
          name: branch.name,
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Audit kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [branchId, module, search, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const moduleOptions = useMemo(() => {
    const values = new Set(logs.map((log) => log.module).filter(Boolean));
    return Array.from(values).sort();
  }, [logs]);

  if (loading && logs.length === 0) {
    return <AdminStateCard tone="info" message="Yükleniyor..." />;
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="Güvenlik"
        title="Audit Log"
        description="Ödeme, adisyon, stok, personel ve ayar değişikliklerinin iz kaydı."
      />

      {error ? (
        <div className="admin-page-stack">
          <AdminStateCard tone="danger" message={error} />
          <AdminButton variant="outline" onClick={() => void load()}>
            Tekrar Dene
          </AdminButton>
        </div>
      ) : null}

      <AdminFilterPanel
        title="Filtreler"
        actions={
          <AdminButton variant="primary" onClick={() => void load()}>
            Filtrele
          </AdminButton>
        }
      >
        <div className="admin-form-grid">
          <AdminField label="Ara" fullWidth>
            <AdminInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İşlem, entity veya ID" />
          </AdminField>
          <AdminField label="Modül">
            <AdminSelect value={module} onChange={(event) => setModule(event.target.value)}>
              <option value="">Tümü</option>
              {moduleOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Şube">
            <AdminSelect value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Tümü</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Limit">
            <AdminSelect value={String(limit)} onChange={(event) => setLimit(Number(event.target.value) || 100)}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="150">150</option>
              <option value="250">250</option>
            </AdminSelect>
          </AdminField>
        </div>
      </AdminFilterPanel>

      <AdminTableCard
        title="Kayıtlar"
        badge={<AdminStatusBadge tone="info">{logs.length} kayıt</AdminStatusBadge>}
        description={user?.email ?? undefined}
      >
        {logs.length === 0 ? (
          <AdminStateCard tone="neutral" message="Henüz kayıt yok" />
        ) : (
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Kullanıcı</th>
                  <th>Modül</th>
                  <th>İşlem</th>
                  <th>Entity</th>
                  <th>Şube</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatTrDateTimeSafe(log.createdAt)}</td>
                    <td>{log.user?.fullName ?? log.user?.email ?? "—"}</td>
                    <td>
                      <AdminStatusBadge tone="info">{log.module}</AdminStatusBadge>
                    </td>
                    <td>{log.action}</td>
                    <td>
                      {log.entityType}
                      {log.entityId ? `: ${log.entityId.slice(0, 8)}…` : ""}
                    </td>
                    <td>{log.branchId ? log.branchId.slice(0, 8) + "…" : "—"}</td>
                    <td>{log.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        )}
      </AdminTableCard>
    </div>
  );
}
