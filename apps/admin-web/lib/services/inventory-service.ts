import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchInventoryOverview(params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.inventoryOverview(requireStoredAccessToken(), params);
}

export function fetchInventoryMeta(resource: string) {
  return apiClient.inventoryMeta(requireStoredAccessToken(), resource);
}

export function fetchInventoryList(resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.inventoryList(requireStoredAccessToken(), resource, params);
}

export function fetchInventoryDetail(resource: string, id: string) {
  return apiClient.inventoryDetail(requireStoredAccessToken(), resource, id);
}

export function createInventoryItem(resource: string, data: Record<string, unknown>) {
  return apiClient.inventoryCreate(requireStoredAccessToken(), resource, data);
}

export function updateInventoryItem(resource: string, id: string, data: Record<string, unknown>) {
  return apiClient.inventoryUpdate(requireStoredAccessToken(), resource, id, data);
}

export function deleteInventoryItem(resource: string, id: string) {
  return apiClient.inventoryDelete(requireStoredAccessToken(), resource, id);
}

export function exportInventoryResource(resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.inventoryExport(requireStoredAccessToken(), resource, params);
}

export function syncInventorySales(branchId?: string) {
  return apiClient.syncInventorySales(requireStoredAccessToken(), branchId);
}
