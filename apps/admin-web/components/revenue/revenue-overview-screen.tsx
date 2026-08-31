"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RevenueOverviewResponse } from "../../lib/api/client";
import { exportRevenueOverview, fetchRevenueOverview } from "../../lib/services/revenue-service";
import { formatTryCurrency } from "../../lib/utils/admin-format";
import { downloadCsv } from "../../lib/utils/download";
import { RevenueFilterForm } from "./revenue-filter-form";
import { AdminButton, AdminChartCard, AdminField, AdminInput, AdminPageHeader, AdminPagination, AdminSelect, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap, resolveBadgeTone } from "../ui/admin-ui";

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
    return <AdminStateCard message="Ciro ekranı yükleniyor..." tone="info" />;
  }

  if (error || !data) {
    return <AdminStateCard message={error ?? "Ciro verisi bulunamadı."} tone="danger" />;
  }

  return (
    <div className="admin-page-stack admin-revenue-page">
      <AdminPageHeader
        kicker="Ciro"
        title="Genel Ciro"
        description="Genel ciro, filtreleme ve dönem bazlı karşılaştırmalar."
        actions={
          <AdminButton variant="outline" onClick={handleExport}>
            Ciro Export
          </AdminButton>
        }
      />

      <RevenueFilterForm branchOptions={data.branchOptions} />

      <AdminStatsGrid>
        {data.cards.map((card) => (
          <AdminStatCard
            key={card.key}
            label={card.label}
            value={card.key === "ticketCount" ? card.value : formatTryCurrency(card.value)}
            badge={<AdminStatusBadge tone={resolveBadgeTone(card.tone)}>{card.helper}</AdminStatusBadge>}
          />
        ))}
      </AdminStatsGrid>

      <section className="dashboard-grid dashboard-grid--hero">
        <AdminChartCard kicker="Grafik" title="Ciro Trendi" badge={<AdminStatusBadge tone="info">{data.chart.groupBy}</AdminStatusBadge>}>
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
        </AdminChartCard>

        <AdminTableCard kicker="Ödeme Dağılımı" title="Yöntem Bazlı Ciro">
          <ul className="admin-list">
            {data.paymentBreakdown.map((payment) => (
              <li key={payment.method}>
                <strong>{payment.method}</strong>
                <span>{` / ${formatTryCurrency(payment.amount)}`}</span>
              </li>
            ))}
          </ul>
        </AdminTableCard>
      </section>

      <AdminTableCard
        kicker="Tablo"
        title="Dönem Bazlı Ciro Tablosu"
        badge={<AdminStatusBadge tone="success">{filteredRows.length} satır</AdminStatusBadge>}
        footer={
          <AdminPagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
        }
      >
        <div className="admin-form-grid">
          <AdminField label="Tabloda Ara">
            <AdminInput
              value={tableSearch}
              placeholder="Dönem etiketi ara..."
              onChange={(event) => {
                setTableSearch(event.target.value);
                setPage(1);
              }}
            />
          </AdminField>
          <AdminField label="Sayfa Boyutu">
            <AdminSelect
              value={String(limit)}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </AdminSelect>
          </AdminField>
        </div>
        <AdminTableWrap>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Dönem</th>
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
        </AdminTableWrap>
      </AdminTableCard>
    </div>
  );
}
