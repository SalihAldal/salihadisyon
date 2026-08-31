import { apiClient, type AuditLogsResponse } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export async function fetchAuditLogs(params?: {
  branchId?: string;
  module?: string;
  search?: string;
  limit?: number;
}) {
  const token = requireStoredAccessToken();
  return apiClient.auditLogs(token, params);
}

export type { AuditLogsResponse };
