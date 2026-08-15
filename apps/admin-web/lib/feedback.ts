export type AdminToastTone = "success" | "warning" | "danger" | "info";

export type AdminToastPayload = {
  id?: string;
  title?: string;
  message: string;
  tone?: AdminToastTone;
  durationMs?: number;
};

const ADMIN_TOAST_EVENT = "adisyon:admin-toast";

export function emitAdminToast(payload: AdminToastPayload) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(ADMIN_TOAST_EVENT, {
      detail: {
        ...payload,
        id: payload.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    }),
  );
}

export function getAdminToastEventName() {
  return ADMIN_TOAST_EVENT;
}
