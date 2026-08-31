import { apiClient, type IamPermissionRecord, type IamRoleRecord } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export async function fetchIamRoles(companyId?: string) {
  const token = requireStoredAccessToken();
  return apiClient.roles(token, companyId ? { companyId } : undefined);
}

export async function fetchIamPermissions() {
  const token = requireStoredAccessToken();
  return apiClient.permissions(token);
}

export type { IamPermissionRecord, IamRoleRecord };
