import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchAuditLogs(params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.auditLogs(requireStoredAccessToken(), params);
}
