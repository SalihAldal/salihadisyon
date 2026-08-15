import Constants from "expo-constants";

function resolveApiBase() {
  const extra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (extra && extra.trim()) {
    return extra.trim();
  }

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoClient?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:4000/api/v1`;
  }

  throw new Error("Mobil API URL tanimli degil. Expo extra.apiUrl veya hostUri gerekli.");
}

const API_BASE = resolveApiBase();

async function request<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface MobileSession {
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

export const mobileApi = {
  login(email: string, password: string) {
    return request<MobileSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceLabel: "mobile-manager" }),
    });
  },
  me(accessToken: string) {
    return request<Record<string, any>>("/auth/me", undefined, accessToken);
  },
  dashboard(accessToken: string, branchId: string) {
    return request<Record<string, any>>(`/dashboard/overview?branchId=${encodeURIComponent(branchId)}`, undefined, accessToken);
  },
  attendance(accessToken: string, branchId: string) {
    return request<Record<string, any>>(`/attendance/overview?branchId=${encodeURIComponent(branchId)}`, undefined, accessToken);
  },
  inventory(accessToken: string, branchId: string) {
    return request<Record<string, any>>(`/inventory/overview?branchId=${encodeURIComponent(branchId)}`, undefined, accessToken);
  },
  branchRevenue(accessToken: string, branchId?: string) {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    return request<Record<string, any>>(`/reports/revenue/branches${query}`, undefined, accessToken);
  },
  notifications(accessToken: string, branchId?: string) {
    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    return request<Record<string, any>>(`/notifications${query}`, undefined, accessToken);
  },
  markNotificationRead(accessToken: string, id: string) {
    return request<Record<string, any>>(`/notifications/${id}/read`, { method: "PATCH" }, accessToken);
  },
  markAllNotificationsRead(accessToken: string, branchId?: string) {
    return request<Record<string, any>>(`/notifications/read-all`, {
      method: "POST",
      body: JSON.stringify({ branchId }),
    }, accessToken);
  },
  registerPushToken(accessToken: string, payload: { pushToken: string; platform: string; deviceType: string; fingerprint?: string }) {
    return request<Record<string, any>>(`/notifications/push-token`, {
      method: "POST",
      body: JSON.stringify(payload),
    }, accessToken);
  },
};
