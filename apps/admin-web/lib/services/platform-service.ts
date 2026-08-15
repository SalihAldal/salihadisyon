import { apiClient } from "../api/client";
import { requireStoredAccessToken } from "../auth/session";

export function fetchSubscriptionOverview() {
  return apiClient.subscriptionOverview(requireStoredAccessToken());
}

export function fetchSubscriptionPlans() {
  return apiClient.subscriptionPlans(requireStoredAccessToken());
}

export function changePlan(planCode: string) {
  return apiClient.changeSubscriptionPlan(requireStoredAccessToken(), planCode);
}

export function fetchPlatformMeta() {
  return apiClient.platformMeta(requireStoredAccessToken());
}

export function fetchProductRatings() {
  return apiClient.productRatings(requireStoredAccessToken());
}

export function createProductRating(data: Record<string, unknown>) {
  return apiClient.createProductRating(requireStoredAccessToken(), data);
}

export function updateProductRating(id: string, data: Record<string, unknown>) {
  return apiClient.updateProductRating(requireStoredAccessToken(), id, data);
}

export function deleteProductRating(id: string) {
  return apiClient.deleteProductRating(requireStoredAccessToken(), id);
}

export function fetchStaffDiscounts() {
  return apiClient.staffDiscounts(requireStoredAccessToken());
}

export function createStaffDiscount(data: Record<string, unknown>) {
  return apiClient.createStaffDiscount(requireStoredAccessToken(), data);
}

export function updateStaffDiscount(id: string, data: Record<string, unknown>) {
  return apiClient.updateStaffDiscount(requireStoredAccessToken(), id, data);
}

export function deleteStaffDiscount(id: string) {
  return apiClient.deleteStaffDiscount(requireStoredAccessToken(), id);
}

export function fetchGoPosLink() {
  return apiClient.goPosLink(requireStoredAccessToken());
}

export function fetchIntegrationsOverview() {
  return apiClient.integrationsOverview(requireStoredAccessToken());
}

export function fetchIntegrationProviders() {
  return apiClient.integrationProviders(requireStoredAccessToken());
}

export function fetchIntegrationCredentials() {
  return apiClient.integrationCredentials(requireStoredAccessToken());
}

export function fetchPosLinksMeta() {
  return apiClient.posLinksMeta(requireStoredAccessToken());
}

export function fetchPosLinks() {
  return apiClient.posLinks(requireStoredAccessToken());
}

export function createIntegrationCredential(data: Record<string, unknown>) {
  return apiClient.createIntegrationCredential(requireStoredAccessToken(), data);
}

export function createPosLink(data: Record<string, unknown>) {
  return apiClient.createPosLink(requireStoredAccessToken(), data);
}

export function updateIntegrationCredential(id: string, data: Record<string, unknown>) {
  return apiClient.updateIntegrationCredential(requireStoredAccessToken(), id, data);
}

export function updatePosLink(id: string, data: Record<string, unknown>) {
  return apiClient.updatePosLink(requireStoredAccessToken(), id, data);
}

export function deleteIntegrationCredential(id: string) {
  return apiClient.deleteIntegrationCredential(requireStoredAccessToken(), id);
}

export function deletePosLink(id: string) {
  return apiClient.deletePosLink(requireStoredAccessToken(), id);
}

export function fetchPosIntegrationsMeta() {
  return apiClient.posIntegrationsMeta(requireStoredAccessToken());
}

export function fetchPosIntegrationDevices(params?: Record<string, string | number | boolean | undefined | null>) {
  return apiClient.posIntegrationsDevices(requireStoredAccessToken(), params);
}

export function fetchPosIntegrationDeviceDetail(id: string) {
  return apiClient.posIntegrationsDeviceDetail(requireStoredAccessToken(), id);
}

export function createPosIntegrationDevice(data: Record<string, unknown>) {
  return apiClient.createPosIntegrationDevice(requireStoredAccessToken(), data);
}

export function updatePosIntegrationDevice(id: string, data: Record<string, unknown>) {
  return apiClient.updatePosIntegrationDevice(requireStoredAccessToken(), id, data);
}

export function testPosIntegrationDevice(id: string) {
  return apiClient.testPosIntegrationDevice(requireStoredAccessToken(), id);
}

export function activatePosIntegrationDevice(id: string) {
  return apiClient.activatePosIntegrationDevice(requireStoredAccessToken(), id);
}

export function deactivatePosIntegrationDevice(id: string) {
  return apiClient.deactivatePosIntegrationDevice(requireStoredAccessToken(), id);
}

export function deletePosIntegrationDevice(id: string) {
  return apiClient.deletePosIntegrationDevice(requireStoredAccessToken(), id);
}

export function assignPosIntegrationDevice(data: Record<string, unknown>) {
  return apiClient.assignPosIntegrationDevice(requireStoredAccessToken(), data);
}

export function fetchPosIntegrationDeviceLogs(id: string) {
  return apiClient.posIntegrationDeviceLogs(requireStoredAccessToken(), id);
}

export function fetchPosIntegrationDeviceTransactions(id: string) {
  return apiClient.posIntegrationDeviceTransactions(requireStoredAccessToken(), id);
}

export function fetchSupportMeta() {
  return apiClient.supportMeta(requireStoredAccessToken());
}

export function fetchSupportTickets() {
  return apiClient.supportTickets(requireStoredAccessToken());
}

export function createSupportTicket(data: Record<string, unknown>) {
  return apiClient.createSupportTicket(requireStoredAccessToken(), data);
}

export function updateSupportTicket(id: string, data: Record<string, unknown>) {
  return apiClient.updateSupportTicket(requireStoredAccessToken(), id, data);
}

export function deleteSupportTicket(id: string) {
  return apiClient.deleteSupportTicket(requireStoredAccessToken(), id);
}
