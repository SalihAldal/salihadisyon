import { apiClient, type CompanyRecord, type CreateCompanyPayload, type UpdateCompanyPayload } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export async function fetchCompanies() {
  const token = requireStoredAccessToken();
  return apiClient.companies(token);
}

export async function fetchCompanyDetail(id: string) {
  const token = requireStoredAccessToken();
  return apiClient.companyDetail(token, id);
}

export async function createCompany(payload: CreateCompanyPayload) {
  const token = requireStoredAccessToken();
  return apiClient.createCompany(token, payload);
}

export async function updateCompany(id: string, payload: UpdateCompanyPayload) {
  const token = requireStoredAccessToken();
  return apiClient.updateCompany(token, id, payload);
}

export type { CompanyRecord };
