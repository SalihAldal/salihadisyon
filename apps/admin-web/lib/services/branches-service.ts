import { apiClient, type BranchRecord, type CreateBranchPayload, type UpdateBranchPayload } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export async function fetchBranches(companyId?: string) {
  const token = requireStoredAccessToken();
  return apiClient.branches(token, companyId ? { companyId } : undefined);
}

export async function fetchBranchDetail(id: string) {
  const token = requireStoredAccessToken();
  return apiClient.branchDetail(token, id);
}

export async function createBranch(payload: CreateBranchPayload) {
  const token = requireStoredAccessToken();
  return apiClient.createBranch(token, payload);
}

export async function updateBranch(id: string, payload: UpdateBranchPayload) {
  const token = requireStoredAccessToken();
  return apiClient.updateBranch(token, id, payload);
}

export type { BranchRecord };
