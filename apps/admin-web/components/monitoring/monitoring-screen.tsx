"use client";

import { useEffect, useState } from "react";
import type { MonitoringErrorsResponse } from "../../lib/api/client";
import { fetchMonitoringErrors } from "../../lib/services/monitoring-service";
import { formatTrDateTime } from "../../lib/utils/admin-format";
import { AdminPageHeader, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";

export function MonitoringScreen() {
  const [data, setData] = useState<MonitoringErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMonitoringErrors()
      .then((response) => {
        if (active) setData(response);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Monitoring verisi alinamadi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <AdminStateCard message="Monitoring verisi yukleniyor..." tone="info" />;
  }

  if (!data) {
    return <AdminStateCard message={error ?? "Monitoring verisi bulunamadi."} tone="danger" />;
  }

  return (
    <div className="admin-page-stack admin-reference-page">
      <AdminPageHeader
        kicker="Sistem Gozlemi"
        title="Monitoring ve Alert"
        description="Kritik API hatalarini erken yakala, alert gonderimlerini izle ve hata yogunlugunu analiz et."
      />

      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

      <AdminStatsGrid>
        <AdminStatCard label="Toplam Hata" value={String(data.summary.totalErrors)} helper="Secili zaman araligi" />
        <AdminStatCard label="Kritik Hata" value={String(data.summary.criticalCount)} helper="500+ agirlikli olaylar" />
        <AdminStatCard label="Alert Gonderildi" value={String(data.summary.alertSentCount)} helper="Mail/Webhook cikanlar" />
        <AdminStatCard label="Benzersiz Fingerprint" value={String(data.summary.uniqueFingerprints)} helper="Tekrarlayan hata gruplari" />
      </AdminStatsGrid>

      <section className="dashboard-grid dashboard-grid--equal">
        <AdminTableCard kicker="Top Path" title="En cok hata ureten endpointler">
          <ul className="admin-list">
            {data.topPaths.map((item) => (
              <li key={item.key} className="admin-list__row">
                <span>{item.key}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </AdminTableCard>

        <AdminTableCard kicker="Top Code" title="En sik hata kodlari">
          <ul className="admin-list">
            {data.topCodes.map((item) => (
              <li key={item.key} className="admin-list__row">
                <span>{item.key}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </AdminTableCard>
      </section>

      <AdminTableCard kicker="Son Olaylar" title="Recent monitor events">
        <AdminTableWrap>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Zaman</th>
                <th>İstek</th>
                <th>Status</th>
                <th>Kod</th>
                <th>Severity</th>
                <th>Alert</th>
                <th>Mesaj</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEvents.map((event) => (
                <tr key={event.id}>
                  <td>{formatTrDateTime(event.createdAt)}</td>
                  <td>{`${event.method} ${event.path}`}</td>
                  <td>{event.statusCode}</td>
                  <td>{event.errorCode ?? "-"}</td>
                  <td>
                    <AdminStatusBadge tone={event.severity === "CRITICAL" ? "danger" : event.severity === "WARNING" ? "warning" : "info"}>
                      {event.severity}
                    </AdminStatusBadge>
                  </td>
                  <td>{event.isAlertSent ? event.alertChannels.join(", ") || "sent" : "-"}</td>
                  <td>{event.errorMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      </AdminTableCard>
    </div>
  );
}
