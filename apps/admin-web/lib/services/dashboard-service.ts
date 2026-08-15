import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchDashboardOverview(params?: Record<string, string | number | undefined | null>) {
  return apiClient.dashboardOverview(requireStoredAccessToken(), params);
}

export function exportDashboardOverview(params?: Record<string, string | number | undefined | null>) {
  return apiClient.exportDashboard(requireStoredAccessToken(), params);
}
