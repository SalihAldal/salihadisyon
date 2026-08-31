"use client";

import { useEffect, useMemo, useState } from "react";
import type { SystemBackupListResponse } from "../../lib/api/client";
import { getStoredUser } from "../../lib/auth/session";
import { createSystemBackup, fetchSystemBackups, restoreSystemBackup } from "../../lib/services/backup-service";
import { AdminButton, AdminField, AdminInput, AdminPageHeader, AdminSelect, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";
import { PosSettingsShell } from "../pos-settings/pos-settings-shell";

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("tr-TR");
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) {
    return "-";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BackupScreen() {
  const user = useMemo(() => getStoredUser(), []);
  const [data, setData] = useState<SystemBackupListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState("");
  const [restoreId, setRestoreId] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [createSafetyBackup, setCreateSafetyBackup] = useState(true);
  const [busyAction, setBusyAction] = useState<"backup" | "restore" | null>(null);

  async function loadBackups(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    const response = await fetchSystemBackups();
    setData(response);
    if (showLoading) {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBackups(true).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Backup loglari alinamadi.");
      setLoading(false);
    });
  }, []);

  async function handleManualBackup() {
    try {
      setBusyAction("backup");
      setError(null);
      await createSystemBackup(manualLabel.trim() || undefined);
      setManualLabel("");
      await loadBackups(false);
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : "Manuel backup basarisiz.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestore() {
    if (!restoreId.trim()) {
      setError("Restore icin bir backup ID sec.");
      return;
    }
    try {
      setBusyAction("restore");
      setError(null);
      await restoreSystemBackup(restoreId.trim(), restoreConfirmation.trim(), createSafetyBackup);
      setRestoreConfirmation("");
      await loadBackups(false);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Restore islemi basarisiz.");
    } finally {
      setBusyAction(null);
    }
  }

  if (!user || user.role !== "super_admin") {
    return <AdminStateCard message="Backup ekranina sadece super admin erisebilir." tone="danger" />;
  }

  if (loading) {
    return <AdminStateCard message="Backup verileri yukleniyor..." tone="info" />;
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="Sistem / Yedekleme"
        title="Veri yedekleme ve geri yukleme merkezi"
        description="Gunluk otomatik backup, manuel backup, restore islemi ve backup loglari tek ekranda takip edilir."
      />

      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

      <PosSettingsShell activeSlug="yedekleme">
        <AdminStatsGrid>
          <AdminStatCard label="Toplam Kayit" value={data?.summary.total ?? 0} />
          <AdminStatCard label="Basarili Backup" value={data?.summary.completedCount ?? 0} />
          <AdminStatCard label="Hatali Backup" value={data?.summary.failedCount ?? 0} />
        </AdminStatsGrid>

        <section className="admin-detail-grid admin-detail-grid--double">
          <AdminTableCard
            kicker="Manuel Backup"
            title="Anlik sistem yedegi olustur"
            footer={
              <AdminButton variant="primary" onClick={() => void handleManualBackup()} disabled={busyAction !== null} loading={busyAction === "backup"}>
                {busyAction === "backup" ? "Backup aliniyor..." : "Manuel Backup Baslat"}
              </AdminButton>
            }
          >
            <AdminField label="Label">
              <AdminInput value={manualLabel} onChange={(event) => setManualLabel(event.target.value)} placeholder="Or: deploy-oncesi yedek" />
            </AdminField>
            <p className="admin-subtle-text">{`Gunluk otomatik backup da aktif. Backup dizini: ${data?.summary.backupRoot ?? "-"}`}</p>
          </AdminTableCard>

          <AdminTableCard
            kicker="Restore"
            title="Backup dosyasindan geri yukle"
            footer={
              <AdminButton variant="primary" onClick={() => void handleRestore()} disabled={busyAction !== null} loading={busyAction === "restore"}>
                {busyAction === "restore" ? "Restore baslatiliyor..." : "Restore Baslat"}
              </AdminButton>
            }
          >
            <AdminField label="Backup ID">
              <AdminInput value={restoreId} onChange={(event) => setRestoreId(event.target.value)} placeholder="Restore edilecek backup ID" />
            </AdminField>
            <AdminField label="Onay Metni">
              <AdminInput value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} placeholder="RESTORE yaz" />
            </AdminField>
            <AdminField label="Guvenlik Backup">
              <AdminSelect value={createSafetyBackup ? "yes" : "no"} onChange={(event) => setCreateSafetyBackup(event.target.value === "yes")}>
                <option value="yes">Evet, restore oncesi ek yedek al</option>
                <option value="no">Hayir</option>
              </AdminSelect>
            </AdminField>
            <p className="admin-subtle-text">Restore islemi yikici olabilir. Sistem, varsayilan olarak restore oncesi ekstra safety backup alir.</p>
          </AdminTableCard>
        </section>

        <AdminTableCard
          kicker="Backup Loglari"
          title="Son 100 backup kaydi"
          badge={<AdminStatusBadge tone="info">{data?.items.length ?? 0} kayit</AdminStatusBadge>}
        >
          <AdminTableWrap>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tetik</th>
                  <th>Durum</th>
                  <th>Dosya</th>
                  <th>Boyut</th>
                  <th>Veritabani</th>
                  <th>Baslangic</th>
                  <th>Bitis</th>
                  <th>Hata</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.trigger}</td>
                    <td>
                      <AdminStatusBadge tone={item.status === "COMPLETED" ? "success" : item.status === "FAILED" ? "danger" : "warning"}>
                        {item.status}
                      </AdminStatusBadge>
                    </td>
                    <td>{item.fileName ?? "-"}</td>
                    <td>{formatBytes(item.sizeBytes)}</td>
                    <td>{item.databaseName ?? "-"}</td>
                    <td>{formatDateTime(item.startedAt)}</td>
                    <td>{formatDateTime(item.finishedAt)}</td>
                    <td>{item.errorMessage ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </AdminTableCard>

        <AdminTableCard kicker="Kritik Tablolar" title="Veri kaybina karsi ozet sayaclar">
          <div className="admin-form-grid">
            {Object.entries((data?.items?.[0]?.criticalSummary as Record<string, number> | null) ?? {}).map(([key, value]) => (
              <div key={key} className="admin-surface">
                <p className="admin-kicker">{key}</p>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </AdminTableCard>
      </PosSettingsShell>
    </div>
  );
}
