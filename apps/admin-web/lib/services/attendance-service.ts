import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchAttendanceOverview(params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.attendanceOverview(requireStoredAccessToken(), params);
}

export function createQrToken(data: Record<string, unknown>) {
  return apiClient.createAttendanceQrToken(requireStoredAccessToken(), data);
}

export function issueEmployeeQr(employeeProfileId: string) {
  return apiClient.issueAttendanceEmployeeQr(requireStoredAccessToken(), employeeProfileId);
}

export function scanQr(data: Record<string, unknown>) {
  return apiClient.scanAttendanceQr(data);
}

export function approveShiftItem(id: string, approved: boolean, note?: string) {
  return apiClient.approveShift(requireStoredAccessToken(), id, { approved, note });
}

export function approveBreakItem(id: string, approved: boolean, note?: string) {
  return apiClient.approveBreak(requireStoredAccessToken(), id, { approved, note });
}

export function approveAttendanceEventItem(id: string, approved: boolean, note?: string) {
  return apiClient.approveAttendanceEvent(requireStoredAccessToken(), id, { approved, note });
}
