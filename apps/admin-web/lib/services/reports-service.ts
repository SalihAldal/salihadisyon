import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

let reportsCatalogCache: Promise<Awaited<ReturnType<typeof apiClient.reportsCatalog>>> | null = null;

export function fetchReportsCatalog() {
  if (!reportsCatalogCache) {
    reportsCatalogCache = apiClient.reportsCatalog(requireStoredAccessToken()).catch((error) => {
      reportsCatalogCache = null;
      throw error;
    });
  }
  return reportsCatalogCache;
}

export function fetchReportData(report: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.reportData(requireStoredAccessToken(), report, params);
}

export function fetchCategoryReport(params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.categoryReport(requireStoredAccessToken(), params);
}

export function exportDynamicReport(report: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.exportReport(requireStoredAccessToken(), report, params);
}
