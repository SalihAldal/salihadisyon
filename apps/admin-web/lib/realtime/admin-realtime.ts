export const ADMIN_REALTIME_EVENT = "adisyon:admin-realtime";

export type AdminRealtimeEventName =
  | "ticket.updated"
  | "payment.completed"
  | "refund.requested"
  | "approval.required"
  | "table.status.changed"
  | "register.updated"
  | "cash.closure.created"
  | "inventory.stock.changed";

export type AdminRealtimeEventPayload = {
  event: AdminRealtimeEventName | string;
  payload: Record<string, unknown>;
  receivedAt: string;
};

const browserOrigin =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "";

export function resolveAdminSocketUrl() {
  const manual = (globalThis as any)?.__POS_SOCKET_URL__;
  if (typeof manual === "string" && manual.length > 0) {
    return manual;
  }

  if (browserOrigin.includes("localhost:3000") || browserOrigin.includes("127.0.0.1:3000")) {
    return "http://localhost:4100/pos";
  }

  return browserOrigin ? `${browserOrigin}/pos` : "/pos";
}

export function dispatchAdminRealtimeEvent(event: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<AdminRealtimeEventPayload>(ADMIN_REALTIME_EVENT, {
      detail: {
        event,
        payload,
        receivedAt: new Date().toISOString(),
      },
    }),
  );
}

export function subscribeAdminRealtime(listener: (detail: AdminRealtimeEventPayload) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AdminRealtimeEventPayload>).detail;
    if (!detail?.event) {
      return;
    }
    listener(detail);
  };
  window.addEventListener(ADMIN_REALTIME_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(ADMIN_REALTIME_EVENT, handler as EventListener);
  };
}
