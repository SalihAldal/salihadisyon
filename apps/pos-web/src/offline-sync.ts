const POS_OFFLINE_SYNC_KEY = "pos-web-offline-sync";

export type OfflineQueueOperationKind = "create_ticket" | "add_item" | "collect_payment";
export type OfflineQueueOperationStatus = "queued" | "processing" | "failed" | "conflict";

export type OfflineQueueOperation = {
  id: string;
  kind: OfflineQueueOperationKind;
  ticketId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: OfflineQueueOperationStatus;
  nextRetryAt?: number;
  lastError?: string;
};

export type OfflineTicketSnapshot = Record<string, any> & {
  id: string;
  branchId: string;
  serverTicketId?: string | null;
  syncStatus: "queued" | "syncing" | "failed" | "conflict";
  isOffline: true;
  updatedAt: string;
};

export type OfflineSyncState = {
  version: 1;
  queue: OfflineQueueOperation[];
  tickets: OfflineTicketSnapshot[];
  mappings: Record<string, string>;
};

const EMPTY_STATE: OfflineSyncState = {
  version: 1,
  queue: [],
  tickets: [],
  mappings: {},
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readOfflineSyncState(): OfflineSyncState {
  if (!canUseStorage()) {
    return EMPTY_STATE;
  }
  try {
    const raw = window.localStorage.getItem(POS_OFFLINE_SYNC_KEY);
    if (!raw) {
      return EMPTY_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<OfflineSyncState> | null;
    return {
      version: 1,
      queue: Array.isArray(parsed?.queue) ? parsed.queue : [],
      tickets: Array.isArray(parsed?.tickets) ? parsed.tickets : [],
      mappings: parsed?.mappings && typeof parsed.mappings === "object" ? parsed.mappings : {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function writeOfflineSyncState(state: OfflineSyncState) {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(POS_OFFLINE_SYNC_KEY, JSON.stringify(state));
}

export function createOfflineId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export function isOfflineTicketId(ticketId: string | null | undefined) {
  return typeof ticketId === "string" && ticketId.startsWith("offline_ticket_");
}

export function resolveMappedTicketId(state: OfflineSyncState, ticketId: string) {
  return state.mappings[ticketId] ?? ticketId;
}

export function getOfflineTicketsForBranch(state: OfflineSyncState, branchId: string) {
  return state.tickets.filter((ticket) => String(ticket.branchId) === String(branchId));
}

export function mergeTicketsWithOffline(serverItems: Array<Record<string, any>>, offlineTickets: OfflineTicketSnapshot[]) {
  const serverIds = new Set(serverItems.map((item) => String(item.id)));
  const pendingOffline = offlineTickets.filter((ticket) => !ticket.serverTicketId || !serverIds.has(String(ticket.serverTicketId)));
  return [...pendingOffline, ...serverItems];
}

export function overlayTablesWithOfflineTickets(tablesData: Record<string, any>, offlineTickets: OfflineTicketSnapshot[]) {
  if (!Array.isArray(tablesData?.areas) || offlineTickets.length === 0) {
    return tablesData;
  }

  const offlineByTable = new Map(
    offlineTickets
      .filter((ticket) => ticket.tableId)
      .map((ticket) => [
        String(ticket.tableId),
        {
          activeTicketId: ticket.id,
          status: "OCCUPIED",
        },
      ]),
  );

  return {
    ...tablesData,
    areas: tablesData.areas.map((area: Record<string, any>) => ({
      ...area,
      tables: ((area.tables as Array<Record<string, any>> | undefined) ?? []).map((table) => {
        const offline = offlineByTable.get(String(table.id));
        return offline
          ? {
              ...table,
              ...offline,
            }
          : table;
      }),
    })),
  };
}

export function nextRetryDelayMs(attempts: number) {
  const steps = [3_000, 8_000, 15_000, 30_000, 60_000];
  return steps[Math.min(Math.max(attempts, 0), steps.length - 1)];
}
