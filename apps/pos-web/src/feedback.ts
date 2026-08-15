export type PosToastTone = "success" | "warning" | "danger" | "info";

export type PosToastPayload = {
  id?: string;
  title?: string;
  message: string;
  tone?: PosToastTone;
  durationMs?: number;
};

const POS_TOAST_EVENT = "adisyon:pos-toast";

export function emitPosToast(payload: PosToastPayload) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(POS_TOAST_EVENT, {
      detail: {
        ...payload,
        id: payload.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    }),
  );
}

export function getPosToastEventName() {
  return POS_TOAST_EVENT;
}
