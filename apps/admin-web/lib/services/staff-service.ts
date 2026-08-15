import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchStaffMeta(resource: string) {
  return apiClient.staffMeta(requireStoredAccessToken(), resource);
}

export function fetchStaffList(resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.staffList(requireStoredAccessToken(), resource, params);
}

export function fetchStaffDetail(resource: string, id: string) {
  return apiClient.staffDetail(requireStoredAccessToken(), resource, id);
}

export function createStaffItem(resource: string, data: Record<string, unknown>) {
  return apiClient.staffCreate(requireStoredAccessToken(), resource, data);
}

export function updateStaffItem(resource: string, id: string, data: Record<string, unknown>) {
  return apiClient.staffUpdate(requireStoredAccessToken(), resource, id, data);
}

export function deleteStaffItem(resource: string, id: string) {
  return apiClient.staffDelete(requireStoredAccessToken(), resource, id);
}

export function fetchEmployeeDetail(id: string) {
  return apiClient.employeeDetail(requireStoredAccessToken(), id);
}

export function updateEmployeeAccountSettings(id: string, data: Record<string, unknown>) {
  return apiClient.updateEmployeeAccountSettings(requireStoredAccessToken(), id, data);
}

export function updateEmployeePersonalInfo(id: string, data: Record<string, unknown>) {
  return apiClient.updateEmployeePersonalInfo(requireStoredAccessToken(), id, data);
}

export function updateEmployeeOtherInfo(id: string, data: Record<string, unknown>) {
  return apiClient.updateEmployeeOtherInfo(requireStoredAccessToken(), id, data);
}

export function fetchEmployeePayments(id: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.employeePayments(requireStoredAccessToken(), id, params);
}

export function createEmployeePayment(id: string, data: Record<string, unknown>) {
  return apiClient.createEmployeePayment(requireStoredAccessToken(), id, data);
}

export function updateEmployeePayment(id: string, paymentId: string, data: Record<string, unknown>) {
  return apiClient.updateEmployeePayment(requireStoredAccessToken(), id, paymentId, data);
}

export function deleteEmployeePayment(id: string, paymentId: string, data: Record<string, unknown>) {
  return apiClient.deleteEmployeePayment(requireStoredAccessToken(), id, paymentId, data);
}

export function fetchEmployeeAccountMovements(id: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.employeeAccountMovements(requireStoredAccessToken(), id, params);
}

export function fetchEmployeeShifts(id: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.employeeShifts(requireStoredAccessToken(), id, params);
}

export function createEmployeeShift(id: string, data: Record<string, unknown>) {
  return apiClient.createEmployeeShift(requireStoredAccessToken(), id, data);
}

export function exportEmployeeShifts(id: string, params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.exportEmployeeShifts(requireStoredAccessToken(), id, params);
}

export function passiveEmployee(id: string, data: Record<string, unknown>) {
  return apiClient.passiveEmployee(requireStoredAccessToken(), id, data);
}

export function assignEmployeeOwner(id: string, data: Record<string, unknown>) {
  return apiClient.assignEmployeeOwner(requireStoredAccessToken(), id, data);
}
