"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RevenueOverviewResponse } from "../../lib/api/client";
import { exportRevenueOverview, fetchRevenueOverview } from "../../lib/services/revenue-service";
import { formatTryCurrency } from "../../lib/utils/admin-format";
import { downloadCsv } from "../../lib/utils/download";
import { RevenueFilterForm } from "./revenue-filter-form";

export function RevenueOverviewScreen() {
  const searchParams = useSearchParams();
  const query = useMemo(
    () => ({
      branchId: searchParams.get("branchId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      groupBy: searchParams.get("groupBy") ?? undefined,
    }),
    [searchParams],
  );
  const [data, setData] = useState<RevenueOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchRevenueOverview(query)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Ciro raporu alinamadi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  async function handleExport() {
    const csv = await exportRevenueOverview(query);
    downloadCsv("ciro-genel.csv", csv);
  }

  const filteredRows = useMemo(() => {
    const lowered = tableSearch.trim().toLowerCase();
    if (!lowered) return data?.table ?? [];
    return (data?.table ?? []).filter((row) => row.label.toLowerCase().includes(lowered));
  }, [data?.table, tableSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / limit));
  const pagedRows = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    return filteredRows.slice(start, start + limit);
  }, [filteredRows, limit, page, totalPages]);

  if (loading) {
    return <div className="admin-surface admin-empty-state">Ciro ekrani yukleniyor...</div>;
  }

  if (error || !data) {
    return <div className="admin-surface admin-empty-state">{error ?? "Ciro verisi bulunamadi."}</div>;
  }

  return (
    <div className="dashboard-stack admin-reference-page admin-revenue-page">
      <section className="admin-page-intro">
        <div>
          <p className="admin-kicker">Aldal Pos / Ciro Modulu</p>
          <h3>Genel ciro, tarih filtreleme ve performans karsilastirmalari</h3>
        </div>
        <button className="admin-outline-button" type="button" onClick={handleExport}>
          Ciro Export
        </button>
      </section>

      <RevenueFilterForm branchOptions={data.branchOptions} />

      <section className="dashboard-grid dashboard-grid--stats">
        {data.cards.map((card) => (
          <article key={card.key} className="admin-surface admin-stat-card">
            <div className="admin-stat-card__header">
              <span className="admin-kicker">{card.label}</span>
              <span className={`admin-status-pill admin-status-pill--${card.tone}`}>{card.helper}</span>
            </div>
            <strong className="admin-stat-card__value">{card.key === "ticketCount" ? card.value : formatTryCurrency(card.value)}</strong>
          </article>
        ))}
      </section>

      <section className="dashboard-grid dashboard-grid--hero">
        <article className="admin-surface admin-chart-card">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Grafik</p>
              <h3>Ciro Trendi</h3>
            </div>
            <span className="admin-status-pill admin-status-pill--info">{data.chart.groupBy}</span>
          </div>
          <div className="admin-chart-live">
            {data.chart.points.map((point) => (
              <div key={point.label} className="admin-chart-live__item">
                <div
                  className="admin-chart-live__bar"
                  style={{
                    height: `${Math.max(12, (point.revenue / Math.max(...data.chart.points.map((entry) => entry.revenue), 1)) * 180)}px`,
                  }}
                />
                <strong>{point.label}</strong>
                <span>{formatTryCurrency(point.revenue)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-surface">
          <div className="admin-section-head">
            <div>
              <p className="admin-kicker">Odeme Dagilimi</p>
              <h3>Yontem Bazli Ciro</h3>
            </div>
          </div>
          <ul className="admin-list">
            {data.paymentBreakdown.map((payment) => (
              <li key={payment.method}>
                <strong>{payment.method}</strong>
                <span>{` / ${formatTryCurrency(payment.amount)}`}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="admin-surface">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">Tablo</p>
            <h3>Gun / Hafta / Ay Bazli Ciro Tablosu</h3>
          </div>
          <span className="admin-status-pill admin-status-pill--success">{filteredRows.length} satir</span>
        </div>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Tabloda Ara</span>
            <input
              value={tableSearch}
              placeholder="Donem etiketi ara..."
              onChange={(event) => {
                setTableSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
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
                <th>Donem</th>
                <th>Ciro</th>
                <th>Adisyon</th>
                <th>Ort. Sepet</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{formatTryCurrency(row.revenue)}</td>
                  <td>{row.ticketCount}</td>
                  <td>{formatTryCurrency(row.averageBasket)}</td>
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
