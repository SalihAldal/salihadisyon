import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchMonitoringErrors(params?: Record<string, string | number | undefined | null>) {
  return apiClient.monitoringErrors(requireStoredAccessToken(), params);
}
