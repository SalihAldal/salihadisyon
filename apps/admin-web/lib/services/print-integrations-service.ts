import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchPrintIntegrations(branchId: string) {
  return apiClient.printIntegrations(requireStoredAccessToken(), branchId);
}

export function bootstrapPrintIntegrations(branchId: string) {
  return apiClient.bootstrapPrintIntegrations(requireStoredAccessToken(), branchId);
}

export function saveCategoryPrintRouting(categoryId: string, destinationIds: string[]) {
  return apiClient.saveCategoryPrintRouting(requireStoredAccessToken(), categoryId, destinationIds);
}

export function testPrinterConnection(printerName: string, branchId?: string) {
  return apiClient.testPrinterConnection(requireStoredAccessToken(), { printerName, branchId });
}

export function testPrinterDispatch(printerId: string) {
  return apiClient.testPrinterDispatch(requireStoredAccessToken(), printerId);
}
