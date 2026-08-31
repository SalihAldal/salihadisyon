"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import type { DashboardOverviewResponse } from "../../lib/api/client";
import { getStoredAccessToken, getStoredUser } from "../../lib/auth/session";
import { subscribeAdminRealtime } from "../../lib/realtime/admin-realtime";
import { fetchDashboardOverview, exportDashboardOverview } from "../../lib/services/dashboard-service";
import { downloadCsv } from "../../lib/utils/download";
import { AdminButton, AdminPageHeader, AdminStateCard } from "../ui/admin-ui";
import { DashboardFilterForm } from "./dashboard-filter-form";
import { DashboardWidgets } from "./dashboard-widgets";

export function DashboardScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userName = useMemo(() => {
    try {
      const user = getStoredUser();
      return user?.fullName || user?.email || "Panel Kullanıcısı";
    } catch {
      return "Panel Kullanıcısı";
    }
  }, []);
  const query = useMemo(
    () => ({
      branchId: searchParams.get("branchId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      granularity: searchParams.get("granularity") ?? undefined,
    }),
    [searchParams],
  );
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (showLoading = true) => {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      setLoading(false);
      router.replace("/login");
      return;
    }

    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    const response = await fetchDashboardOverview(query);
    setData(response);
    if (showLoading) {
      setLoading(false);
    }
  }, [query, router]);

  useEffect(() => {
    let active = true;
    loadDashboard(true)
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Dashboard verisi alinamadi.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return subscribeAdminRealtime((detail) => {
      if (!["ticket.updated", "payment.completed", "register.updated", "inventory.stock.changed"].includes(detail.event)) {
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        void loadDashboard(false).catch((fetchError) => {
          setError(fetchError instanceof Error ? fetchError.message : "Dashboard verisi alinamadi.");
        });
      }, 400);
    });
  }, [loadDashboard]);

  async function handleExport() {
    const csv = await exportDashboardOverview(query);
    downloadCsv("dashboard-export.csv", csv);
  }

  if (loading) {
    return <AdminStateCard message="Dashboard yukleniyor..." tone="info" />;
  }

  if (error || !data) {
    return <AdminStateCard message={error ?? "Dashboard verisi bulunamadi."} tone="danger" />;
  }

  return (
    <div className="admin-page-stack admin-dashboard-page">
      <AdminPageHeader
        kicker="Pano"
        title={`Hoş geldiniz, ${userName}`}
        description="Seçili tarih aralığına göre KPI, analitik ve operasyon akışını izleyin."
        actions={
          <>
            <AdminButton variant="outline" onClick={() => void loadDashboard(false)}>
              Yenile
            </AdminButton>
            <AdminButton variant="outline" onClick={() => void handleExport()}>
              Dışa Aktar
            </AdminButton>
          </>
        }
      />

      <DashboardFilterForm branchOptions={data.trend.activeBranches} />
      <DashboardWidgets data={data} />
    </div>
  );
}
