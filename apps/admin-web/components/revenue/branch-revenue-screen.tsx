"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BranchRevenueResponse } from "../../lib/api/client";
import { exportBranchRevenueReport, fetchBranchRevenue } from "../../lib/services/revenue-service";
import { formatTrDateTimeSafe, formatTryCurrency } from "../../lib/utils/admin-format";
import { downloadCsv } from "../../lib/utils/download";
import { RevenueFilterForm } from "./revenue-filter-form";

export function BranchRevenueScreen() {
  const searchParams = useSearchParams();
  const query = useMemo(
    () => ({
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortDirection: searchParams.get("sortDirection") ?? undefined,
    }),
    [searchParams],
  );
  const [data, setData] = useState<BranchRevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchBranchRevenue(query)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Sube bazli ciro verisi alinamadi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  async function handleExport() {
    const csv = await exportBranchRevenueReport(query);
    downloadCsv("sube-bazli-ciro.csv", csv);
  }

  const totalPages = Math.max(1, Math.ceil((data?.table.length ?? 0) / limit));
  const pagedRows = useMemo(() => {
    const rows = data?.table ?? [];
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    return rows.slice(start, start + limit);
  }, [data?.table, limit, page, totalPages]);

  if (loading) {
    return <div className="admin-surface admin-empty-state">Sube bazli ciro yukleniyor...</div>;
  }

  if (error || !data) {
    return <div className="admin-surface admin-empty-state">{error ?? "Sube bazli ciro verisi bulunamadi."}</div>;
  }

  return (
    <div className="dashboard-stack admin-reference-page admin-revenue-page">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Aldal Pos / Sube Bazli Ciro</p>
          <h3>Sube performansi, siralama ve export altyapisi</h3>
        </div>
        <button className="admin-outline-button" type="button" onClick={handleExport}>
          Sube Export
        </button>
      </section>

      <RevenueFilterForm includeBranchSearch />

      <section className="dashboard-grid dashboard-grid--hero">
        <article className="admin-surface admin-chart-card">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Grafik</p>
              <h3>Sube Bazli Ciro Dagilimi</h3>
            </div>
          </div>
          <div className="admin-chart-live">
            {data.chart.map((point) => (
              <div key={point.label} className="admin-chart-live__item">
                <div
                  className="admin-chart-live__bar"
                  style={{
                    height: `${Math.max(12, (point.revenue / Math.max(...data.chart.map((entry) => entry.revenue), 1)) * 180)}px`,
                  }}
                />
                <strong>{point.label}</strong>
                <span>{formatTryCurrency(point.revenue)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-surface">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">Tablo</p>
            <h3>Sube Bazli Ciro Tablosu</h3>
          </div>
          <span className="admin-status-pill admin-status-pill--info">{data.table.length} sube</span>
        </div>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Sayfa Boyutu</span>
            <select
              value={String(limit)}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Sube</th>
                <th>Ciro</th>
                <th>Adisyon</th>
                <th>Ort. Sepet</th>
                <th>Ilk Satis</th>
                <th>Son Satis</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.branchId}>
                  <td>{row.branchName}</td>
                  <td>{formatTryCurrency(row.revenue)}</td>
                  <td>{row.ticketCount}</td>
                  <td>{formatTryCurrency(row.averageBasket)}</td>
                  <td>{formatTrDateTimeSafe(row.firstSaleAt, "-", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{formatTrDateTimeSafe(row.lastSaleAt, "-", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-filter-actions">
          <button className="admin-outline-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
            Onceki
          </button>
          <span className="admin-status-pill admin-status-pill--info">
            Sayfa {Math.min(page, totalPages)} / {totalPages}
          </span>
          <button className="admin-outline-button" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
            Sonraki
          </button>
        </div>
      </section>
    </div>
  );
}
