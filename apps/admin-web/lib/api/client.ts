import { runtimeConfig } from "@adisyon/config";
import { emitAdminToast } from "../feedback";
import { clearStoredSession, getStoredRefreshToken } from "../auth/session";
import type { FeatureFlagListResponse } from "../feature-flags";

export interface ApiErrorPayload {
  success?: false;
  error?: { message?: string; code?: string; errors?: Array<{ field?: string; message?: string }> } | string;
  message?: string | string[];
  requestId?: string;
}

export interface SystemBackupListResponse {
  items: Array<{
    id: string;
    trigger: string;
    status: string;
    requestedByUserId: string | null;
    label: string | null;
    fileName: string | null;
    filePath: string | null;
    checksumSha256: string | null;
    sizeBytes: number | null;
    databaseName: string | null;
    criticalSummary: Record<string, number> | null;
    manifest: Record<string, unknown> | null;
    restoreSourceBackupId: string | null;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  summary: {
    total: number;
    completedCount: number;
    failedCount: number;
    backupRoot: string;
  };
}

export interface FeatureFlagEvaluationResponse {
  client: "admin-web" | "pos-web" | "api";
  items: Array<{
    key: string;
    label: string;
    description: string;
    category: string;
    targets: Array<"admin-web" | "pos-web" | "api">;
    defaultEnabled: boolean;
    effectiveEnabled: boolean;
    constraints: {
      rolloutPercentage: number;
      allowedRoleKeys: string[];
      allowedUserIds: string[];
      allowedBranchIds: string[];
      clients: Array<"admin-web" | "pos-web" | "api">;
    };
  }>;
}

export interface MonitoringErrorsResponse {
  filters: {
    dateFrom: string;
    dateTo: string;
    branchId: string | null;
    severity: string | null;
  };
  summary: {
    totalErrors: number;
    criticalCount: number;
    alertSentCount: number;
    uniqueFingerprints: number;
  };
  byStatus: Array<{ key: string; count: number }>;
  bySeverity: Array<{ key: string; count: number }>;
  topPaths: Array<{ key: string; count: number }>;
  topCodes: Array<{ key: string; count: number }>;
  recentEvents: Array<{
    id: string;
    requestId: string | null;
    method: string;
    path: string;
    statusCode: number;
    errorCode: string | null;
    errorMessage: string;
    severity: string;
    branchId: string | null;
    isAlertSent: boolean;
    alertChannels: string[];
    createdAt: string;
  }>;
}

class ApiRequestError extends Error {
  status?: number;
  code?: string;
  requestId?: string;
  isTimeout?: boolean;
  isOffline?: boolean;
}

const REQUEST_TIMEOUT_MS = 15000;
const inFlightRequests = new Map<string, Promise<unknown>>();

function resolveApiErrorMessage(payload: ApiErrorPayload | null, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  if (payload.error && typeof payload.error === "object") {
    if (typeof payload.error.message === "string" && payload.error.message.trim()) {
      return payload.error.message;
    }
    const firstDetail = payload.error.errors?.find((entry) => typeof entry.message === "string" && entry.message.trim());
    if (firstDetail?.message) {
      return firstDetail.message;
    }
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  if (Array.isArray(payload.message) && payload.message[0]) {
    return String(payload.message[0]);
  }
  return fallback;
}

function buildRequestKey(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : "";
  return `${method}:${path}:${body}`;
}

function createTimeoutController(timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

function safeIdempotencyKey() {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
      .slice(8, 10)
      .join("")}-${hex.slice(10, 16).join("")}`;
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function buildRequestHeaders(method: string, init?: RequestInit, overrides?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    ...(method === "GET" ? {} : { "Idempotency-Key": safeIdempotencyKey(), "X-Device-Label": "admin-web" }),
    ...(init?.headers ?? {}),
    ...(overrides ?? {}),
  };
}

async function refreshAdminSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: buildRequestHeaders("POST"),
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as LoginResponse;
    window.localStorage.setItem("adisyon.accessToken", payload.accessToken);
    window.localStorage.setItem("adisyon.refreshToken", payload.refreshToken);
    window.localStorage.setItem("adisyon.user", JSON.stringify(payload.user));
    return payload.accessToken;
  } catch {
    return null;
  }
}

function createApiRequestError(message: string, options?: Partial<ApiRequestError>) {
  const error = new ApiRequestError(message);
  Object.assign(error, options);
  return error;
}

function notifyApiFailure(error: ApiRequestError) {
  emitAdminToast({
    tone: error.isOffline ? "warning" : "danger",
    title: error.isTimeout ? "Timeout" : error.isOffline ? "Offline" : "API Hatasi",
    message: error.message,
  });
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    tenantId: string;
    defaultBranchId?: string | null;
    role: string;
    permissions: string[];
    branchIds: string[];
  };
}

export interface DashboardOverviewResponse {
  filters: {
    branchId: string | null;
    dateFrom: string;
    dateTo: string;
    granularity: "day" | "week" | "month";
  };
  widgetVisibility: {
    inventory: boolean;
    finance: boolean;
    staff: boolean;
    goals: boolean;
    notifications: boolean;
  };
  cards: Array<{
    key: string;
    label: string;
    value: number;
    meta: string;
    delta: number;
    tone: "success" | "warning" | "info";
  }>;
  trend: {
    granularity: "day" | "week" | "month";
    activeBranches: Array<{ id: string; name: string }>;
    points: Array<{ label: string; revenue: number; ticketCount: number }>;
  };
  paymentBreakdown: Array<{ method: string; amount: number; ratio: number }>;
  branchComparison: Array<{ branchId: string; branchName: string; revenue: number; ticketCount: number; averageBasket: number }>;
  todoItems: Array<{
    id: string;
    title: string;
    description: string | null;
    dueAt: string | null;
    status: string;
    statusLabel: string;
    statusTone: "success" | "warning" | "info" | "danger";
    priority: string;
    priorityLabel: string;
    assigneeName: string;
    branchName: string;
  }>;
  pendingTasks: Array<{
    id: string;
    title: string;
    description: string | null;
    dueAt: string | null;
    status: string;
    statusLabel: string;
    statusTone: "success" | "warning" | "info" | "danger";
    priority: string;
    priorityLabel: string;
    assigneeName: string;
    branchName: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    branchName: string;
    type: string;
    isRead: boolean;
    createdAt: string;
  }>;
  goalProgress: Array<{
    id: string;
    title: string;
    employeeName: string;
    branchName: string;
    targetValue: number;
    currentValue: number;
    progressRate: number;
    endsAt: string;
    statusLabel: string;
    statusTone: "success" | "warning" | "info" | "danger";
    goalTypeLabel: string;
    goalScopeLabel: string;
    bonusAmount: number;
    bonusStatus: string | null;
  }>;
  eligibleBonuses: Array<{
    id: string;
    title: string;
    employeeName: string;
    branchName: string;
    targetValue: number;
    currentValue: number;
    progressRate: number;
    endsAt: string;
    statusLabel: string;
    statusTone: "success" | "warning" | "info" | "danger";
    goalTypeLabel: string;
    goalScopeLabel: string;
    bonusAmount: number;
    bonusStatus: string | null;
  }>;
  financeSnapshot: {
    dailyRevenue: number;
    dailyExpense: number;
    estimatedNet: number;
    dailyTicketCount: number;
    dailyCommittedFixedBurn: number;
  };
  lateStaff: Array<{
    id: string;
    employeeName: string;
    branchName: string;
    lateMinutes: number;
    scheduledStartAt: string;
    actualStartAt: string | null;
  }>;
  topProducts: Array<{ id: string; productName: string; quantity: number; revenue: number }>;
  lowStockIngredients: Array<{
    id: string;
    itemName: string;
    branchName: string;
    warehouseName: string;
    currentStock: number;
    minimumLevel: number;
    unit: string;
  }>;
  recentStockMovements: Array<{
    id: string;
    itemName: string;
    branchName: string;
    warehouseName: string;
    entryType: string;
    quantityEffect: number;
    unit: string;
    createdAt: string;
  }>;
  dailyShifts: Array<{
    id: string;
    branchName: string;
    employeeName: string;
    department: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    totalBreakMinutes: number;
    statusLabel: string;
    statusTone: "success" | "warning" | "danger";
  }>;
  upcomingBirthdays: Array<{ id: string; employeeName: string; branchName: string; daysLeft: number; birthDate: string }>;
  statusFlow: Array<{ title: string; meta: string; tone: "success" | "warning" | "info" | "danger" }>;
  fixedCostSnapshot: {
    activeCount: number;
    monthlyCommitment: number;
    items: Array<{ id: string; title: string; branchName: string; monthlyEstimate: number }>;
  };
  criticalStockAlerts: Array<{
    id: string;
    branchName: string;
    itemName: string;
    currentStock: number;
    threshold: number;
    createdAt: string;
  }>;
  activeCampaigns: Array<{ id: string; name: string; branchName: string; type: string; startsAt: string; endsAt: string | null }>;
}

export interface RevenueOverviewResponse {
  filters: {
    branchId: string | null;
    dateFrom: string;
    dateTo: string;
    groupBy: "day" | "week" | "month";
  };
  cards: Array<{ key: string; label: string; value: number; tone: string; helper: string }>;
  chart: {
    groupBy: "day" | "week" | "month";
    points: Array<{ label: string; revenue: number; ticketCount: number; averageBasket: number }>;
  };
  paymentBreakdown: Array<{ method: string; amount: number }>;
  table: Array<{ label: string; revenue: number; ticketCount: number; averageBasket: number }>;
  branchOptions: Array<{ id: string; name: string }>;
}

export interface BranchRevenueResponse {
  filters: {
    dateFrom: string;
    dateTo: string;
    sortBy: "revenue" | "ticketCount" | "averageBasket";
    sortDirection: "asc" | "desc";
    search: string;
  };
  chart: Array<{ label: string; revenue: number; ticketCount: number }>;
  table: Array<{
    branchId: string;
    branchName: string;
    revenue: number;
    ticketCount: number;
    averageBasket: number;
    firstSaleAt: string | null;
    lastSaleAt: string | null;
  }>;
}

export interface PosSettingsMetaResponse {
  resource: string;
  title: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "textarea" | "switch" | "select" | "datetime" | "json";
    required?: boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string; meta?: Record<string, unknown> }>;
    section?: string;
    helperText?: string;
    fullWidth?: boolean;
  }>;
  columns: Array<{ key: string; label: string }>;
  filters: Array<{
    key: string;
    label: string;
    type: "text" | "select" | "boolean";
    options?: Array<{ label: string; value: string; meta?: Record<string, unknown> }>;
  }>;
}

export interface PosSettingsListResponse {
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface StaffMetaResponse {
  resource: string;
  title: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "textarea" | "switch" | "select" | "datetime" | "json";
    required?: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
  columns: Array<{ key: string; label: string }>;
  filters: Array<{
    key: string;
    label: string;
    type: "text" | "select" | "boolean" | "date";
    options?: Array<{ label: string; value: string }>;
  }>;
}

export interface StaffListResponse {
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EmployeeDetailResponse {
  success: true;
  message: string;
  data: {
    main: {
      id: string;
      businessId: string;
      branchId: string;
      branchName: string;
      employeeCode: string;
      firstName: string;
      lastName: string | null;
      fullName: string;
      email: string;
      phone: string;
      pinCodeMasked: string;
      restaurantRole: string;
      staffRoleId: string | null;
      staffRoleName: string;
      hireDate: string | null;
      isActive: boolean;
      isOwner: boolean;
      overtimeEnabled: boolean;
      dailyFreeDrinkLimit: number;
      totalBreakMinutes: number;
      createdAt: string;
      updatedAt: string;
    };
    personalInfo: Record<string, unknown>;
    contactInfo: Record<string, unknown>;
    financialInfo: Record<string, unknown>;
    emergencyContact: Record<string, unknown>;
    shiftSummary: Record<string, unknown>;
    paymentSummary: Record<string, unknown>;
    accountMovementSummary: Record<string, unknown>;
    rolePermissions: Record<string, unknown>;
    statusLogs: Array<Record<string, unknown>>;
  };
}

export interface EmployeeCollectionResponse {
  success: true;
  message: string;
  data: {
    items: Array<Record<string, unknown>>;
    summary?: Record<string, unknown>;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface EmployeeMutationResponse {
  success: true;
  message: string;
  data: Record<string, unknown>;
}

export interface AttendanceOverviewResponse {
  branchId: string;
  cards: Array<{ key: string; label: string; value: number }>;
  activeTokens: Array<{ id: string; token: string; action: string; expiresAt: string }>;
  employees: Array<{
    id: string;
    employeeName: string;
    employeeCode: string;
    qrIssuedAt: string | null;
    lateToleranceMinutes: number;
    qrReady: boolean;
  }>;
  shiftStatuses: Array<{
    id: string;
    employeeName: string;
    scheduledStartAt: string;
    actualStartAt: string | null;
    lateMinutes: number;
    statusLabel: string;
    statusTone: "success" | "warning" | "danger";
  }>;
  pendingApprovals: {
    shifts: Array<{ id: string; employeeName: string; lateMinutes: number; overtimeMinutes: number; approvalStatus: string }>;
    breaks: Array<{ id: string; employeeName: string; totalMinutes: number; approvalStatus: string }>;
    events: Array<{ id: string; employeeName: string; action: string; lateMinutes: number; overtimeMinutes: number; approvalStatus: string }>;
  };
  timeline: Array<{ id: string; employeeName: string; action: string; occurredAt: string; approvalStatus: string; note: string | null; statusTone: "success" | "danger" }>;
  lateEntries: Array<{ id: string; employeeName: string; lateMinutes: number; occurredAt: string; tone: "success" | "danger" }>;
}

export interface AccountingMetaResponse {
  resource: string;
  title: string;
  description: string;
  exportable: boolean;
  readOnly: boolean;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "textarea" | "switch" | "select" | "datetime" | "json";
    required?: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
  columns: Array<{ key: string; label: string }>;
  filters: Array<{
    key: string;
    label: string;
    type: "text" | "select" | "date";
    options?: Array<{ label: string; value: string }>;
  }>;
}

export interface AccountingListResponse {
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AccountingOverviewResponse {
  cards: Array<{ key: string; label: string; value: number }>;
  ledgerSnapshot: {
    fixedCosts: number;
    payroll: number;
    otherPayments: number;
    cashVariance: number;
  };
  fixedCostSummary: {
    activeCount: number;
    recurringMonthlyEstimate: number;
    currentMonthActual: number;
    oneTimeCount: number;
    recurringCount: number;
  };
}

export interface InventoryMetaResponse {
  resource: string;
  title: string;
  description: string;
  exportable: boolean;
  readOnly: boolean;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "textarea" | "switch" | "select" | "datetime";
    required?: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
  columns: Array<{ key: string; label: string }>;
  filters: Array<{
    key: string;
    label: string;
    type: "text" | "select" | "date";
    options?: Array<{ label: string; value: string }>;
  }>;
  actions?: {
    syncSales?: boolean;
  };
}

export interface InventoryListResponse {
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface InventoryOverviewResponse {
  cards: Array<{ key: string; label: string; value: number }>;
  alerts: Array<{ id: string; productName: string; warehouseName: string; currentStock: number; threshold: number; unit: string }>;
  recentMovements: Array<{ id: string; productName: string; warehouseName: string; entryType: string; effectQuantity: number; createdAt: string; notes: string | null }>;
}

export interface DynamicReportResponse {
  report: string;
  title: string;
  filters: {
    branchId: string | null;
    dateFrom: string;
    dateTo: string;
    compareFrom: string;
    compareTo: string;
    search: string;
    sortBy: string;
    sortDirection: string;
    groupBy: string;
  };
  cards: Array<{
    key: string;
    label: string;
    value: number;
    previousValue: number;
    deltaValue: number;
    deltaRate: number;
  }>;
  comparisonSummary: {
    currentValue: number;
    previousValue: number;
    deltaValue: number;
    deltaRate: number;
    tone: string;
  };
  chart: {
    groupBy: string;
    currentLabel: string;
    previousLabel: string;
    points: Array<{ label: string; current: number; previous: number }>;
  };
  comparisonTable: Array<{
    label: string;
    currentValue: number;
    previousValue: number;
    deltaValue: number;
    ticketCount: number;
  }>;
  tableColumns: Array<{ key: string; label: string }>;
  table: Array<Record<string, unknown>>;
  branchOptions: Array<{ id: string; name: string }>;
}

export interface CategoryReportResponse {
  filters: {
    branchId: string | null;
    dateFrom: string;
    dateTo: string;
    compareFrom?: string;
    compareTo?: string;
  };
  cards: Array<{ key: string; label: string; value: number }>;
  chart: {
    groupBy: string;
    points: Array<{ label: string; revenue: number; quantity: number }>;
  };
  tableColumns: Array<{ key: string; label: string }>;
  table: Array<Record<string, unknown>>;
  branchOptions?: Array<{ id: string; name: string }>;
}

export interface ReportsCatalogResponse {
  reports: Array<{ key: string; title: string; description: string }>;
  branchOptions: Array<{ id: string; name: string }>;
}

export interface SubscriptionOverviewResponse {
  subscription: {
    id: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
  };
  plan: {
    id: string;
    code: string;
    name: string;
    priceMonthly: number;
    priceYearly: number;
    branchLimit: number;
    userLimit: number;
    features: Record<string, unknown>;
  };
  usage: Array<{ metricKey: string; currentValue: number; limitValue: number }>;
  billing: Array<{ id: string; amount: number; currency: string; periodStart: string; periodEnd: string; paidAt: string | null; providerRef: string | null }>;
}

export interface SubscriptionPlanResponse {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  branchLimit: number;
  userLimit: number;
  features: Record<string, unknown>;
}

export interface PlatformMetaResponse {
  branches: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; branchName: string }>;
}

export interface IntegrationOverviewResponse {
  cards: Array<{ key: string; label: string; value: number }>;
  providerOptions: Array<{ id: string; key: string; name: string; category: string }>;
  branchOptions: Array<{ id: string; name: string }>;
}

export interface PosLinkMetaResponse {
  branchOptions: Array<{ id: string; name: string }>;
  terminalOptions: Array<{ id: string; branchId: string; branchName: string; name: string; code: string }>;
  providerOptions: Array<{ id: string; key: string; name: string; category: string }>;
  integrationUserOptions: Array<{
    id: string;
    branchId: string;
    branchName: string;
    providerId: string;
    providerName: string;
    displayName: string;
    isActive: boolean;
  }>;
  channelOptions: Array<{ value: string; label: string }>;
}

export interface PosIntegrationMetaResponse {
  success: boolean;
  message: string;
  data: {
    branches: Array<{ id: string; name: string }>;
    terminals: Array<{ id: string; name: string; code: string; branchId: string }>;
    brandModels: Array<{
      brand: string;
      models: Array<{ model: string; requiresPin: boolean; requiresIp: boolean; requiresPort: boolean }>;
    }>;
    connectionTypes: Array<{ value: string; label: string }>;
  };
  errors: Array<{ field?: string; message?: string }>;
}

export interface PosIntegrationListResponse {
  success: boolean;
  message: string;
  data: {
    items: Array<Record<string, unknown>>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  errors: Array<{ field?: string; message?: string }>;
}

export interface AdminPosConfigResponse extends Record<string, unknown> {}

export interface SupportMetaResponse {
  branches: Array<{ id: string; name: string }>;
  statuses: string[];
  priorities: string[];
  categories: string[];
}

export interface AuditLogsResponse {
  items: Array<{
    id: string;
    userId: string | null;
    branchId: string | null;
    module: string;
    action: string;
    entityType: string;
    entityId: string | null;
    payload: Record<string, unknown> | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceInfo?: Record<string, unknown> | null;
    createdAt: string;
    user: {
      id: string;
      fullName: string;
      email: string;
    } | null;
  }>;
}

export interface BranchRecord {
  id: string;
  companyId: string;
  name: string;
  code: string;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  company?: {
    id: string;
    name: string;
  };
}

export interface CreateBranchPayload {
  companyId: string;
  name: string;
  code: string;
  city?: string;
  district?: string;
  addressLine?: string;
  phone?: string;
  isActive?: boolean;
}

export interface UpdateBranchPayload {
  name?: string;
  code?: string;
  city?: string | null;
  district?: string | null;
  addressLine?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

export interface CompanyRecord {
  id: string;
  name: string;
  legalName: string | null;
  taxNumber: string | null;
  timezone: string | null;
  currency: string | null;
  subscriptionState?: string;
  createdAt?: string;
  updatedAt?: string;
  branches?: BranchRecord[];
}

export interface CreateCompanyPayload {
  name: string;
  legalName?: string;
  taxNumber?: string;
  timezone?: string;
  currency?: string;
}

export interface UpdateCompanyPayload {
  name?: string;
  legalName?: string | null;
  taxNumber?: string | null;
  timezone?: string | null;
  currency?: string | null;
}

export interface IamRoleRecord {
  id: string;
  name: string;
  key: string;
  description?: string | null;
  permissions?: string[];
  isSystem?: boolean;
}

export interface IamPermissionRecord {
  key: string;
  label?: string;
  domain?: string;
  description?: string | null;
}

function buildQuery(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function readPublicEnv(key: "NEXT_PUBLIC_API_URL" | "NEXT_PUBLIC_SOCKET_URL") {
  if (typeof process !== "undefined" && process.env[key]) {
    return String(process.env[key]).trim();
  }
  return "";
}

function readRuntimeApiBase() {
  if (typeof window !== "undefined") {
    const injected = (window as Window & { __ADISYON_API_BASE__?: string }).__ADISYON_API_BASE__;
    if (typeof injected === "string" && injected.trim()) {
      return injected.trim();
    }
  }
  return "";
}

function toAbsoluteApiBase(pathOrUrl: string) {
  const trimmed = pathOrUrl.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (typeof window === "undefined") {
    return trimmed;
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${window.location.origin}${path}`;
}

function resolveApiBaseUrl() {
  const configured = (readRuntimeApiBase() || readPublicEnv("NEXT_PUBLIC_API_URL") || runtimeConfig.apiUrl || "").trim();

  if (typeof window !== "undefined") {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalhost && !configured.startsWith("http")) {
      const path = configured.startsWith("/") ? configured : "/api/v1";
      return `http://localhost:4100${path}`.replace(/\/$/, "");
    }

    if (configured) {
      return toAbsoluteApiBase(configured);
    }

    const fallbackPath = window.location.pathname.startsWith("/adisyon/admin") ? "/adisyon/admin/backend/v1" : "/api/v1";
    return toAbsoluteApiBase(fallbackPath);
  }

  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured.replace(/\/$/, "");
  }

  return (configured || "/api/v1").replace(/\/$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    const offlineError = createApiRequestError("Internet baglantisi yok. Lutfen baglantini kontrol et.", { isOffline: true, code: "OFFLINE" });
    notifyApiFailure(offlineError);
    throw offlineError;
  }

  const requestKey = buildRequestKey(path, init);
  const existingRequest = inFlightRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const requestPromise = (async () => {
    const { controller, timeoutId } = createTimeoutController();
    try {
      const method = (init?.method ?? "GET").toUpperCase();
      const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...buildRequestHeaders(method, init),
        },
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 401 && !path.startsWith("/auth/")) {
          const refreshedAccessToken = await refreshAdminSession();
          if (refreshedAccessToken) {
            const retryResponse = await fetch(`${resolveApiBaseUrl()}${path}`, {
              ...init,
              signal: controller.signal,
              headers: buildRequestHeaders(method, init, {
                Authorization: `Bearer ${refreshedAccessToken}`,
              }),
              cache: "no-store",
            });

            if (retryResponse.ok) {
              if (retryResponse.status === 204) {
                return undefined as T;
              }
              return retryResponse.json() as Promise<T>;
            }
          } else {
            clearStoredSession();
          }
        }
        const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
        const message = resolveApiErrorMessage(payload, "API istegi basarisiz oldu.");
        const error = createApiRequestError(message, {
          status: response.status,
          requestId: payload?.requestId,
          code: typeof payload?.error === "object" ? payload.error.code : undefined,
        });
        notifyApiFailure(error);
        throw error;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const invalidResponseError = createApiRequestError(
          "API beklenmeyen yanit dondu. Ctrl+Shift+R ile sert yenileyip tekrar dene.",
          { code: "INVALID_RESPONSE", status: response.status },
        );
        notifyApiFailure(invalidResponseError);
        throw invalidResponseError;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError = createApiRequestError("Sunucu yaniti zaman asimina ugradi. Lutfen tekrar dene.", {
          isTimeout: true,
          code: "TIMEOUT",
        });
        notifyApiFailure(timeoutError);
        throw timeoutError;
      }
      const networkError = createApiRequestError("Sunucuya ulasilamadi. Ag veya servis baglantisini kontrol et.", {
        code: "NETWORK_ERROR",
      });
      notifyApiFailure(networkError);
      throw networkError;
    } finally {
      globalThis.clearTimeout(timeoutId);
      inFlightRequests.delete(requestKey);
    }
  })();

  inFlightRequests.set(requestKey, requestPromise);
  return requestPromise;
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    const offlineError = createApiRequestError("Internet baglantisi yok. Lutfen baglantini kontrol et.", { isOffline: true, code: "OFFLINE" });
    notifyApiFailure(offlineError);
    throw offlineError;
  }

  const { controller, timeoutId } = createTimeoutController();
  try {
    const method = (init?.method ?? "GET").toUpperCase();
      const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
          ...buildRequestHeaders(method, init),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/auth/")) {
        const refreshedAccessToken = await refreshAdminSession();
        if (refreshedAccessToken) {
          const retryResponse = await fetch(`${resolveApiBaseUrl()}${path}`, {
            ...init,
            signal: controller.signal,
            headers: buildRequestHeaders(method, init, {
              Authorization: `Bearer ${refreshedAccessToken}`,
            }),
            cache: "no-store",
          });

          if (retryResponse.ok) {
            return retryResponse.text();
          }
        } else {
          clearStoredSession();
        }
      }
      const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
      const message = resolveApiErrorMessage(payload, "Export istegi basarisiz oldu.");
      const error = createApiRequestError(message, {
        status: response.status,
        requestId: payload?.requestId,
        code: typeof payload?.error === "object" ? payload.error.code : undefined,
      });
      notifyApiFailure(error);
      throw error;
    }

    return response.text();
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = createApiRequestError("Sunucu yaniti zaman asimina ugradi. Lutfen tekrar dene.", {
        isTimeout: true,
        code: "TIMEOUT",
      });
      notifyApiFailure(timeoutError);
      throw timeoutError;
    }
    const networkError = createApiRequestError("Sunucuya ulasilamadi. Ag veya servis baglantisini kontrol et.", {
      code: "NETWORK_ERROR",
    });
    notifyApiFailure(networkError);
    throw networkError;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export const apiClient = {
  login(email: string, password: string) {
    return request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        deviceLabel: "admin-web",
      }),
    });
  },
  refresh(refreshToken: string) {
    return request<LoginResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },
  logout(refreshToken: string) {
    return request<{ success: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },
  me(accessToken: string) {
    return request("/auth/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  dashboardOverview(accessToken: string, params?: Record<string, string | number | undefined | null>) {
    return request<DashboardOverviewResponse>(`/dashboard/overview${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  exportDashboard(accessToken: string, params?: Record<string, string | number | undefined | null>) {
    return requestText(`/dashboard/export${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  branches(accessToken: string, params?: Record<string, string | undefined | null>) {
    return request<BranchRecord[]>(`/branches${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  branchDetail(accessToken: string, id: string) {
    return request<BranchRecord>(`/branches/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  createBranch(accessToken: string, body: CreateBranchPayload) {
    return request<BranchRecord>("/branches", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  updateBranch(accessToken: string, id: string, body: UpdateBranchPayload) {
    return request<BranchRecord>(`/branches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  companies(accessToken: string) {
    return request<CompanyRecord[]>("/companies", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  companyDetail(accessToken: string, id: string) {
    return request<CompanyRecord>(`/companies/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  createCompany(accessToken: string, body: CreateCompanyPayload) {
    return request<CompanyRecord>("/companies", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  updateCompany(accessToken: string, id: string, body: UpdateCompanyPayload) {
    return request<CompanyRecord>(`/companies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  roles(accessToken: string, params?: Record<string, string | undefined | null>) {
    return request<IamRoleRecord[]>(`/iam/roles${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  permissions(accessToken: string) {
    return request<IamPermissionRecord[]>("/iam/permissions", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  revenueOverview(accessToken: string, params?: Record<string, string | number | undefined | null>) {
    return request<RevenueOverviewResponse>(`/reports/revenue/overview${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  branchRevenue(accessToken: string, params?: Record<string, string | number | undefined | null>) {
    return request<BranchRevenueResponse>(`/reports/revenue/branches${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  exportRevenue(accessToken: string, params?: Record<string, string | number | undefined | null>) {
    return requestText(`/reports/revenue/export${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  exportBranchRevenue(accessToken: string, params?: Record<string, string | number | undefined | null>) {
    return requestText(`/reports/revenue/branches/export${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  posSettingsMeta(accessToken: string, resource: string) {
    return request<PosSettingsMetaResponse>(`/pos-settings/${resource}/meta`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  posSettingsList(accessToken: string, resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<PosSettingsListResponse>(`/pos-settings/${resource}${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  posSettingsDetail(accessToken: string, resource: string, id: string) {
    return request<Record<string, unknown>>(`/pos-settings/${resource}/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  posSettingsCreate(accessToken: string, resource: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos-settings/${resource}`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  posSettingsUpdate(accessToken: string, resource: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos-settings/${resource}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  posSettingsDelete(accessToken: string, resource: string, id: string) {
    return request<{ success: boolean }>(`/pos-settings/${resource}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  staffMeta(accessToken: string, resource: string) {
    return request<StaffMetaResponse>(`/staff/${resource}/meta`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  staffList(accessToken: string, resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<StaffListResponse>(`/staff/${resource}${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  staffDetail(accessToken: string, resource: string, id: string) {
    return request<Record<string, unknown>>(`/staff/${resource}/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  staffCreate(accessToken: string, resource: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/staff/${resource}`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  staffUpdate(accessToken: string, resource: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/staff/${resource}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  staffDelete(accessToken: string, resource: string, id: string) {
    return request<{ success: boolean }>(`/staff/${resource}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  employeeDetail(accessToken: string, id: string) {
    return request<EmployeeDetailResponse>(`/employees/${id}/detail`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  updateEmployeeAccountSettings(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<EmployeeDetailResponse>(`/employees/${id}/account-settings`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  updateEmployeePersonalInfo(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<EmployeeDetailResponse>(`/employees/${id}/personal-info`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  updateEmployeeOtherInfo(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<EmployeeDetailResponse>(`/employees/${id}/other-info`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  employeePayments(accessToken: string, id: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<EmployeeCollectionResponse>(`/employees/${id}/payments${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  createEmployeePayment(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<EmployeeMutationResponse>(`/employees/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  updateEmployeePayment(accessToken: string, id: string, paymentId: string, data: Record<string, unknown>) {
    return request<EmployeeMutationResponse>(`/employees/${id}/payments/${paymentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  deleteEmployeePayment(accessToken: string, id: string, paymentId: string, data: Record<string, unknown>) {
    return request<EmployeeMutationResponse>(`/employees/${id}/payments/${paymentId}`, {
      method: "DELETE",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  employeeAccountMovements(accessToken: string, id: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<EmployeeCollectionResponse>(`/employees/${id}/account-movements${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  employeeShifts(accessToken: string, id: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<EmployeeCollectionResponse>(`/employees/${id}/shifts${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  createEmployeeShift(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<EmployeeMutationResponse>(`/employees/${id}/shifts`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  exportEmployeeShifts(accessToken: string, id: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<Record<string, unknown>>(`/employees/${id}/shifts/export${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  passiveEmployee(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/employees/${id}/passive`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  assignEmployeeOwner(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/employees/${id}/assign-owner`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  attendanceOverview(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<AttendanceOverviewResponse>(`/attendance/overview${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  createAttendanceQrToken(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/attendance/qr/tokens`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  issueAttendanceEmployeeQr(accessToken: string, employeeProfileId: string) {
    return request<Record<string, unknown>>(`/attendance/employees/${employeeProfileId}/qr`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  scanAttendanceQr(data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/attendance/qr/scan`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  approveShift(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/attendance/shifts/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  approveBreak(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/attendance/breaks/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  approveAttendanceEvent(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/attendance/events/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingOverview(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<AccountingOverviewResponse>(`/accounting/overview${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingMeta(accessToken: string, resource: string) {
    return request<AccountingMetaResponse>(`/accounting/${resource}/meta`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingList(accessToken: string, resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<AccountingListResponse>(`/accounting/${resource}${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingDetail(accessToken: string, resource: string, id: string) {
    return request<Record<string, unknown>>(`/accounting/${resource}/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingCreate(accessToken: string, resource: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/accounting/${resource}`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingUpdate(accessToken: string, resource: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/accounting/${resource}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingDelete(accessToken: string, resource: string, id: string) {
    return request<{ success: boolean }>(`/accounting/${resource}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  accountingExport(accessToken: string, resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return requestText(`/accounting/${resource}/export${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryOverview(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<InventoryOverviewResponse>(`/inventory/overview${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryMeta(accessToken: string, resource: string) {
    return request<InventoryMetaResponse>(`/inventory/${resource}/meta`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryList(accessToken: string, resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<InventoryListResponse>(`/inventory/${resource}${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryDetail(accessToken: string, resource: string, id: string) {
    return request<Record<string, unknown>>(`/inventory/${resource}/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryCreate(accessToken: string, resource: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/inventory/${resource}`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryUpdate(accessToken: string, resource: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/inventory/${resource}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryDelete(accessToken: string, resource: string, id: string) {
    return request<{ success: boolean }>(`/inventory/${resource}/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  inventoryExport(accessToken: string, resource: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return requestText(`/inventory/${resource}/export${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  syncInventorySales(accessToken: string, branchId?: string) {
    return request<{ success: boolean; syncedCount: number }>(`/inventory/sync-sales`, {
      method: "POST",
      body: JSON.stringify(branchId ? { branchId } : {}),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  systemBackups(accessToken: string) {
    return request<SystemBackupListResponse>(`/system/backups`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  featureFlags(accessToken: string) {
    return request<FeatureFlagListResponse>(`/feature-flags`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  evaluateFeatureFlags(accessToken: string, client: "admin-web" | "pos-web" | "api") {
    return request<FeatureFlagEvaluationResponse>(`/feature-flags/me${buildQuery({ client })}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  monitoringErrors(accessToken: string, params?: Record<string, string | number | undefined | null>) {
    return request<MonitoringErrorsResponse>(`/monitoring/errors${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  updateFeatureFlag(
    accessToken: string,
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
    return request<Record<string, unknown>>(`/feature-flags/${key}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  resetFeatureFlag(accessToken: string, key: string) {
    return request<Record<string, unknown>>(`/feature-flags/${key}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  createSystemBackup(accessToken: string, data: { label?: string }) {
    return request<Record<string, unknown>>(`/system/backups`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  restoreSystemBackup(accessToken: string, data: { backupId: string; confirmationText: string; createSafetyBackup?: boolean }) {
    return request<Record<string, unknown>>(`/system/backups/restore`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  reportsCatalog(accessToken: string) {
    return request<ReportsCatalogResponse>(`/reports/catalog`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  categoryReport(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<CategoryReportResponse>(`/reports/categories${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  reportData(accessToken: string, report: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<DynamicReportResponse>(`/reports/${report}${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  exportReport(accessToken: string, report: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return requestText(`/reports/${report}/export${buildQuery(params)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  subscriptionOverview(accessToken: string) {
    return request<SubscriptionOverviewResponse>(`/subscriptions/overview`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  subscriptionPlans(accessToken: string) {
    return request<SubscriptionPlanResponse[]>(`/subscriptions/plans`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  changeSubscriptionPlan(accessToken: string, planCode: string) {
    return request<Record<string, unknown>>(`/subscriptions/change-plan`, {
      method: "POST",
      body: JSON.stringify({ planCode }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  platformMeta(accessToken: string) {
    return request<PlatformMetaResponse>(`/subscriptions/platform-meta`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  productRatings(accessToken: string) {
    return request<Array<Record<string, unknown>>>(`/subscriptions/product-ratings`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  createProductRating(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/subscriptions/product-ratings`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  updateProductRating(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/subscriptions/product-ratings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  deleteProductRating(accessToken: string, id: string) {
    return request<{ success: boolean }>(`/subscriptions/product-ratings/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  staffDiscounts(accessToken: string) {
    return request<Array<Record<string, unknown>>>(`/subscriptions/staff-discounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  createStaffDiscount(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/subscriptions/staff-discounts`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  updateStaffDiscount(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/subscriptions/staff-discounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  deleteStaffDiscount(accessToken: string, id: string) {
    return request<{ success: boolean }>(`/subscriptions/staff-discounts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  goPosLink(accessToken: string) {
    return request<Record<string, unknown>>(`/subscriptions/go-pos-link`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  integrationsOverview(accessToken: string) {
    return request<IntegrationOverviewResponse>(`/integrations/overview`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  integrationProviders(accessToken: string) {
    return request<Array<Record<string, unknown>>>(`/integrations/providers`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  integrationCredentials(accessToken: string) {
    return request<Array<Record<string, unknown>>>(`/integrations/credentials`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  posLinksMeta(accessToken: string) {
    return request<PosLinkMetaResponse>(`/integrations/pos-links/meta`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  posLinks(accessToken: string) {
    return request<Array<Record<string, unknown>>>(`/integrations/pos-links`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  createIntegrationCredential(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/integrations/credentials`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  createPosLink(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/integrations/pos-links`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  updateIntegrationCredential(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/integrations/credentials/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  updatePosLink(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/integrations/pos-links/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  deleteIntegrationCredential(accessToken: string, id: string) {
    return request<{ success: boolean }>(`/integrations/credentials/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  deletePosLink(accessToken: string, id: string) {
    return request<{ success: boolean }>(`/integrations/pos-links/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  posIntegrationsMeta(accessToken: string) {
    return request<PosIntegrationMetaResponse>(`/pos-integrations/meta`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  posIntegrationsDevices(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<PosIntegrationListResponse>(`/pos-integrations/devices${buildQuery(params)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  posIntegrationsDeviceDetail(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  createPosIntegrationDevice(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos-integrations/devices`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  updatePosIntegrationDevice(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  testPosIntegrationDevice(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}/test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  activatePosIntegrationDevice(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}/activate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  deactivatePosIntegrationDevice(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}/deactivate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  deletePosIntegrationDevice(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  assignPosIntegrationDevice(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos-integrations/assignments`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  posIntegrationDeviceLogs(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}/logs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  posIntegrationDeviceTransactions(accessToken: string, id: string) {
    return request<Record<string, unknown>>(`/pos-integrations/devices/${id}/transactions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  adminPosConfig(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<AdminPosConfigResponse>(`/admin/pos/config${buildQuery(params)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  adminPaymentMethods(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<{ items: Array<Record<string, unknown>> }>(`/admin/payment-methods${buildQuery(params)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  adminDevices(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<{ items: Array<Record<string, unknown>> }>(`/admin/devices${buildQuery(params)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  supportMeta(accessToken: string) {
    return request<SupportMetaResponse>(`/support/meta`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  supportTickets(accessToken: string) {
    return request<Array<Record<string, unknown>>>(`/support/tickets`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  createSupportTicket(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/support/tickets`, {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  updateSupportTicket(accessToken: string, id: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/support/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  deleteSupportTicket(accessToken: string, id: string) {
    return request<{ success: boolean }>(`/support/tickets/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  auditLogs(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<AuditLogsResponse>(`/audit/logs${buildQuery(params)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  printIntegrations(accessToken: string, branchId: string) {
    return request<Record<string, unknown>>(`/admin/print-integrations?branchId=${encodeURIComponent(branchId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  bootstrapPrintIntegrations(accessToken: string, branchId: string) {
    return request<Record<string, unknown>>(`/admin/print-integrations/bootstrap?branchId=${encodeURIComponent(branchId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  saveCategoryPrintRouting(accessToken: string, categoryId: string, destinationIds: string[]) {
    return request<Record<string, unknown>>(`/admin/print-integrations/categories/${categoryId}/routing`, {
      method: "PUT",
      body: JSON.stringify({ destinationIds }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  testPrinterConnection(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>("/pos/printers/test-connection", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
  testPrinterDispatch(accessToken: string, printerId: string) {
    return request<Record<string, unknown>>("/pos/printers/test", {
      method: "POST",
      body: JSON.stringify({ printerId, documentType: "receipt" }),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
};
