import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchFeatureFlags() {
  return apiClient.featureFlags(requireStoredAccessToken());
}

export function fetchMyFeatureFlags(client: "admin-web" | "pos-web" | "api" = "admin-web") {
  return apiClient.evaluateFeatureFlags(requireStoredAccessToken(), client);
}

export function updateFeatureFlag(
  key: string,
  data: {
    enabled: boolean;
    rolloutPercentage: number;
    allowedRoleKeys: string[];
    allowedUserIds: string[];
    allowedBranchIds: string[];
    clients: Array<"admin-web" | "pos-web" | "api">;
    note?: string;
  },
) {
  return apiClient.updateFeatureFlag(requireStoredAccessToken(), key, data);
}

export function resetFeatureFlag(key: string) {
  return apiClient.resetFeatureFlag(requireStoredAccessToken(), key);
}
