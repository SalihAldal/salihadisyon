import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchAccountingOverview(params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.accountingOverview(requireStoredAccessToken(), params);
}

export function fetchAccountingMeta(resource: string) {
  return apiClient.accountingMeta(requireStoredAccessToken(), resource);
}

export function fetchAccountingList(resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.accountingList(requireStoredAccessToken(), resource, params);
}

export function fetchAccountingDetail(resource: string, id: string) {
  return apiClient.accountingDetail(requireStoredAccessToken(), resource, id);
}

export function createAccountingItem(resource: string, data: Record<string, unknown>) {
  return apiClient.accountingCreate(requireStoredAccessToken(), resource, data);
}

export function updateAccountingItem(resource: string, id: string, data: Record<string, unknown>) {
  return apiClient.accountingUpdate(requireStoredAccessToken(), resource, id, data);
}

export function deleteAccountingItem(resource: string, id: string) {
  return apiClient.accountingDelete(requireStoredAccessToken(), resource, id);
}

export function exportAccountingResource(resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.accountingExport(requireStoredAccessToken(), resource, params);
}
