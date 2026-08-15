import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

const posSettingsMetaCache = new Map<string, Promise<Awaited<ReturnType<typeof apiClient.posSettingsMeta>>>>();

export function fetchPosSettingsMeta(resource: string) {
  if (!posSettingsMetaCache.has(resource)) {
    posSettingsMetaCache.set(
      resource,
      apiClient.posSettingsMeta(requireStoredAccessToken(), resource).catch((error) => {
        posSettingsMetaCache.delete(resource);
        throw error;
      }),
    );
  }
  return posSettingsMetaCache.get(resource) as Promise<Awaited<ReturnType<typeof apiClient.posSettingsMeta>>>;
}

export function fetchPosSettingsList(resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.posSettingsList(requireStoredAccessToken(), resource, params);
}

export function fetchPosSettingsDetail(resource: string, id: string) {
  return apiClient.posSettingsDetail(requireStoredAccessToken(), resource, id);
}

export function createPosSettingsItem(resource: string, data: Record<string, unknown>) {
  return apiClient.posSettingsCreate(requireStoredAccessToken(), resource, data);
}

export function updatePosSettingsItem(resource: string, id: string, data: Record<string, unknown>) {
  return apiClient.posSettingsUpdate(requireStoredAccessToken(), resource, id, data);
}

export function deletePosSettingsItem(resource: string, id: string) {
  return apiClient.posSettingsDelete(requireStoredAccessToken(), resource, id);
}
