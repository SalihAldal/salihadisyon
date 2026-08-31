"use client";

import { useEffect, useState } from "react";
import type { AttendanceOverviewResponse } from "../../lib/api/client";
import {
  approveAttendanceEventItem,
  approveBreakItem,
  approveShiftItem,
  createQrToken,
  fetchAttendanceOverview,
  issueEmployeeQr,
  scanQr,
} from "../../lib/services/attendance-service";
import { AdminButton, AdminField, AdminInput, AdminPageHeader, AdminSelect, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, resolveBadgeTone } from "../ui/admin-ui";

export function AttendanceQrScreen() {
  const [branchId, setBranchId] = useState("");
  const [employeeProfileId, setEmployeeProfileId] = useState("");
  const [employeeQrToken, setEmployeeQrToken] = useState("");
  const [token, setToken] = useState("");
  const [action, setAction] = useState("SHIFT_IN");
  const [issuedQrPayload, setIssuedQrPayload] = useState("");
  const [overview, setOverview] = useState<AttendanceOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadOverview() {
    try {
      setLoading(true);
      const response = await fetchAttendanceOverview(branchId ? { branchId } : undefined);
      setOverview(response);
      if (!branchId && response.branchId) {
        setBranchId(response.branchId);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Mesai QR verisi alinamadi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, [branchId]);

  async function handleCreateToken() {
    try {
      setError(null);
      const response = await createQrToken({
        branchId,
        action,
        expiresInMinutes: 20,
      });
      setToken(String(response.token ?? ""));
      setIssuedQrPayload(String(response.qrPayload ?? ""));
      await loadOverview();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "QR token olusturulamadi.");
    }
  }

  async function handleIssueEmployeeQr() {
    if (!employeeProfileId) {
      setError("Once personel sec.");
      return;
    }
    try {
      setError(null);
      const response = await issueEmployeeQr(employeeProfileId);
      setEmployeeQrToken(String(response.qrToken ?? ""));
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Personel QR olusturulamadi.");
    }
  }

  async function handleScan() {
    try {
      setError(null);
      await scanQr({
        token,
        employeeQrToken,
      });
      await loadOverview();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "QR okutma basarisiz.");
    }
  }

  async function handleApprove(type: "shift" | "break" | "event", id: string, approved: boolean) {
    if (type === "shift") await approveShiftItem(id, approved);
    if (type === "break") await approveBreakItem(id, approved);
    if (type === "event") await approveAttendanceEventItem(id, approved);
    await loadOverview();
  }

  if (loading) {
    return <AdminStateCard tone="info" message="Mesai QR ekrani yukleniyor..." />;
  }

  return (
    <div className="admin-page-stack admin-pos-settings-page">
      <AdminPageHeader
        kicker="Personel"
        title="Mesai QR"
        description="QR guvenligi, mesai-mola akisi ve onay yonetimi."
      />

      {error ? <AdminStateCard tone="danger" message={error} /> : null}

      <AdminStatsGrid>
        {(overview?.cards ?? []).map((card) => (
          <AdminStatCard key={card.key} label={card.label} value={card.value} />
        ))}
      </AdminStatsGrid>

      <section className="admin-detail-grid">
        <AdminTableCard kicker="QR" title="Token üret & okut" description="Ekran tokeni ile personel QR tokenini eşleştirip okutun.">
          <div className="admin-form-grid">
            <AdminField label="Şube ID">
              <AdminInput value={branchId} onChange={(event) => setBranchId(event.target.value)} placeholder="cm..." />
            </AdminField>
            <AdminField label="Aksiyon">
              <AdminSelect value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="SHIFT_IN">SHIFT_IN</option>
                <option value="SHIFT_OUT">SHIFT_OUT</option>
                <option value="BREAK_START">BREAK_START</option>
                <option value="BREAK_END">BREAK_END</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="Token">
              <AdminInput value={token} onChange={(event) => setToken(event.target.value)} placeholder="Oluşan token" />
            </AdminField>
            <AdminField label="Personel">
              <AdminSelect value={employeeProfileId} onChange={(event) => setEmployeeProfileId(event.target.value)}>
                <option value="">Personel seç</option>
                {(overview?.employees ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{`${item.employeeName} / ${item.employeeCode}`}</option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Personel QR Token" fullWidth>
              <AdminInput value={employeeQrToken} onChange={(event) => setEmployeeQrToken(event.target.value)} placeholder="Personel badge token" />
            </AdminField>
            <AdminField label="Ekran QR Payload" fullWidth>
              <AdminInput value={issuedQrPayload} onChange={(event) => setIssuedQrPayload(event.target.value)} placeholder="attendance://scan?token=..." />
            </AdminField>
          </div>
          <div className="admin-filter-actions">
            <AdminButton variant="outline" onClick={handleIssueEmployeeQr}>
              Personel QR Uret
            </AdminButton>
            <AdminButton variant="outline" onClick={handleCreateToken}>
              Token Uret
            </AdminButton>
            <AdminButton variant="primary" onClick={handleScan}>
              QR Okut
            </AdminButton>
          </div>
        </AdminTableCard>

        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Personel QR</p>
              <h3>Badge durumu ve toleranslar</h3>
            </div>
          </div>
          <ul className="admin-list">
            {(overview?.employees ?? []).map((item) => (
              <li key={item.id}>
                <strong>{item.employeeName}</strong>
                <span>{` / ${item.employeeCode} / tolerans ${item.lateToleranceMinutes} dk`}</span>
                <AdminStatusBadge tone={item.qrReady ? "success" : "warning"}>{item.qrReady ? "QR Hazir" : "QR Yok"}</AdminStatusBadge>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Aktif Tokenlar</p>
              <h3>Su an kullanilabilir QR listesi</h3>
            </div>
          </div>
          <ul className="admin-list">
            {(overview?.activeTokens ?? []).map((item) => (
              <li key={item.id}>
                <strong>{item.action}</strong>
                <span>{` / ${item.token} / ${new Date(item.expiresAt).toLocaleString("tr-TR")}`}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Bugunku Mesai Durumu</p>
              <h3>Normal / gec giris renkleri</h3>
            </div>
          </div>
          <ul className="admin-list">
            {(overview?.shiftStatuses ?? []).map((item) => (
              <li key={item.id}>
                <strong>{item.employeeName}</strong>
                <span>{` / plan ${new Date(item.scheduledStartAt).toLocaleString("tr-TR")} / gec ${item.lateMinutes} dk`}</span>
                <AdminStatusBadge tone={resolveBadgeTone(item.statusTone)}>{item.statusLabel}</AdminStatusBadge>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Mesai Onaylari</p>
              <h3>Gec kalma / fazla mesai</h3>
            </div>
          </div>
          <ul className="admin-list">
            {(overview?.pendingApprovals.shifts ?? []).map((item) => (
              <li key={item.id}>
                <strong>{item.employeeName}</strong>
                <span>{` / gec ${item.lateMinutes} dk / fazla ${item.overtimeMinutes} dk`}</span>
                <AdminButton variant="outline" onClick={() => handleApprove("shift", item.id, true)}>
                  Onayla
                </AdminButton>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Mola Onaylari</p>
              <h3>Uzun mola kayitlari</h3>
            </div>
          </div>
          <ul className="admin-list">
            {(overview?.pendingApprovals.breaks ?? []).map((item) => (
              <li key={item.id}>
                <strong>{item.employeeName}</strong>
                <span>{` / ${item.totalMinutes} dk`}</span>
                <AdminButton variant="outline" onClick={() => handleApprove("break", item.id, true)}>
                  Onayla
                </AdminButton>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Olay Onaylari</p>
              <h3>Attendance event kayitlari</h3>
            </div>
          </div>
          <ul className="admin-list">
            {(overview?.pendingApprovals.events ?? []).map((item) => (
              <li key={item.id}>
                <strong>{item.employeeName}</strong>
                <span>{` / ${item.action}`}</span>
                <AdminButton variant="outline" onClick={() => handleApprove("event", item.id, true)}>
                  Onayla
                </AdminButton>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="admin-surface">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">Zaman Akisi</p>
            <h3>Bugunku QR hareketleri</h3>
          </div>
        </div>
        <ul className="admin-list">
          {(overview?.timeline ?? []).map((item) => (
            <li key={item.id}>
              <strong>{item.employeeName}</strong>
              <span>{` / ${item.action} / ${new Date(item.occurredAt).toLocaleString("tr-TR")} / ${item.approvalStatus}`}</span>
              <AdminStatusBadge tone={resolveBadgeTone(item.statusTone)}>{item.statusTone === "danger" ? "Gec" : "Normal"}</AdminStatusBadge>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-surface">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">Gec Giris Raporu</p>
            <h3>Bugun gec kalan personeller</h3>
          </div>
        </div>
        <ul className="admin-list">
          {(overview?.lateEntries ?? []).map((item) => (
            <li key={item.id}>
              <strong>{item.employeeName}</strong>
              <span>{` / ${item.lateMinutes} dk / ${new Date(item.occurredAt).toLocaleString("tr-TR")}`}</span>
              <AdminStatusBadge tone={resolveBadgeTone(item.tone)}>{item.lateMinutes} dk gec</AdminStatusBadge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
