import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchRevenueOverview(params?: Record<string, string | number | undefined | null>) {
  return apiClient.revenueOverview(requireStoredAccessToken(), params);
}

export function fetchBranchRevenue(params?: Record<string, string | number | undefined | null>) {
  return apiClient.branchRevenue(requireStoredAccessToken(), params);
}

export function exportRevenueOverview(params?: Record<string, string | number | undefined | null>) {
  return apiClient.exportRevenue(requireStoredAccessToken(), params);
}

export function exportBranchRevenueReport(params?: Record<string, string | number | undefined | null>) {
  return apiClient.exportBranchRevenue(requireStoredAccessToken(), params);
}
