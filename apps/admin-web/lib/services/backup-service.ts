import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchSystemBackups() {
  return apiClient.systemBackups(requireStoredAccessToken());
}

export function createSystemBackup(label?: string) {
  return apiClient.createSystemBackup(requireStoredAccessToken(), label ? { label } : {});
}

export function restoreSystemBackup(backupId: string, confirmationText: string, createSafetyBackup = true) {
  return apiClient.restoreSystemBackup(requireStoredAccessToken(), {
    backupId,
    confirmationText,
    createSafetyBackup,
  });
}
