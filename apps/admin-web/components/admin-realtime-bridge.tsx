"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import type { StoredAdminUser } from "../lib/auth/session";
import { dispatchAdminRealtimeEvent, resolveAdminSocketUrl, type AdminRealtimeEventName } from "../lib/realtime/admin-realtime";

const ADMIN_REALTIME_EVENTS: AdminRealtimeEventName[] = [
  "ticket.updated",
  "payment.completed",
  "refund.requested",
  "approval.required",
  "table.status.changed",
  "register.updated",
  "cash.closure.created",
  "inventory.stock.changed",
];

export function AdminRealtimeBridge({ user }: { user: StoredAdminUser | null }) {
  useEffect(() => {
    if (!user?.id || !user.branchIds?.length) {
      return;
    }

    const socket = io(resolveAdminSocketUrl(), { transports: ["websocket"] });
    const payload = {
      branchIds: user.branchIds,
      userId: user.id,
    };

    socket.emit("subscribe", payload);

    for (const eventName of ADMIN_REALTIME_EVENTS) {
      socket.on(eventName, (eventPayload: Record<string, unknown>) => {
        dispatchAdminRealtimeEvent(eventName, eventPayload);
      });
    }

    return () => {
      socket.emit("unsubscribe", payload);
      socket.disconnect();
    };
  }, [user?.id, user?.branchIds]);

  return null;
}
