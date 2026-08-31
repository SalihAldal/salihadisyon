"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CategoryReportResponse } from "../../lib/api/client";
import { fetchCategoryReport, fetchReportsCatalog } from "../../lib/services/reports-service";
import { formatTryCurrency, formatTrNumber } from "../../lib/utils/admin-format";
import { AdminPageHeader, AdminStateCard, AdminStatCard, AdminStatsGrid, AdminTableCard, AdminTableWrap } from "../ui/admin-ui";
import { ReportFilterForm } from "./report-filter-form";

function formatMetric(value: unknown) {
  if (typeof value === "number") return formatTryCurrency(value);
  return String(value ?? "-");
}

export function CategoryRevenueScreen() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string }>>([]);
  const [report, setReport] = useState<CategoryReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      branchId: searchParams.get("branchId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortDirection: searchParams.get("sortDirection") ?? undefined,
    }),
    [queryKey, searchParams],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchReportsCatalog(), fetchCategoryReport(query)])
      .then(([catalogResponse, reportResponse]) => {
        if (!active) return;
        setCatalog(catalogResponse.branchOptions ?? []);
        setReport(reportResponse);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Kategori raporu alinamadi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  if (loading) return <AdminStateCard message="Kategori raporu yukleniyor..." tone="info" />;
  if (error || !report) return <AdminStateCard message={error ?? "Kategori raporu bulunamadi."} tone="danger" />;

  return (
    <div className="admin-page-stack admin-reports-page">
      <AdminPageHeader
        kicker="Raporlar / Kategori Cirosu"
        title="Kategori Bazli Ciro"
        description="Gunluk ve aylik kategori performansini takip edin."
      />

      <ReportFilterForm branchOptions={catalog} />

      <AdminStatsGrid>
        {report.cards.map((card) => (
          <AdminStatCard key={card.key} label={card.label} value={formatMetric(card.value)} helper="Kategori bazli gelir" />
        ))}
      </AdminStatsGrid>

      <AdminTableCard title="Kategori Ciro Tablosu">
        <AdminTableWrap>
          <table className="admin-table admin-table--report-summary">
            <thead>
              <tr>
                {report.tableColumns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.table.map((row, index) => (
                <tr key={`${row.categoryName ?? row.category ?? "row"}-${index}`}>
                  {report.tableColumns.map((column) => {
                    const value = (row as Record<string, unknown>)[column.key];
                    const formatted =
                      typeof value === "number"
                        ? column.key.includes("quantity") || column.key.includes("itemCount")
                          ? formatTrNumber(value, { maximumFractionDigits: 0 })
                          : formatTryCurrency(value)
                        : String(value ?? "-");
                    return <td key={column.key}>{formatted}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      </AdminTableCard>
    </div>
  );
}
