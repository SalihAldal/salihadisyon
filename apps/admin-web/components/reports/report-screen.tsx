"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DynamicReportResponse, ReportsCatalogResponse } from "../../lib/api/client";
import { getReportScreen, reportScreens } from "../../lib/reports-config";
import { exportDynamicReport, fetchReportData, fetchReportsCatalog } from "../../lib/services/reports-service";
import { formatTrDateTime, formatTrNumber, formatTryCurrency } from "../../lib/utils/admin-format";
import { downloadCsv } from "../../lib/utils/download";
import { getValueByPath } from "../../lib/utils/object-path";
import { formatReadableValue } from "../../lib/utils/readable-value";
import { useFeatureFlag } from "../feature-flags/feature-flag-provider";
import { AdminChartCard, AdminPageHeader, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminStatusBadge, AdminTableCard, AdminTableWrap, resolveBadgeTone } from "../ui/admin-ui";
import { ReportFilterForm } from "./report-filter-form";

function resolveMetricMode(hint?: string) {
  const key = (hint ?? "").toLowerCase();
  if (
    key.includes("ciro") ||
    key.includes("tahsilat") ||
    key.includes("tutar") ||
    key.includes("toplam") ||
    key.includes("sepet") ||
    key.includes("iskonto") ||
    key.includes("maliyet") ||
    key.includes("kar") ||
    key.includes("kasa") ||
    key.includes("fark") ||
    key.includes("net") ||
    key.includes("brut") ||
    key.includes("prim") ||
    key.includes("bakiye") ||
    key.includes("revenue") ||
    key.includes("amount") ||
    key.includes("cost") ||
    key.includes("profit") ||
    key.includes("balance") ||
    key.includes("variance")
  ) {
    return "currency";
  }
  if (key.includes("%") || key.includes("rate") || key.includes("oran") || key.includes("margin")) {
    return "percent";
  }
  if (key.includes("date") || key.includes("at") || key.includes("tarih") || key.includes("baslangic") || key.includes("bitis") || key.includes("kapanis")) {
    return "datetime";
  }
  return "number";
}

function formatMetric(value: unknown, hint?: string) {
  if (typeof value === "number") {
    const mode = resolveMetricMode(hint);
    if (mode === "currency") return formatTryCurrency(value);
    if (mode === "percent") return `${value.toFixed(1)}%`;
    return formatTrNumber(value, { maximumFractionDigits: 0 });
  }
  if (typeof value === "string" && resolveMetricMode(hint) === "datetime" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return formatTrDateTime(value, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return formatReadableValue(value);
}

export function ReportScreen({ slug }: { slug?: string }) {
  const isNewReportScreenEnabled = useFeatureFlag("new_report_screen");
  const screen = useMemo(() => getReportScreen(slug), [slug]);
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [catalog, setCatalog] = useState<ReportsCatalogResponse | null>(null);
  const [report, setReport] = useState<DynamicReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      branchId: searchParams.get("branchId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      compareFrom: searchParams.get("compareFrom") ?? undefined,
      compareTo: searchParams.get("compareTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortDirection: searchParams.get("sortDirection") ?? undefined,
      groupBy: searchParams.get("groupBy") ?? undefined,
    }),
    [queryKey, searchParams],
  );
  const tableColumnHints = useMemo(
    () => new Map((report?.tableColumns ?? []).map((column) => [column.key, `${column.key} ${column.label}`])),
    [report?.tableColumns],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const requests = screen ? Promise.all([fetchReportsCatalog(), fetchReportData(screen.report, query)]) : Promise.all([fetchReportsCatalog(), Promise.resolve(null)]);

    requests
      .then(([catalogResponse, reportResponse]) => {
        if (!active) return;
        setCatalog(catalogResponse as ReportsCatalogResponse);
        setReport((reportResponse as DynamicReportResponse | null) ?? null);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Rapor verisi alinamadi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [screen, query]);

  async function handleExport() {
    if (!screen) return;
    const csv = await exportDynamicReport(screen.report, query);
    downloadCsv(`${screen.slug}.csv`, csv);
  }

  if (loading) {
    return <AdminStateCard message="Rapor ekranlari yukleniyor..." tone="info" />;
  }

  if (!screen) {
    return (
      <div className="dashboard-stack admin-reference-page admin-reports-page">
        <section className="admin-page-intro">
          <div>
            <p className="admin-kicker">Sprint 7 / Raporlar</p>
            <h3>Butun analiz ekranlari tek merkezde</h3>
            <p className="admin-subtle-text">Gelişmis filtreleme, grafik, export ve karsilastirmali analiz akisi.</p>
          </div>
        </section>

        <section className="admin-module-grid">
          {reportScreens.map((item) => (
            <Link key={item.slug} href={`/raporlar/${item.slug}`} className="admin-module-card">
              <p className="admin-kicker">Rapor</p>
              <h3>{item.title}</h3>
              <p className="admin-subtle-text">{item.description}</p>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  if (!report) {
    return <AdminStateCard message={error ?? "Rapor bulunamadi."} tone="danger" />;
  }

  const maxChartValue = Math.max(...report.chart.points.flatMap((point) => [point.current, point.previous]), 1);

  return (
    <div className={`dashboard-stack admin-reference-page admin-reports-page admin-reports--${screen.report}`}>
      <section className="admin-page-intro admin-reports-toolbar">
        <AdminPageHeader
          kicker="Sprint 7 / Raporlar"
          title={screen.title}
          description={screen.description}
          className="admin-reports-toolbar"
          actions={
            <div className="admin-button-row admin-reports-actions">
              <button className="admin-outline-button" type="button" onClick={handleExport}>
                CSV Export
              </button>
            </div>
          }
        />
      </section>

      {isNewReportScreenEnabled ? <AdminStatusBadge tone="info">Yeni rapor deneyimi aktif</AdminStatusBadge> : null}
      {error ? <AdminStatusBadge tone="danger">{error}</AdminStatusBadge> : null}

      <ReportFilterForm branchOptions={catalog?.branchOptions ?? report.branchOptions} />

      <AdminStatsGrid>
        {report.cards.map((card) => (
          <AdminStatCard
            key={card.key}
            label={card.label}
            value={formatMetric(card.value, `${card.key} ${card.label}`)}
            helper={`Karsi donem: ${formatMetric(card.previousValue, `${card.key} ${card.label}`)}`}
            badge={<AdminStatusBadge tone={card.deltaValue >= 0 ? "success" : "danger"}>{card.deltaRate.toFixed(1)}%</AdminStatusBadge>}
          />
        ))}
      </AdminStatsGrid>

      <section className="dashboard-grid dashboard-grid--hero">
        <AdminChartCard
          kicker="Trend"
          title="Cari vs karsilastirma"
          badge={<AdminStatusBadge tone={resolveBadgeTone(report.comparisonSummary.tone)}>{report.comparisonSummary.deltaRate.toFixed(1)}%</AdminStatusBadge>}
        >
          <div className="admin-chart-live">
            {report.chart.points.map((point) => (
              <div key={point.label} className="admin-chart-live__item">
                <div className="admin-chart-compare">
                  <div className="admin-chart-live__bar admin-chart-live__bar--primary" style={{ height: `${Math.max(10, (point.current / maxChartValue) * 180)}px` }} />
                  <div className="admin-chart-live__bar admin-chart-live__bar--secondary" style={{ height: `${Math.max(10, (point.previous / maxChartValue) * 180)}px` }} />
                </div>
                <strong>{point.label}</strong>
                <span>{formatMetric(point.current, report.title)}</span>
              </div>
            ))}
          </div>
          <div className="admin-chart-live__legend">
            <span>{report.chart.currentLabel}</span>
            <span>{report.chart.previousLabel}</span>
          </div>
        </AdminChartCard>

        <AdminChartCard kicker="Karsilastirma" title="Genel analiz ozeti">
          <div className="admin-metric-row">
            <div>
              <span className="admin-kicker">Cari Donem</span>
              <strong>{formatMetric(report.comparisonSummary.currentValue)}</strong>
            </div>
            <div>
              <span className="admin-kicker">Karsi Donem</span>
              <strong>{formatMetric(report.comparisonSummary.previousValue)}</strong>
            </div>
            <div>
              <span className="admin-kicker">Delta</span>
              <strong>{formatMetric(report.comparisonSummary.deltaValue)}</strong>
            </div>
          </div>
        </AdminChartCard>
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        <AdminTableCard kicker="Karsilastirmali Analiz" title={`${report.title} ozet tablosu`}>
          <AdminTableWrap>
            <table className="admin-table admin-table--report-summary">
              <thead>
                <tr>
                  <th>Baslik</th>
                  <th>Cari</th>
                  <th>Karsi</th>
                  <th>Delta</th>
                  <th>Ek Metrik</th>
                </tr>
              </thead>
              <tbody>
                {report.comparisonTable.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatMetric(row.currentValue, report.title)}</td>
                    <td>{formatMetric(row.previousValue, report.title)}</td>
                    <td>{formatMetric(row.deltaValue, report.title)}</td>
                    <td>{formatMetric(row.ticketCount, "count")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </AdminTableCard>
      </section>

      <AdminTableCard
        kicker="Detay Tablosu"
        title={`${report.title} detay kirilimi`}
        badge={<AdminStatusBadge tone="info">{report.table.length} satir</AdminStatusBadge>}
      >
        <AdminTableWrap>
          <table className="admin-table admin-table--report-detail">
            <thead>
              <tr>
                {report.tableColumns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.table.map((row, index) => (
                <tr key={`${report.report}-${index}`}>
                  {report.tableColumns.map((column) => (
                    <td key={column.key}>{formatMetric(getValueByPath(row, column.key), tableColumnHints.get(column.key))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      </AdminTableCard>
    </div>
  );
}
