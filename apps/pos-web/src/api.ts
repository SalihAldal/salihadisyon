import { emitPosToast } from "./feedback";
import { POS_STORAGE_KEY } from "./pos-constants";

const browserOrigin =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "";

function isAdisyonSubpathDeploy() {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/adisyon/pos");
}

function toAbsoluteApiBase(pathOrUrl: string) {
  const trimmed = pathOrUrl.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (!browserOrigin) {
    return trimmed;
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${browserOrigin}${path}`;
}

function resolvePosApiBase() {
  const injected = (globalThis as { __POS_API_BASE__?: string }).__POS_API_BASE__;
  if (typeof injected === "string" && injected.length > 0) {
    return toAbsoluteApiBase(injected);
  }
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_API_URL) {
    return toAbsoluteApiBase(env.VITE_API_URL);
  }
  const manual = (globalThis as any)?.__POS_API_BASE__;
  if (typeof manual === "string" && manual.length > 0) {
    return toAbsoluteApiBase(manual);
  }

  if (browserOrigin.includes("localhost:3001") || browserOrigin.includes("127.0.0.1:3001")) {
    return "http://localhost:4100/api/v1";
  }

  if (isAdisyonSubpathDeploy()) {
    return toAbsoluteApiBase("/adisyon/api/v1");
  }

  return browserOrigin ? `${browserOrigin}/api/v1` : "/api/v1";
}

export function resolvePosSocketPath() {
  const injected = (globalThis as { __POS_SOCKET_PATH__?: string }).__POS_SOCKET_PATH__;
  if (typeof injected === "string" && injected.length > 0) {
    return injected;
  }
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_SOCKET_PATH) {
    return env.VITE_SOCKET_PATH;
  }
  if (isAdisyonSubpathDeploy()) {
    return "/adisyon/ws/socket.io";
  }
  return "/socket.io";
}

function resolvePosSocketUrl() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_SOCKET_URL) {
    return env.VITE_SOCKET_URL;
  }
  const manual = (globalThis as any)?.__POS_SOCKET_URL__;
  if (typeof manual === "string" && manual.length > 0) {
    return manual;
  }

  if (browserOrigin.includes("localhost:3001") || browserOrigin.includes("127.0.0.1:3001")) {
    return "http://localhost:4100/pos";
  }

  return "/pos";
}

export function getPosApiBase() {
  return resolvePosApiBase();
}

export const POS_API_BASE = getPosApiBase();
export const POS_SOCKET_URL = resolvePosSocketUrl();
const POS_SESSION_REFRESH_EVENT = "pos.session.refreshed";
const POS_SESSION_INVALIDATED_EVENT = "pos.session.invalidated";

export interface PosAuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    tenantId: string;
    defaultBranchId: string | null;
    branchIds: string[];
    permissions: string[];
    role: string;
  };
}

export interface PosFeatureFlagEvaluationResponse {
  client: "admin-web" | "pos-web" | "api";
  items: Array<{
    key: string;
    effectiveEnabled: boolean;
  }>;
}

type StandardApiError = {
  message?: string;
  code?: string;
  errors?: Array<{ field?: string; message?: string }>;
};

class PosApiError extends Error {
  status?: number;
  code?: string;
  requestId?: string;
  isTimeout?: boolean;
  isOffline?: boolean;
}

type PosRequestOptions = {
  idempotencyKey?: string;
};

const POS_REQUEST_TIMEOUT_MS = 15000;
const inFlightRequests = new Map<string, Promise<unknown>>();
let refreshInFlight: Promise<PosAuthSession | null> | null = null;

export function getPosSessionRefreshEventName() {
  return POS_SESSION_REFRESH_EVENT;
}

export function getPosSessionInvalidatedEventName() {
  return POS_SESSION_INVALIDATED_EVENT;
}

export async function ensurePosSessionRefreshed() {
  return refreshSessionIfPossible();
}

function invalidateStoredPosSession(reason = "Oturum suresi doldu. Lutfen tekrar giris yapin.") {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(POS_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(POS_SESSION_INVALIDATED_EVENT, { detail: { reason } }));
}

function resolveApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as {
    error?: string | StandardApiError;
    message?: string | string[];
  };

  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }

  if (record.error && typeof record.error === "object") {
    if (typeof record.error.message === "string" && record.error.message.trim()) {
      return record.error.message;
    }
    const firstDetail = record.error.errors?.find((entry) => typeof entry.message === "string" && entry.message.trim());
    if (firstDetail?.message) {
      return firstDetail.message;
    }
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  if (Array.isArray(record.message) && record.message[0]) {
    return String(record.message[0]);
  }

  return fallback;
}

function buildRequestKey(path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : "";
  return `${method}:${path}:${body}`;
}

function buildQuery(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

function createTimeoutController(timeoutMs = POS_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

function createPosApiError(message: string, options?: Partial<PosApiError>) {
  const error = new PosApiError(message);
  Object.assign(error, options);
  return error;
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

function notifyPosFailure(error: PosApiError) {
  emitPosToast({
    tone: error.isOffline ? "warning" : "danger",
    title: error.isTimeout ? "Timeout" : error.isOffline ? "Offline" : "Baglanti Hatasi",
    message: error.message,
  });
}

function buildMutationHeaders(method: string, options?: PosRequestOptions) {
  if (method === "GET") {
    return {} as Record<string, string>;
  }
  return {
    "Idempotency-Key": options?.idempotencyKey ?? safeIdempotencyKey(),
    "X-Device-Label": "pos-web",
  };
}

function mergeHeaders(...headerSets: Array<HeadersInit | Record<string, string> | undefined>) {
  const headers = new Headers();
  for (const set of headerSets) {
    if (!set) {
      continue;
    }
    const next = new Headers(set);
    next.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

function withoutAuthorization(headers?: HeadersInit) {
  const next = new Headers(headers);
  next.delete("Authorization");
  next.delete("authorization");
  return next;
}

function isValidPosSession(candidate: unknown): candidate is PosAuthSession {
  if (!candidate || typeof candidate !== "object") return false;
  const record = candidate as PosAuthSession;
  return Boolean(
    typeof record.accessToken === "string" &&
      typeof record.refreshToken === "string" &&
      record.user &&
      typeof record.user.id === "string",
  );
}

function readStoredPosSession(): PosAuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidPosSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistRefreshedSession(session: PosAuthSession) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(POS_SESSION_REFRESH_EVENT, { detail: session }));
}

async function refreshSessionIfPossible() {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const current = readStoredPosSession();
  if (!current?.refreshToken) {
    return null;
  }
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${getPosApiBase()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) {
        invalidateStoredPosSession();
        return null;
      }
      const payload = (await response.json()) as { accessToken?: string; user?: PosAuthSession["user"] };
      if (!payload?.accessToken || !payload?.user) {
        invalidateStoredPosSession();
        return null;
      }
      const nextSession: PosAuthSession = {
        accessToken: payload.accessToken,
        refreshToken: current.refreshToken,
        user: payload.user,
      };
      persistRefreshedSession(nextSession);
      return nextSession;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit, accessToken?: string, options?: PosRequestOptions): Promise<T> {
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    const offlineError = createPosApiError("Internet baglantisi yok. POS offline durumda olabilir.", {
      isOffline: true,
      code: "OFFLINE",
    });
    notifyPosFailure(offlineError);
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
      const response = await fetch(`${getPosApiBase()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: mergeHeaders(
          { "Content-Type": "application/json" },
          withoutAuthorization(init?.headers),
          buildMutationHeaders(method, options),
          accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        ),
      });

      if (response.status === 401 && accessToken && path !== "/auth/login" && path !== "/auth/refresh") {
        const refreshed = await refreshSessionIfPossible();
        if (refreshed?.accessToken) {
          const retriedResponse = await fetch(`${getPosApiBase()}${path}`, {
            ...init,
            signal: controller.signal,
            headers: mergeHeaders(
              { "Content-Type": "application/json" },
              withoutAuthorization(init?.headers),
              buildMutationHeaders(method, options),
              { Authorization: `Bearer ${refreshed.accessToken}` },
            ),
          });
          if (retriedResponse.ok) {
            if (retriedResponse.status === 204) {
              return undefined as T;
            }
            return retriedResponse.json() as Promise<T>;
          }
        }
        invalidateStoredPosSession();
      }

      if (!response.ok) {
        const text = await response.text();
        let message = text || `API hatasi: ${response.status}`;
        let code: string | undefined;
        try {
          const payload = JSON.parse(text) as {
            requestId?: string;
            error?: { code?: string } | string;
          };
          message = resolveApiErrorMessage(payload, message);
          code = typeof payload.error === "object" ? payload.error.code : undefined;
        } catch {
          // metin olarak devam et
        }
        const error = createPosApiError(message, {
          status: response.status,
          code,
        });
        notifyPosFailure(error);
        throw error;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof PosApiError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError = createPosApiError("Sunucu yaniti zaman asimina ugradi. Tekrar deneyin.", {
          isTimeout: true,
          code: "TIMEOUT",
        });
        notifyPosFailure(timeoutError);
        throw timeoutError;
      }
      const networkError = createPosApiError("Sunucuya baglanilamadi. Ag baglantisini kontrol et.", {
        code: "NETWORK_ERROR",
      });
      notifyPosFailure(networkError);
      throw networkError;
    } finally {
      globalThis.clearTimeout(timeoutId);
      inFlightRequests.delete(requestKey);
    }
  })();

  inFlightRequests.set(requestKey, requestPromise);
  return requestPromise;
}

async function requestText(path: string, init?: RequestInit, accessToken?: string, options?: PosRequestOptions): Promise<string> {
  const { controller, timeoutId } = createTimeoutController();
  try {
    const method = (init?.method ?? "GET").toUpperCase();
    const response = await fetch(`${getPosApiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: mergeHeaders(
        withoutAuthorization(init?.headers),
        buildMutationHeaders(method, options),
        accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      ),
    });

    if (response.status === 401 && accessToken && path !== "/auth/login" && path !== "/auth/refresh") {
      const refreshed = await refreshSessionIfPossible();
      if (refreshed?.accessToken) {
        const retriedResponse = await fetch(`${getPosApiBase()}${path}`, {
          ...init,
          signal: controller.signal,
          headers: mergeHeaders(
            withoutAuthorization(init?.headers),
            buildMutationHeaders(method, options),
            { Authorization: `Bearer ${refreshed.accessToken}` },
          ),
        });
        if (retriedResponse.ok) {
          return retriedResponse.text();
        }
      }
      invalidateStoredPosSession();
    }

    if (!response.ok) {
      const text = await response.text();
      let message = text || `API hatasi: ${response.status}`;
      try {
        const payload = JSON.parse(text);
        message = resolveApiErrorMessage(payload, message);
      } catch {
        // metin olarak devam et
      }
      const error = createPosApiError(message, { status: response.status });
      notifyPosFailure(error);
      throw error;
    }

    return response.text();
  } catch (error) {
    if (error instanceof PosApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = createPosApiError("Sunucu yaniti zaman asimina ugradi. Tekrar deneyin.", {
        isTimeout: true,
        code: "TIMEOUT",
      });
      notifyPosFailure(timeoutError);
      throw timeoutError;
    }
    const networkError = createPosApiError("Sunucuya baglanilamadi. Ag baglantisini kontrol et.", {
      code: "NETWORK_ERROR",
    });
    notifyPosFailure(networkError);
    throw networkError;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export const posApi = {
  featureFlags(accessToken: string) {
    return request<PosFeatureFlagEvaluationResponse>(`/feature-flags/me?client=pos-web`, undefined, accessToken);
  },
  login(email: string, password: string) {
    return request<PosAuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceLabel: "pos-web" }),
    });
  },
  loginWithPin(pinCode: string) {
    return request<PosAuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ pinCode, deviceLabel: "pos-web" }),
    });
  },
  me(accessToken: string) {
    return request<Record<string, unknown>>("/auth/me", undefined, accessToken);
  },
  catalog(accessToken: string, branchId: string) {
    return request<Record<string, unknown>>(`/pos/catalog?branchId=${encodeURIComponent(branchId)}`, undefined, accessToken);
  },
  config(accessToken: string, branchId: string, terminalId?: string) {
    const query = new URLSearchParams({ branchId });
    if (terminalId) {
      query.set("terminalId", terminalId);
    }
    return request<Record<string, unknown>>(`/pos/config?${query.toString()}`, undefined, accessToken);
  },
  tables(accessToken: string, branchId: string) {
    return request<Record<string, unknown>>(`/pos/tables?branchId=${encodeURIComponent(branchId)}`, undefined, accessToken);
  },
  pendingOrders(accessToken: string, branchId: string) {
    return request<Record<string, unknown>>(`/pos/pending-orders?branchId=${encodeURIComponent(branchId)}`, undefined, accessToken);
  },
  tickets(accessToken: string, params: Record<string, string | boolean | undefined>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    return request<Record<string, unknown>>(`/pos/tickets?${query.toString()}`, undefined, accessToken);
  },
  ticketDetail(accessToken: string, ticketId: string) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}`, undefined, accessToken);
  },
  createTicket(accessToken: string, data: Record<string, unknown>, options?: PosRequestOptions) {
    return request<Record<string, unknown>>("/pos/tickets", { method: "POST", body: JSON.stringify(data) }, accessToken, options);
  },
  updateTicket(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify(data) }, accessToken);
  },
  addItem(accessToken: string, ticketId: string, data: Record<string, unknown>, options?: PosRequestOptions) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/items`, { method: "POST", body: JSON.stringify(data) }, accessToken, options);
  },
  updateItem(accessToken: string, ticketId: string, itemId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(data) }, accessToken);
  },
  removeItem(accessToken: string, ticketId: string, itemId: string) {
    return request<{ success: boolean }>(`/pos/tickets/${ticketId}/items/${itemId}`, { method: "DELETE" }, accessToken);
  },
  addNote(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/notes`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  requestBill(accessToken: string, ticketId: string) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/bill-request`, { method: "POST", body: JSON.stringify({}) }, accessToken);
  },
  listTicketEvents(accessToken: string, ticketId: string) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/events`, undefined, accessToken);
  },
  applyDiscount(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/discounts`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  collectPayment(accessToken: string, ticketId: string, data: Record<string, unknown>, options?: PosRequestOptions) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/payments`, { method: "POST", body: JSON.stringify(data) }, accessToken, options);
  },
  splitTicket(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/split`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  splitTicketByPerson(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/split/by-person`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  mergeTickets(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${data.targetTicketId}/merge`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  transferTicket(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/transfer`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  voidItem(accessToken: string, ticketId: string, itemId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/items/${itemId}/void`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  voidTicket(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/void`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  approveApproval(accessToken: string, approvalId: string, data: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(`/pos/approvals/${approvalId}/approve`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  rejectApproval(accessToken: string, approvalId: string, data: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(`/pos/approvals/${approvalId}/reject`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  refund(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/refund`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  approval(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/approvals`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  print(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/printers/dispatch`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  dispatchTicketPrintRouting(accessToken: string, ticketId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/tickets/${ticketId}/print-routing`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  acknowledgePrintJob(accessToken: string, jobId: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/printers/jobs/${jobId}/ack`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  testPrinter(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/printers/test`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  testPrinterConnection(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/printers/test-connection`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  connectionStatus(accessToken: string, branchId: string, terminalId?: string) {
    const query = new URLSearchParams({ branchId });
    if (terminalId) {
      query.set("terminalId", terminalId);
    }
    return request<Record<string, unknown>>(`/pos/connections/status?${query.toString()}`, undefined, accessToken);
  },
  openDrawer(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/drawer/open`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  openRegister(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/register/open`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  closeRegister(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/register/close`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  createExpense(accessToken: string, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/pos/expenses`, { method: "POST", body: JSON.stringify(data) }, accessToken);
  },
  reportSummary(accessToken: string, params?: { branchId?: string; dateFrom?: string; dateTo?: string }) {
    const query = new URLSearchParams();
    if (params?.branchId) query.set("branchId", params.branchId);
    if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params?.dateTo) query.set("dateTo", params.dateTo);
    return request<Record<string, unknown>>(`/pos/reports/summary${query.toString() ? `?${query.toString()}` : ""}`, undefined, accessToken);
  },
  exportReportSummary(accessToken: string, params?: { branchId?: string; dateFrom?: string; dateTo?: string }) {
    const query = new URLSearchParams();
    if (params?.branchId) query.set("branchId", params.branchId);
    if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params?.dateTo) query.set("dateTo", params.dateTo);
    return requestText(`/pos/reports/export${query.toString() ? `?${query.toString()}` : ""}`, undefined, accessToken);
  },
  auditLogs(accessToken: string, params?: Record<string, string | number | boolean | undefined | null>) {
    return request<Record<string, unknown>>(`/audit/logs${buildQuery(params)}`, undefined, accessToken);
  },
  adminPosConfig(accessToken: string, params: { branchId?: string; terminalId?: string }) {
    const query = new URLSearchParams();
    if (params.branchId) query.set("branchId", params.branchId);
    if (params.terminalId) query.set("terminalId", params.terminalId);
    return request<Record<string, unknown>>(`/admin/pos/config${query.toString() ? `?${query.toString()}` : ""}`, undefined, accessToken);
  },
  adminPaymentMethods(accessToken: string, params?: { branchId?: string; includeInactive?: boolean }) {
    const query = new URLSearchParams();
    if (params?.branchId) query.set("branchId", params.branchId);
    if (params?.includeInactive) query.set("includeInactive", "true");
    return request<Record<string, unknown>>(`/admin/payment-methods${query.toString() ? `?${query.toString()}` : ""}`, undefined, accessToken);
  },
  adminDevices(accessToken: string, params?: { branchId?: string; includeInactive?: boolean }) {
    const query = new URLSearchParams();
    if (params?.branchId) query.set("branchId", params.branchId);
    if (params?.includeInactive) query.set("includeInactive", "true");
    return request<Record<string, unknown>>(`/admin/devices${query.toString() ? `?${query.toString()}` : ""}`, undefined, accessToken);
  },
};
