"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminToastEventName, type AdminToastPayload } from "../../lib/feedback";

type AdminToastItem = Required<Pick<AdminToastPayload, "id" | "message">> &
  Omit<AdminToastPayload, "id" | "message"> & {
    createdAt: number;
  };

export function AdminFeedbackLayer() {
  const [toasts, setToasts] = useState<AdminToastItem[]>([]);
  const [online, setOnline] = useState(true);
  const toastEventName = useMemo(() => getAdminToastEventName(), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncOnline = () => setOnline(window.navigator.onLine);
    syncOnline();

    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<AdminToastPayload>).detail;
      if (!detail?.message) {
        return;
      }
      const nextToast: AdminToastItem = {
        id: detail.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: detail.title,
        message: detail.message,
        tone: detail.tone ?? "info",
        durationMs: detail.durationMs ?? 4500,
        createdAt: Date.now(),
      };
      setToasts((current) => [...current, nextToast].slice(-5));
    };

    const handleOffline = () => {
      setOnline(false);
      handleToast(
        new CustomEvent(toastEventName, {
          detail: {
            title: "Baglanti kesildi",
            message: "Internet baglantisi yok. Istekler basarisiz olabilir.",
            tone: "warning",
            durationMs: 5000,
          },
        }),
      );
    };

    const handleOnline = () => {
      setOnline(true);
      handleToast(
        new CustomEvent(toastEventName, {
          detail: {
            title: "Baglanti geri geldi",
            message: "Sistem yeniden online.",
            tone: "success",
            durationMs: 3000,
          },
        }),
      );
    };

    window.addEventListener(toastEventName, handleToast as EventListener);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener(toastEventName, handleToast as EventListener);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [toastEventName]);

  useEffect(() => {
    if (!toasts.length) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.durationMs ?? 4500),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts]);

  return (
    <>
      {!online ? (
        <div className="admin-network-banner admin-network-banner--warning">
          Internet baglantisi yok. Veriler guncellenmeyebilir.
        </div>
      ) : null}
      <div className="admin-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`admin-toast admin-toast--${toast.tone ?? "info"}`}>
            {toast.title ? <strong>{toast.title}</strong> : null}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
