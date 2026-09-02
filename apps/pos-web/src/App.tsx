import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  POS_SOCKET_URL,
  resolvePosSocketPath,
  ensurePosSessionRefreshed,
  getPosSessionInvalidatedEventName,
  getPosSessionRefreshEventName,
  type PosAuthSession,
  posApi,
} from "./api";
import { emitPosToast, getPosToastEventName, type PosToastPayload } from "./feedback";
import { PosLoginScreen } from "./components/pos-auth";
import { WaiterTableLobby } from "./components/waiter-table-lobby";
import { PosTableDetailModal } from "./components/table-detail-modal";
import {
  CatalogContent,
  CatalogPane,
  CatalogToolbar,
  CategoryStrip,
  OperationsToolbar,
  PaymentDrawer,
  PosTopbar,
  ProductGrid,
  SubcategoryStrip,
} from "./components/kardo-pos-layout";
import { PosProductCard } from "./components/pos-product-card";
import { CashCountGrid, NumericKeypad } from "./components/pos-finance";
import { PosReportScreen } from "./components/pos-reports";
import { CASH_DENOMINATIONS, FALLBACK_PAYMENT_METHODS, MAX_VISIBLE_PRODUCTS, NOTE_KEYBOARD_ACTIONS, NOTE_KEYBOARD_ROWS, POS_STORAGE_KEY } from "./pos-constants";
import {
  formatCurrency,
  formatDateInput,
  formatTableDuration,
  getGroupSelectedCount,
  getMissingSelectionMessages,
  getPaymentBucket,
  getTableColor,
  hasSessionPermission,
  isUnauthorizedError,
  isWaiterSession,
  mergeSessionUserFromMe,
  normalizeSessionShape,
  normalizePaymentResult,
  normalizePrintDispatch,
  persistPosSession,
  readStoredSession,
  roundCurrency,
  sanitizeMoneyInput,
} from "./pos-helpers";
import {
  createOfflineId,
  getOfflineTicketsForBranch,
  isOfflineTicketId,
  mergeTicketsWithOffline,
  nextRetryDelayMs,
  overlayTablesWithOfflineTickets,
  readOfflineSyncState,
  resolveMappedTicketId,
  writeOfflineSyncState,
  type OfflineQueueOperation,
  type OfflineSyncState,
  type OfflineTicketSnapshot,
} from "./offline-sync";
import { getOpenTicketsForTable, isOpenTicketStatus } from "./ticket-hierarchy-utils";
import { dispatchTicketRoutingPrint } from "./print-dispatch";
import { formatTicketStatus, getTicketStatusTone, resolveActiveTicketId } from "./waiter-pos-utils";

type PosMode = "TABLE" | "SELF_SERVICE" | "DELIVERY" | "TAKEAWAY";
type PosDrawerKey =
  | "payment"
  | "actions"
  | "history"
  | "catalog"
  | "pending"
  | "note"
  | "register"
  | "expense"
  | "reports"
  | "cancelList"
  | "connections"
  | "ticket"
  | "transfer"
  | "merge"
  | "splitBill"
  | null;
type ProductFlowTab = "options" | "modifiers" | "notes" | "extras";
type PrintDocumentType = "receipt" | "kitchen" | "label";

type LocalPrintJob = {
  id: string;
  ticketId: string | null;
  printerId: string;
  printerName: string;
  documentType: PrintDocumentType;
  status: "queued" | "sent" | "failed";
  queuedAt: string;
  error?: string;
  attempts: number;
};

type PaymentSplitRow = { method: string; amount: number; referenceNumber?: string };

function isQueueableOfflineError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string; isOffline?: boolean; isTimeout?: boolean };
  return Boolean(record.isOffline || record.isTimeout || record.code === "OFFLINE" || record.code === "TIMEOUT" || record.code === "NETWORK_ERROR");
}

function isConflictError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { status?: number };
  return record.status === 409;
}

const serviceModes: Array<{ key: PosMode; label: string; meta: string }> = [
  { key: "TABLE", label: "Masa", meta: "Salon servisi" },
  { key: "SELF_SERVICE", label: "Self Servis", meta: "Hizli kasa akisi" },
  { key: "DELIVERY", label: "Paket", meta: "Kurye teslimi" },
  { key: "TAKEAWAY", label: "Gel-Al", meta: "Hazir al" },
];

const RECEIPT_LINE_WIDTH = 38;
const FLOOR_OPTIONS = [
  { key: "ground", label: "Zemin Kat" },
  { key: "floor1", label: "1. Kat" },
  { key: "floor2", label: "2. Kat" },
] as const;

function normalizeReceiptText(value: string, fallback = "-") {
  const latinSafe = value
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/[^\x20-\x7E]/g, " ");
  const compact = latinSafe.replace(/\s+/g, " ").trim();
  return compact || fallback;
}

function centerReceiptText(value: string, width = RECEIPT_LINE_WIDTH) {
  const text = value.length > width ? value.slice(0, width) : value;
  const leftPadding = Math.max(Math.floor((width - text.length) / 2), 0);
  return `${" ".repeat(leftPadding)}${text}`;
}

function rightReceiptText(value: string, width = RECEIPT_LINE_WIDTH) {
  if (value.length >= width) {
    return value.slice(0, width);
  }
  return `${" ".repeat(width - value.length)}${value}`;
}

function receiptRow(left: string, right: string, width = RECEIPT_LINE_WIDTH) {
  const safeRight = normalizeReceiptText(right, "").slice(0, Math.max(1, width - 8));
  const maxLeftLength = Math.max(1, width - safeRight.length - 1);
  const safeLeftRaw = normalizeReceiptText(left).slice(0, maxLeftLength);
  const safeLeft = safeLeftRaw.length < normalizeReceiptText(left).length ? `${safeLeftRaw.slice(0, Math.max(0, safeLeftRaw.length - 1))}…` : safeLeftRaw;
  const spaces = " ".repeat(Math.max(1, width - safeLeft.length - safeRight.length));
  return `${safeLeft}${spaces}${safeRight}`;
}

function splitReceiptLines(value: string, width = RECEIPT_LINE_WIDTH) {
  const words = normalizeReceiptText(value).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const proposal = line ? `${line} ${word}` : word;
    if (proposal.length <= width) {
      line = proposal;
      continue;
    }
    if (line) {
      lines.push(line);
      line = word;
      continue;
    }
    lines.push(word.slice(0, width));
    line = word.slice(width);
  }
  if (line) {
    lines.push(line);
  }
  return lines.length > 0 ? lines : ["-"];
}

function toReceiptMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return `${amount.toFixed(2)} TL`;
}

function toReceiptDate(value: unknown) {
  if (!value) {
    return new Date().toLocaleString("tr-TR");
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toLocaleString("tr-TR");
  }
  return parsed.toLocaleString("tr-TR");
}

function toReceiptPaymentMethodLabel(method: unknown) {
  const normalized = String(method ?? "").toUpperCase();
  if (normalized === "CASH") return "Nakit";
  if (normalized === "CREDIT_CARD") return "Kredi Karti";
  if (normalized === "MEAL_CARD") return "Yemek Karti";
  if (normalized === "GIFT_CARD") return "Hediye Ceki";
  if (normalized === "MOBILE") return "Mobil";
  return normalized || "Odeme";
}

function buildReceiptContent(
  ticket: Record<string, any>,
  context: {
    branchId: string;
    terminalName: string;
    printerName: string;
  },
) {
  const separator = "-".repeat(RECEIPT_LINE_WIDTH);
  const lines: string[] = [];
  const items = (ticket.items as Array<Record<string, any>> | undefined) ?? [];
  const ticketDate = toReceiptDate(ticket.closedAt ?? ticket.openedAt);
  const branchName = normalizeReceiptText(context.branchId, "-");

  lines.push(centerReceiptText("ALDAL POS"));
  lines.push(centerReceiptText("ADISYON FISI"));
  lines.push(separator);
  lines.push(`Tarih: ${ticketDate}`);
  lines.push(`Sube : ${branchName}`);
  lines.push(separator);
  lines.push(centerReceiptText("URUNLER"));
  lines.push(separator);

  if (items.length === 0) {
    lines.push(receiptRow("Urun bulunamadi", "0.00"));
  } else {
    for (const item of items) {
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unitPrice ?? 0);
      const lineTotal = Number(item.lineTotal ?? quantity * unitPrice);
      const title = `${quantity} x ${String(item.productName ?? "Urun")}`;
      lines.push(receiptRow(title, lineTotal.toFixed(2)));
      const itemNote = normalizeReceiptText(String(item.notes ?? item.note ?? ""), "").trim();
      if (itemNote.length > 0) {
        const noteLines = splitReceiptLines(`Not: ${itemNote}`, RECEIPT_LINE_WIDTH - 2);
        for (const noteLine of noteLines) {
          lines.push(`  ${noteLine}`);
        }
      }
    }
  }

  lines.push(separator);
  lines.push(receiptRow("TOPLAM", Number(ticket.grandTotal ?? 0).toFixed(2)));
  lines.push(centerReceiptText("Tesekkurler"));
  lines.push(separator);
  return lines.join("\n");
}

function buildKitchenContent(
  ticket: Record<string, any>,
  items: Array<Record<string, any>>,
  context: {
    stationLabel: string;
    branchId: string;
    tableLabel: string;
    printerName: string;
  },
) {
  const separator = "-".repeat(RECEIPT_LINE_WIDTH);
  const lines: string[] = [];
  const ticketDate = toReceiptDate(ticket.openedAt ?? ticket.closedAt);
  const branchName = normalizeReceiptText(context.branchId, "-");
  const tableName = normalizeReceiptText(context.tableLabel || "-", "-");

  lines.push(centerReceiptText("ALDAL POS"));
  lines.push(centerReceiptText(`${normalizeReceiptText(context.stationLabel, "Mutfak")} SIPARIS FISI`));
  lines.push(separator);
  lines.push(`Tarih: ${ticketDate}`);
  lines.push(`Sube : ${branchName}`);
  lines.push(`Masa : ${tableName}`);
  lines.push(`Adisyon: ${normalizeReceiptText(ticket.ticketName ?? ticket.id ?? "-", "-")}`);
  lines.push(separator);

  if (items.length === 0) {
    lines.push(receiptRow("Urun bulunamadi", "-"));
  } else {
    for (const item of items) {
      const quantity = Number(item.quantity ?? 0);
      const title = `${quantity} x ${String(item.productName ?? "Urun")}`;
      lines.push(splitReceiptLines(normalizeReceiptText(title), RECEIPT_LINE_WIDTH).join("\n"));
      const itemNote = normalizeReceiptText(String(item.notes ?? item.note ?? ""), "").trim();
      if (itemNote.length > 0) {
        const noteLines = splitReceiptLines(`Not: ${itemNote}`, RECEIPT_LINE_WIDTH - 2);
        for (const noteLine of noteLines) {
          lines.push(`  ${noteLine}`);
        }
      }
    }
  }

  lines.push(separator);
  lines.push(centerReceiptText(`Printer: ${normalizeReceiptText(context.printerName, "-")}`));
  lines.push(separator);
  return lines.join("\n");
}

export function App() {
  const configCacheRef = useRef<Map<string, { data: Record<string, any>; cachedAt: number }>>(new Map());
  const syncInFlightRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const offlineSyncStateRef = useRef<OfflineSyncState>(readOfflineSyncState());
  const [session, setSession] = useState<PosAuthSession | null>(() => readStoredSession());
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(() => (typeof window === "undefined" ? true : window.navigator.onLine));
  const [toasts, setToasts] = useState<Array<PosToastPayload & { id: string }>>([]);
  const [pendingOps, setPendingOps] = useState<Record<string, boolean>>({});
  const [branchId, setBranchId] = useState<string>("");
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>("");
  const [mode, setMode] = useState<PosMode>("TABLE");
  const [catalog, setCatalog] = useState<Record<string, any>>({});
  const [tablesData, setTablesData] = useState<Record<string, any>>({});
  const [pendingOrders, setPendingOrders] = useState<Array<Record<string, any>>>([]);
  const [ticketsData, setTicketsData] = useState<Record<string, any>>({});
  const [selectedTicket, setSelectedTicket] = useState<Record<string, any> | null>(null);
  const [selectedTableContext, setSelectedTableContext] = useState<Record<string, any> | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFloor, setActiveFloor] = useState<(typeof FLOOR_OPTIONS)[number]["key"]>("ground");
  const [activeDrawer, setActiveDrawer] = useState<PosDrawerKey>(null);
  const [waiterLockedTicketIds, setWaiterLockedTicketIds] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [quickActionSearch, setQuickActionSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Record<string, any> | null>(null);
  const [productFlowTab, setProductFlowTab] = useState<ProductFlowTab>("options");
  const [productFlowError, setProductFlowError] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<Record<string, any>>({
    quantity: 1,
    note: "",
    variantIds: [],
    modifierOptionIds: [],
    requiredChoiceOptionIds: [],
  });
  const [paymentSplits, setPaymentSplits] = useState<Array<{ method: string; amount: number; referenceNumber?: string }>>([]);
  const [paymentForm, setPaymentForm] = useState<{ method: string; amount: string; referenceNumber: string }>({
    method: "CASH",
    amount: "",
    referenceNumber: "",
  });
  const [splitDraft, setSplitDraft] = useState<{ itemId: string; quantity: string }>({
    itemId: "",
    quantity: "1",
  });
  const [personSplitDraft, setPersonSplitDraft] = useState<Array<{ label: string; itemId: string; quantity: string }>>([
    { label: "Kisi 1", itemId: "", quantity: "1" },
    { label: "Kisi 2", itemId: "", quantity: "1" },
  ]);
  const [splitMode, setSplitMode] = useState<"item" | "person">("item");
  const [printJobs, setPrintJobs] = useState<LocalPrintJob[]>([]);
  const [discountForm, setDiscountForm] = useState<{ discountConfigId: string; label: string; amount: string; ticketItemId: string }>({
    discountConfigId: "",
    label: "",
    amount: "",
    ticketItemId: "",
  });
  const [registerForm, setRegisterForm] = useState<{
    openingCash: string;
    cardAmount: string;
    mobileAmount: string;
    denominations: Record<string, number>;
  }>({
    openingCash: "",
    cardAmount: "",
    mobileAmount: "",
    denominations: Object.fromEntries(CASH_DENOMINATIONS.map((value) => [String(value), 0])),
  });
  const [registerResult, setRegisterResult] = useState<Record<string, any> | null>(null);
  const [expenseForm, setExpenseForm] = useState<{ description: string; amount: string }>({
    description: "",
    amount: "",
  });
  const [reportFilters, setReportFilters] = useState<{ dateFrom: string; dateTo: string }>({
    dateFrom: formatDateInput(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)),
    dateTo: formatDateInput(new Date()),
  });
  const [reportData, setReportData] = useState<Record<string, any> | null>(null);
  const [cancelListRows, setCancelListRows] = useState<Array<Record<string, any>>>([]);
  const [cancelListLoading, setCancelListLoading] = useState(false);
  const [cancelListError, setCancelListError] = useState<string | null>(null);
  const [cancelListSearch, setCancelListSearch] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<Record<string, any> | null>(null);
  const [actionForm, setActionForm] = useState<{
    ticketName: string;
    coverCount: string;
    discountAmount: string;
    discountLabel: string;
    discountScope: "ticket" | "line";
    discountMode: "amount" | "percent";
  }>({
    ticketName: "",
    coverCount: "1",
    discountAmount: "",
    discountLabel: "Manuel Indirim",
    discountScope: "ticket",
    discountMode: "amount",
  });
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: (() => Promise<void>) | null }>({
    title: "",
    message: "",
    onConfirm: null,
  });
  const [financialConfirm, setFinancialConfirm] = useState<{
    title: string;
    message: string;
    reason: string;
    onConfirm: ((reason: string) => Promise<void>) | null;
  }>({
    title: "",
    message: "",
    reason: "",
    onConfirm: null,
  });
  const [offlineSyncState, setOfflineSyncState] = useState<OfflineSyncState>(() => readOfflineSyncState());
  const [syncBusy, setSyncBusy] = useState(false);

  function openDrawer(key: Exclude<PosDrawerKey, null>) {
    if (isWaiterSession(session) && !["ticket", "note", "catalog"].includes(key)) {
      setError(`Garson modunda sadece siparis (urun ekleme) ve not akisina erisilebilir. (blok: ${key})`);
      return;
    }
    if ((key === "payment" || key === "actions" || key === "note" || key === "ticket" || key === "catalog") && !selectedTicket) {
      setError("Once aktif bir adisyon sec.");
      return;
    }
    if (key === "expense" && !hasSessionPermission(session, "expense.manage")) {
      setError("Gider ekleme yetkin yok.");
      return;
    }
    if (key === "register" && !hasSessionPermission(session, "register.close") && !hasSessionPermission(session, "register.open")) {
      setError("Kasa islemleri yetkin yok.");
      return;
    }
    if (key === "reports" && !hasSessionPermission(session, "reports.view")) {
      setError("Rapor goruntuleme yetkin yok.");
      return;
    }
    if (key === "cancelList" && !hasSessionPermission(session, "reports.view")) {
      setError("Iptal listesi icin rapor yetkisi gerekli.");
      return;
    }
    if (key === "connections" && !hasSessionPermission(session, "device.view")) {
      setError("Baglanti kontrol ekranini gorme yetkin yok.");
      return;
    }
    if (key === "payment" && !hasSessionPermission(session, "payment.manage")) {
      setError("Odeme alma yetkin yok.");
      return;
    }
    if (key === "payment" && !featureFlags.new_payment_system) {
      setInfo("Yeni odeme sistemi flag kapali. Varsayilan odeme akisi kullaniliyor.");
    }
    if (key === "pending") {
      setQuickActionSearch("");
    }
    setActiveDrawer(key);
    if (key === "reports") {
      void loadReportSummary().catch(() => {
        // runOp hata bilgisini zaten UI'ye yaziyor
      });
    }
    if (key === "cancelList") {
      void loadCancelList().catch(() => {
        // runOp hata bilgisini zaten UI'ye yaziyor
      });
    }
    if (key === "connections") {
      void loadConnectionStatus().catch(() => {
        // runOp hata bilgisini zaten UI'ye yaziyor
      });
    }
  }

  function beginOp(op: string) {
    setPendingOps((current) => ({ ...current, [op]: true }));
    setError(null);
    setInfo(null);
  }

  function endOp(op: string) {
    setPendingOps((current) => {
      const next = { ...current };
      delete next[op];
      return next;
    });
  }

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = (await posApi.me(session.accessToken)) as Record<string, unknown>;
        if (cancelled) return;
        const synced = mergeSessionUserFromMe(session, me);
        persistPosSession(synced);
        setSession(synced);
      } catch {
        if (!cancelled) {
          setSession(null);
          window.localStorage.removeItem(POS_STORAGE_KEY);
          setError("Oturum dogrulanamadi. Lutfen tekrar giris yapin.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const toastEventName = getPosToastEventName();
    const sessionRefreshEventName = getPosSessionRefreshEventName();
    const sessionInvalidatedEventName = getPosSessionInvalidatedEventName();
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<PosToastPayload>).detail;
      if (!detail?.message) return;
      setToasts((current) => [...current, { ...detail, id: detail.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }].slice(-4));
    };
    const handleSessionRefresh = (event: Event) => {
      const detail = (event as CustomEvent<PosAuthSession>).detail;
      if (!detail?.accessToken) return;
      setSession(detail);
      setInfo("Oturum otomatik yenilendi.");
    };
    const handleSessionInvalidated = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      setSession(null);
      setError(detail?.reason || "Oturum suresi doldu. Lutfen tekrar giris yapin.");
    };
    const handleOnline = () => {
      setOnline(true);
      setInfo("Baglanti geri geldi.");
    };
    const handleOffline = () => {
      setOnline(false);
      setError("Internet baglantisi koptu. Online istekler basarisiz olabilir.");
    };

    window.addEventListener(toastEventName, handleToast as EventListener);
    window.addEventListener(sessionRefreshEventName, handleSessionRefresh as EventListener);
    window.addEventListener(sessionInvalidatedEventName, handleSessionInvalidated as EventListener);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener(toastEventName, handleToast as EventListener);
      window.removeEventListener(sessionRefreshEventName, handleSessionRefresh as EventListener);
      window.removeEventListener(sessionInvalidatedEventName, handleSessionInvalidated as EventListener);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!session?.refreshToken) return;
    void ensurePosSessionRefreshed();
  }, [session?.refreshToken]);

  useEffect(() => {
    if (!session?.accessToken) {
      setFeatureFlags({});
      return;
    }

    let active = true;
    posApi
      .featureFlags(session.accessToken)
      .then((response) => {
        if (!active) return;
        setFeatureFlags(Object.fromEntries(response.items.map((item) => [item.key, item.effectiveEnabled])));
      })
      .catch(() => {
        if (active) setFeatureFlags({});
      });

    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!toasts.length) {
      return;
    }
    const timers = toasts.map((toast) =>
      globalThis.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.durationMs ?? 4000),
    );
    return () => {
      timers.forEach((timer) => globalThis.clearTimeout(timer));
    };
  }, [toasts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    writeOfflineSyncState(offlineSyncState);
    offlineSyncStateRef.current = offlineSyncState;
  }, [offlineSyncState]);

  async function runOp<T>(op: string, fn: () => Promise<T>) {
    beginOp(op);
    try {
      return await fn();
    } catch (operationError) {
      if (
        operationError instanceof Error &&
        operationError.message.toLowerCase().includes("kapali adisyon uzerinde islem yapilamaz")
      ) {
        setSelectedTicket(null);
        setSelectedItemId(null);
        setSelectedProduct(null);
        setActiveDrawer(null);
        if (branchId) {
          try {
            await loadAll(branchId, null);
          } catch {
            // Orijinal hata mesaji kullaniciya gosterilmeye devam eder.
          }
        }
      }
      setError(operationError instanceof Error ? operationError.message : "Islem basarisiz.");
      throw operationError;
    } finally {
      endOp(op);
    }
  }

  function closeDrawer() {
    if (activeDrawer === "ticket" && isWaiterSession(session) && selectedTicket?.id) {
      setWaiterLockedTicketIds((current) => (current.includes(String(selectedTicket.id)) ? current : [...current, String(selectedTicket.id)]));
    }
    if (activeDrawer === "payment") {
      setPaymentSplits([]);
      setPaymentForm((current) => ({ ...current, amount: "", referenceNumber: "" }));
    }
    if (activeDrawer === "note") {
      setNoteDraft("");
    }
    if (activeDrawer === "expense") {
      setExpenseForm({ description: "", amount: "" });
    }
    setActiveDrawer(null);
  }

  function updateOfflineSyncState(updater: (current: OfflineSyncState) => OfflineSyncState) {
    setOfflineSyncState((current) => updater(current));
  }

  function upsertOfflineTicket(snapshot: OfflineTicketSnapshot) {
    updateOfflineSyncState((current) => {
      const existingIndex = current.tickets.findIndex((ticket) => String(ticket.id) === String(snapshot.id));
      const tickets = [...current.tickets];
      if (existingIndex >= 0) {
        tickets[existingIndex] = snapshot;
      } else {
        tickets.unshift(snapshot);
      }
      return {
        ...current,
        tickets,
      };
    });
  }

  function updateOfflineTicket(ticketId: string, updater: (ticket: OfflineTicketSnapshot) => OfflineTicketSnapshot) {
    updateOfflineSyncState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) => (String(ticket.id) === String(ticketId) ? updater(ticket) : ticket)),
    }));
  }

  function enqueueOfflineOperation(kind: OfflineQueueOperation["kind"], ticketId: string, payload: Record<string, unknown>) {
    const now = new Date().toISOString();
    const operation: OfflineQueueOperation = {
      id: createOfflineId("queue_op"),
      kind,
      ticketId,
      payload,
      idempotencyKey: createOfflineId("idem"),
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      status: "queued",
    };
    updateOfflineSyncState((current) => ({
      ...current,
      queue: [...current.queue, operation],
    }));
    return operation;
  }

  function applyOfflineTicketSelection(ticketId: string) {
    const ticket = offlineSyncState.tickets.find((item) => String(item.id) === String(ticketId)) ?? null;
    if (ticket) {
      setSelectedTicket(ticket);
    }
  }

  async function syncOfflineQueue(forceFocusTicketId?: string | null) {
    if (!session || !branchId || !online || syncInFlightRef.current) {
      return;
    }
    let syncState = readOfflineSyncState();
    const applySyncState = (updater: (current: OfflineSyncState) => OfflineSyncState) => {
      syncState = updater(syncState);
      setOfflineSyncState(syncState);
    };

    const queuedItems = syncState.queue;
    if (queuedItems.length === 0) {
      return;
    }

    syncInFlightRef.current = true;
    setSyncBusy(true);
    let shouldRefresh = false;

    try {
      for (const entry of queuedItems) {
        if (entry.nextRetryAt && entry.nextRetryAt > Date.now()) {
          continue;
        }

        updateOfflineSyncState((current) => ({
          ...current,
          queue: current.queue.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  status: "processing",
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        }));
        syncState = readOfflineSyncState();

        try {
          if (entry.kind === "create_ticket") {
            const created = await posApi.createTicket(session.accessToken, entry.payload, {
              idempotencyKey: entry.idempotencyKey,
            });
            const serverTicketId = String(created.id);
            applySyncState((current) => ({
              ...current,
              mappings: {
                ...current.mappings,
                [entry.ticketId]: serverTicketId,
              },
              queue: current.queue.filter((item) => item.id !== entry.id),
              tickets: current.tickets.map((ticket) =>
                String(ticket.id) === String(entry.ticketId)
                  ? {
                      ...ticket,
                      serverTicketId,
                      syncStatus: "syncing",
                      updatedAt: new Date().toISOString(),
                    }
                  : ticket,
              ),
            }));
            shouldRefresh = true;
            continue;
          }

          const resolvedTicketId = resolveMappedTicketId(syncState, entry.ticketId);
          if (!resolvedTicketId || isOfflineTicketId(resolvedTicketId)) {
            break;
          }

          if (entry.kind === "add_item") {
            await posApi.addItem(session.accessToken, resolvedTicketId, entry.payload, {
              idempotencyKey: entry.idempotencyKey,
            });
          }

          if (entry.kind === "collect_payment") {
            await posApi.collectPayment(session.accessToken, resolvedTicketId, entry.payload, {
              idempotencyKey: entry.idempotencyKey,
            });
          }

          applySyncState((current) => ({
            ...current,
            queue: current.queue.filter((item) => item.id !== entry.id),
          }));
          shouldRefresh = true;
        } catch (syncError) {
          if (isQueueableOfflineError(syncError)) {
            applySyncState((current) => ({
              ...current,
              queue: current.queue.map((item) =>
                item.id === entry.id
                  ? {
                      ...item,
                      status: "failed",
                      attempts: item.attempts + 1,
                      lastError: syncError instanceof Error ? syncError.message : "Senkron hatasi",
                      nextRetryAt: Date.now() + nextRetryDelayMs(item.attempts),
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            }));
            break;
          }

          if (isConflictError(syncError)) {
            applySyncState((current) => ({
              ...current,
              queue: current.queue.map((item) =>
                item.id === entry.id
                  ? {
                      ...item,
                      status: "conflict",
                      attempts: item.attempts + 1,
                      lastError: syncError instanceof Error ? syncError.message : "Veri cakismasi",
                      updatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
              tickets: current.tickets.map((ticket) =>
                String(ticket.id) === String(entry.ticketId)
                  ? {
                      ...ticket,
                      syncStatus: "conflict",
                      updatedAt: new Date().toISOString(),
                    }
                  : ticket,
              ),
            }));
            emitPosToast({
              tone: "warning",
              title: "Sync Cakismasi",
              message: "Bir offline islem sunucudaki veriyle cakisti. Kayit kuyrukta conflict durumuna alindi.",
            });
            continue;
          }

          throw syncError;
        }
      }
    } finally {
      syncInFlightRef.current = false;
      setSyncBusy(false);
      if (shouldRefresh) {
        const requestedFocusTicketId = forceFocusTicketId ?? (selectedTicket?.id ? String(selectedTicket.id) : null);
        const focusTicketId = requestedFocusTicketId ? resolveMappedTicketId(syncState, requestedFocusTicketId) : null;
        void loadAll(branchId, focusTicketId || null).catch(() => {});
      }
    }
  }

  function buildOfflineTicket(nextMode: PosMode, tableId?: string) {
    const ticketId = createOfflineId("offline_ticket");
    const now = new Date().toISOString();
    const table = tableId ? tables.find((item) => String(item.id) === String(tableId)) : null;
    return {
      id: ticketId,
      branchId,
      tableId: tableId ?? null,
      tableName: table ? String(table.name ?? "-") : "-",
      ticketName: nextMode === "TABLE" ? `Masa ${table ? String(table.name ?? "") : ""}`.trim() : `${nextMode} / ${new Date().toLocaleTimeString("tr-TR")}`,
      customerName: "-",
      channel: nextMode,
      coverCount: nextMode === "TABLE" ? 2 : 1,
      status: "OPEN",
      items: [],
      payments: [],
      subtotal: 0,
      grandTotal: 0,
      remainingAmount: 0,
      paidTotal: 0,
      createdAt: now,
      updatedAt: now,
      isOffline: true,
      syncStatus: "queued" as const,
      serverTicketId: null,
    } satisfies OfflineTicketSnapshot;
  }

  function appendOfflineItemToTicket(ticket: Record<string, any>, itemPayload: Record<string, unknown>) {
    const quantity = Number(itemPayload.quantity ?? 1);
    const itemTotal = roundCurrency(previewTotal);
    const nextItems = [
      ...(((ticket.items as Array<Record<string, any>> | undefined) ?? [])),
      {
        id: createOfflineId("offline_item"),
        productId: itemPayload.productId,
        productName: String(selectedProduct?.name ?? "Urun"),
        quantity,
        notes: String(itemPayload.note ?? ""),
        modifiersJson: {
          variantIds: itemPayload.variantIds ?? [],
          modifierOptionIds: itemPayload.modifierOptionIds ?? [],
          requiredChoiceOptionIds: itemPayload.requiredChoiceOptionIds ?? [],
        },
        lineTotal: itemTotal,
        discountTotal: 0,
      },
    ];
    const subtotal = roundCurrency(Number(ticket.subtotal ?? 0) + itemTotal);
    const grandTotal = roundCurrency(Number(ticket.grandTotal ?? 0) + itemTotal);
    const paidTotal = roundCurrency(Number(ticket.paidTotal ?? 0));
    const nextTicket: OfflineTicketSnapshot = {
      ...ticket,
      id: String(ticket.id),
      branchId: String(ticket.branchId ?? branchId),
      items: nextItems,
      subtotal,
      grandTotal,
      remainingAmount: roundCurrency(Math.max(grandTotal - paidTotal, 0)),
      updatedAt: new Date().toISOString(),
      isOffline: true,
      syncStatus: "queued",
    };
    return nextTicket;
  }

  function appendOfflinePaymentToTicket(ticket: Record<string, any>, splits: PaymentSplitRow[]) {
    const nextPayments = [
      ...((((ticket.payments as Array<Record<string, any>> | undefined) ?? []))),
      ...splits.map((split) => ({
        id: createOfflineId("offline_payment"),
        method: split.method,
        amount: split.amount,
        referenceNumber: split.referenceNumber,
        status: "QUEUED",
        createdAt: new Date().toISOString(),
        isOffline: true,
      })),
    ];
    const paidTotal = roundCurrency(Number(ticket.paidTotal ?? 0) + splits.reduce((sum, split) => sum + Number(split.amount ?? 0), 0));
    const grandTotal = roundCurrency(Number(ticket.grandTotal ?? 0));
    const remainingAmount = roundCurrency(Math.max(grandTotal - paidTotal, 0));
    const nextTicket: OfflineTicketSnapshot = {
      ...ticket,
      id: String(ticket.id),
      branchId: String(ticket.branchId ?? branchId),
      payments: nextPayments,
      paidTotal,
      remainingAmount,
      status: remainingAmount <= 0.01 ? "PAID" : String(ticket.status ?? "OPEN"),
      updatedAt: new Date().toISOString(),
      isOffline: true,
      syncStatus: "queued",
    };
    return nextTicket;
  }

  async function loadReportSummary(nextFilters?: { dateFrom: string; dateTo: string }) {
    if (!session || !branchId) return;
    if (!hasSessionPermission(session, "reports.view")) {
      setError("Rapor goruntuleme yetkin yok.");
      return;
    }
    const filters = nextFilters ?? reportFilters;
    await runOp("loadReportSummary", async () => {
      const response = await posApi.reportSummary(session.accessToken, {
        branchId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
      setReportData(response);
    });
  }

  async function loadCancelList() {
    if (!session) return;
    if (!hasSessionPermission(session, "reports.view")) {
      setError("Iptal listesi icin rapor yetkisi gerekli.");
      return;
    }
    setCancelListLoading(true);
    setCancelListError(null);
    try {
      const response = await posApi.auditLogs(session.accessToken, {
        module: "pos",
        limit: 250,
      });
      const items = (response.items as Array<Record<string, any>> | undefined) ?? [];
      const mapped = items
        .filter((item) => ["ticket.item.cancel", "ticket.void"].includes(String(item.action)))
        .map((item) => {
          const payload = (item.payload ?? {}) as Record<string, any>;
          const action = String(item.action);
          const actionLabel = action === "ticket.void" ? "Adisyon Iptal" : "Urun Iptal";
          return {
            id: String(item.id),
            action,
            actionLabel,
            ticketId: String(payload.ticketId ?? item.entityId ?? "-"),
            tableName: String(payload.tableName ?? payload.tableCode ?? payload.tableId ?? "-"),
            productName: String(payload.productName ?? "-"),
            quantity: Number(payload.quantity ?? 0),
            reason: String(payload.reason ?? "-"),
            createdAt: String(item.createdAt ?? payload.removedAt ?? ""),
            userName: String(item.user?.fullName ?? "Bilinmeyen"),
          };
        });
      setCancelListRows(mapped);
    } catch (loadError) {
      setCancelListError(loadError instanceof Error ? loadError.message : "Iptal listesi yuklenemedi.");
    } finally {
      setCancelListLoading(false);
    }
  }

  async function loadConnectionStatus(nextTerminalId?: string) {
    if (!session || !branchId) return;
    const terminalId = nextTerminalId ?? (selectedTerminalId || undefined);
    await runOp("loadConnectionStatus", async () => {
      const response = await posApi.connectionStatus(session.accessToken, branchId, terminalId);
      setConnectionStatus(response);
    });
  }

  function toggleDrawer(key: Exclude<PosDrawerKey, null>) {
    setActiveDrawer((current) => (current === key ? null : key));
  }

  function logoutSession() {
    window.localStorage.removeItem(POS_STORAGE_KEY);
    configCacheRef.current.clear();
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    setError(null);
    setInfo(null);
    setSelectedProduct(null);
    setSelectedItemId(null);
    setSelectedTableContext(null);
    setSelectedTicket(null);
    setActiveDrawer(null);
    setBranchId("");
    setSession(null);
  }

  function expireSession() {
    window.localStorage.removeItem(POS_STORAGE_KEY);
    configCacheRef.current.clear();
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    setSession(null);
    setBranchId("");
    setSelectedTicket(null);
    setSelectedTableContext(null);
    setError("Oturum suresi doldu. Lutfen tekrar giris yapin.");
  }

  function resolveServerTicketId(ticketId: string) {
    const resolved = resolveMappedTicketId(offlineSyncStateRef.current, ticketId);
    return isOfflineTicketId(resolved) ? null : resolved;
  }

  async function resolveBranchId(nextSession: PosAuthSession) {
    const fromSession = nextSession.user.defaultBranchId ?? nextSession.user.branchIds[0];
    if (fromSession) return fromSession;

    const me = await posApi.me(nextSession.accessToken);
    const meRecord = me as Record<string, any>;
    const fallbackBranchId =
      (typeof meRecord.defaultBranchId === "string" && meRecord.defaultBranchId) ||
      (typeof meRecord.defaultBranch?.id === "string" ? meRecord.defaultBranch.id : null) ||
      (Array.isArray(meRecord.branchIds) ? String(meRecord.branchIds[0] ?? "") : "");

    if (!fallbackBranchId) return "";

    const patched: PosAuthSession = {
      ...nextSession,
      user: {
        ...nextSession.user,
        defaultBranchId: fallbackBranchId,
        branchIds: nextSession.user.branchIds.length ? nextSession.user.branchIds : [fallbackBranchId],
      },
    };
    window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(patched));
    setSession(patched);
    return fallbackBranchId;
  }

  async function loadAll(useBranchId?: string, focusTicketId?: string | null) {
    if (!session) return;
    let resolvedBranchId = useBranchId ?? branchId ?? session.user.defaultBranchId ?? session.user.branchIds[0];
    if (!resolvedBranchId) {
      resolvedBranchId = await resolveBranchId(session);
    }
    if (!resolvedBranchId) {
      throw new Error("Şube bilgisi bulunamadı. Lütfen tekrar giriş yapın.");
    }
    setBranchId(resolvedBranchId);

    const currentOfflineState = offlineSyncStateRef.current;
    const configCacheKey = `${session.user.tenantId}:${resolvedBranchId}:${selectedTerminalId || "default"}`;
    const cachedConfig = configCacheRef.current.get(configCacheKey);
    const hasFreshConfig = Boolean(cachedConfig && Date.now() - cachedConfig.cachedAt < 30_000);
    let catalogResponse: Record<string, any>;
    let tablesResponse: Record<string, any>;
    let pendingResponse: Record<string, any>;
    let ticketsResponse: Record<string, any>;
    try {
      [catalogResponse, tablesResponse, pendingResponse, ticketsResponse] = await Promise.all([
        hasFreshConfig
          ? Promise.resolve((cachedConfig as { data: Record<string, any> }).data)
          : posApi.config(session.accessToken, resolvedBranchId, selectedTerminalId || undefined),
        posApi.tables(session.accessToken, resolvedBranchId),
        posApi.pendingOrders(session.accessToken, resolvedBranchId),
        posApi.tickets(session.accessToken, { branchId: resolvedBranchId }),
      ]);
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        expireSession();
      }
      throw loadError;
    }

    setCatalog(catalogResponse);
    configCacheRef.current.set(configCacheKey, { data: catalogResponse, cachedAt: Date.now() });
    const terminalsFromConfig = ((catalogResponse.terminals as Array<Record<string, any>> | undefined) ?? []);
    const selectedTerminal =
      terminalsFromConfig.find((item) => Boolean(item.isSelected)) ??
      (selectedTerminalId ? terminalsFromConfig.find((item) => String(item.id) === selectedTerminalId) : null) ??
      terminalsFromConfig[0] ??
      null;
    setSelectedTerminalId(selectedTerminal?.id ? String(selectedTerminal.id) : "");
    const serverOpenTicketItems = ((ticketsResponse.items as Array<Record<string, any>>) ?? []);
    const serverOpenTicketIds = new Set(serverOpenTicketItems.map((ticket) => String(ticket.id)));
    let nextOfflineState = currentOfflineState;
    const staleOfflineTicketIds = getOfflineTicketsForBranch(currentOfflineState, resolvedBranchId)
      .filter((ticket) => {
        const mappedServerId = ticket.serverTicketId ? String(ticket.serverTicketId) : "";
        return Boolean(mappedServerId) && !serverOpenTicketIds.has(mappedServerId);
      })
      .map((ticket) => String(ticket.id));
    if (staleOfflineTicketIds.length > 0) {
      nextOfflineState = {
        ...currentOfflineState,
        tickets: currentOfflineState.tickets.filter((ticket) => !staleOfflineTicketIds.includes(String(ticket.id))),
        queue: currentOfflineState.queue.filter((entry) => !staleOfflineTicketIds.includes(String(entry.ticketId))),
        mappings: Object.fromEntries(
          Object.entries(currentOfflineState.mappings).filter(
            ([offlineId, serverId]) =>
              !staleOfflineTicketIds.includes(String(offlineId)) && serverOpenTicketIds.has(String(serverId)),
          ),
        ),
      };
      setOfflineSyncState(nextOfflineState);
      offlineSyncStateRef.current = nextOfflineState;
    }
    const branchOfflineTickets = getOfflineTicketsForBranch(nextOfflineState, resolvedBranchId);
    setTablesData(overlayTablesWithOfflineTickets(tablesResponse, branchOfflineTickets));
    setPendingOrders(((pendingResponse.items as Array<Record<string, any>>) ?? []).slice(0, 8));
    const mergedOpenTicketItems = mergeTicketsWithOffline(serverOpenTicketItems, branchOfflineTickets);
    setTicketsData({
      ...ticketsResponse,
      items: mergedOpenTicketItems,
    });

    const openTicketItems = mergedOpenTicketItems;
    const nextTicketId = focusTicketId === undefined ? (selectedTicket?.id ?? null) : focusTicketId;
    if (nextTicketId) {
      const offlineMatch = branchOfflineTickets.find((ticket) => String(ticket.id) === String(nextTicketId));
      if (offlineMatch) {
        const mappedServerId = resolveMappedTicketId(nextOfflineState, String(offlineMatch.id));
        if (mappedServerId !== String(offlineMatch.id) && !serverOpenTicketIds.has(String(mappedServerId))) {
          setSelectedTicket(null);
        } else {
          setSelectedTicket(offlineMatch);
          return;
        }
      }
      const matchingOpenTicket = openTicketItems.find((ticket) => String(ticket.id) === String(nextTicketId));
      if (matchingOpenTicket) {
        const resolvedFocusTicketId = resolveMappedTicketId(nextOfflineState, String(nextTicketId));
        const detail = await posApi.ticketDetail(session.accessToken, resolvedFocusTicketId);
        setSelectedTicket(detail);
        return;
      }
    }

    if (mode === "TABLE") {
      setSelectedTicket(null);
      return;
    }
    const firstOpenTicket = openTicketItems[0] ?? null;
    setSelectedTicket(firstOpenTicket);
  }

  useEffect(() => {
    if (!session) return;
    const resolvedBranchId = session.user.defaultBranchId ?? session.user.branchIds[0] ?? "";
    void loadAll(resolvedBranchId).catch((loadError) => {
      if (isUnauthorizedError(loadError)) return;
      setError(loadError instanceof Error ? loadError.message : "POS verisi yuklenemedi.");
    });
  }, [session?.accessToken, session?.user.defaultBranchId, session?.user.tenantId]);

  useEffect(() => {
    if (!session || !online) {
      return;
    }
    void syncOfflineQueue(selectedTicket?.id ? String(selectedTicket.id) : null);
  }, [online, session, branchId]);

  useEffect(() => {
    if (!session || !branchId) return;
    const socket = io(POS_SOCKET_URL, {
      path: resolvePosSocketPath(),
      transports: ["websocket"],
      auth: {
        token: session.accessToken,
      },
    });
    socket.emit("subscribe", {
      branchId,
      terminalId: selectedTerminalId || undefined,
      ticketId: selectedTicket?.id,
      userId: session.user.id,
    });
    const refresh = () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void loadAll(branchId, selectedTicket?.id ?? null).catch((loadError) => {
          if (isUnauthorizedError(loadError)) return;
        });
      }, 250);
    };
    socket.on("ticket.updated", refresh);
    socket.on("pos.ticket.updated", refresh);
    socket.on("payment.completed", refresh);
    socket.on("pos.payment.completed", refresh);
    socket.on("table.status.changed", refresh);
    socket.on("pos.table.status.changed", refresh);
    socket.on("pos.bill.requested", refresh);
    socket.on("bill.requested", refresh);
    socket.on("pos.ticket.split", refresh);
    socket.on("register.updated", refresh);
    socket.on("inventory.stock.changed", refresh);
    socket.on("refund.requested", refresh);
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socket.emit("unsubscribe", {
        branchId,
        terminalId: selectedTerminalId || undefined,
        ticketId: selectedTicket?.id,
        userId: session.user.id,
      });
      socket.disconnect();
    };
  }, [session, branchId, selectedTerminalId, selectedTicket?.id]);

  useEffect(() => {
    if (!selectedProduct || !productFlowError) return;
    const issues = getMissingSelectionMessages(selectedProduct, productForm);
    if (issues.length === 0) {
      setProductFlowError(null);
    }
  }, [selectedProduct, productForm, productFlowError]);

  useEffect(() => {
    if (!selectedTicket) return;
    setActionForm((current) => ({
      ...current,
      ticketName: String(selectedTicket.ticketName ?? ""),
      coverCount: String(selectedTicket.coverCount ?? 1),
      discountScope: selectedItemId ? current.discountScope : "ticket",
    }));
  }, [selectedTicket?.id, selectedTicket?.ticketName, selectedTicket?.coverCount, selectedItemId]);

  useEffect(() => {
    setSelectedItemId(null);
  }, [selectedTicket?.id]);

  useEffect(() => {
    const firstItem = (selectedTicket?.items as Array<Record<string, any>> | undefined)?.[0];
    if (!firstItem) return;
    setSplitDraft((current) => ({
      itemId: current.itemId || String(firstItem.id),
      quantity: current.quantity || "1",
    }));
  }, [selectedTicket?.id, selectedTicket?.items]);

  useEffect(() => {
    setPaymentSplits([]);
    setPaymentForm((current) => ({ ...current, amount: "", referenceNumber: "" }));
    setDiscountForm({ discountConfigId: "", label: "", amount: "", ticketItemId: "" });
    setNoteDraft("");
  }, [selectedTicket?.id]);

  const categories = (catalog.categories as Array<Record<string, any>> | undefined) ?? [];
  const products = (catalog.products as Array<Record<string, any>> | undefined) ?? [];
  const paymentMethods = (catalog.paymentMethods as Array<Record<string, any>> | undefined) ?? [];
  const discountTypes = (catalog.discountTypes as Array<Record<string, any>> | undefined) ?? [];
  const presetNotes = (catalog.presetNotes as Array<Record<string, any>> | undefined) ?? [];
  const terminals = (catalog.terminals as Array<Record<string, any>> | undefined) ?? [];
  const activeTerminal =
    terminals.find((item) => String(item.id) === selectedTerminalId) ??
    terminals.find((item) => Boolean(item.isSelected)) ??
    terminals[0] ??
    null;
  const tables = useMemo<Array<Record<string, any>>>(
    () =>
      (((tablesData.areas as Array<Record<string, any>> | undefined) ?? []).flatMap((area) =>
        ((area.tables as Array<Record<string, any>> | undefined) ?? []).map((table) => ({
          ...table,
          areaName: area.name,
        })),
      )),
    [tablesData],
  );
  const tablesByFloor = useMemo(() => {
    const base: Record<(typeof FLOOR_OPTIONS)[number]["key"], Array<Record<string, any>>> = {
      ground: [],
      floor1: [],
      floor2: [],
    };
    for (const table of tables) {
      const area = String(table.areaName ?? table.name ?? "").toLowerCase();
      if (area.includes("2. kat") || area.includes("2.kat") || area.includes("kat 2")) {
        base.floor2.push(table);
        continue;
      }
      if (area.includes("1. kat") || area.includes("1.kat") || area.includes("kat 1")) {
        base.floor1.push(table);
        continue;
      }
      base.ground.push(table);
    }
    return base;
  }, [tables]);
  const floorTableSlots = useMemo(() => {
    const source = tablesByFloor[activeFloor] ?? [];
    return Array.from({ length: 20 }, (_, index) => {
      const table = source[index] ?? null;
      return {
        key: `slot-${activeFloor}-${index + 1}`,
        label: `M${index + 1}`,
        table,
      };
    });
  }, [tablesByFloor, activeFloor]);
  const waiterFloorTables = useMemo(() => tablesByFloor[activeFloor] ?? [], [tablesByFloor, activeFloor]);
  const waiterTicketItemCount = Array.isArray(selectedTicket?.items) ? selectedTicket.items.length : 0;

  const topCategories = useMemo(() => categories.filter((item) => !item.parentId), [categories]);
  const categoryParentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) {
      map.set(String(category.id), String(category.parentId ?? ""));
    }
    return map;
  }, [categories]);
  const [activeTopCategoryId, setActiveTopCategoryId] = useState<string>("all");
  const [activeSubCategoryId, setActiveSubCategoryId] = useState<string>("all");

  useEffect(() => {
    if (activeTopCategoryId === "all") {
      setActiveSubCategoryId("all");
      return;
    }
    const children = categories.filter((item) => String(item.parentId ?? "") === activeTopCategoryId);
    if (!children.find((item) => String(item.id) === activeSubCategoryId)) {
      setActiveSubCategoryId("all");
    }
  }, [activeTopCategoryId, categories, activeSubCategoryId]);

  const subCategories = useMemo(
    () =>
      activeTopCategoryId === "all"
        ? []
        : categories.filter((item) => String(item.parentId ?? "") === activeTopCategoryId),
    [categories, activeTopCategoryId],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesTop =
        activeTopCategoryId === "all" ||
        String(product.categoryId) === activeTopCategoryId ||
        String(categoryParentMap.get(String(product.categoryId)) ?? "") === activeTopCategoryId;
      const matchesSub = activeSubCategoryId === "all" || String(product.categoryId) === activeSubCategoryId;
      const matchesSearch =
        !query ||
        String(product.name ?? "").toLowerCase().includes(query) ||
        String(product.description ?? "").toLowerCase().includes(query);
      return matchesTop && matchesSub && matchesSearch;
    });
  }, [products, categoryParentMap, activeTopCategoryId, activeSubCategoryId, search]);

  const pagedProducts = useMemo(() => filteredProducts.slice(0, MAX_VISIBLE_PRODUCTS), [filteredProducts]);
  const productLookup = useMemo(
    () => new Map(products.map((product) => [String(product.id), product] as const)),
    [products],
  );

  const transferTargetTableId = useMemo(
    () => tables.find((table) => String(table.id) !== String(selectedTicket?.tableId) && String(table.status) === "AVAILABLE")?.id ?? null,
    [tables, selectedTicket?.tableId],
  );

  const openTicketItems = useMemo(
    () =>
      ((ticketsData.items as Array<Record<string, any>> | undefined) ?? []).filter((ticket) =>
        ["OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING"].includes(String(ticket.status ?? "")),
      ),
    [ticketsData.items],
  );

  const mergeCandidateTickets = useMemo(
    () =>
      openTicketItems.filter(
        (ticket) =>
          String(ticket.id) !== String(selectedTicket?.id ?? "") &&
          String(ticket.branchId ?? branchId) === String(branchId ?? ""),
      ),
    [openTicketItems, selectedTicket?.id, branchId],
  );

  async function handleLogin(pinCode: string) {
    try {
      setLoading(true);
      setError(null);
      const nextSession = normalizeSessionShape(await posApi.loginWithPin(pinCode));
      if (!nextSession) {
        throw new Error("Giriş cevabı beklenen formatta değil.");
      }
      window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(nextSession));
      persistPosSession(nextSession);
      setSession(nextSession);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Giris basarisiz.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTicket(nextMode: PosMode, tableId?: string) {
    if (!session || !branchId) return;
    const channelMap: Record<PosMode, string> = {
      TABLE: "TABLE",
      SELF_SERVICE: "SELF_SERVICE",
      DELIVERY: "DELIVERY",
      TAKEAWAY: "TAKEAWAY",
    };
    const payload = {
      branchId,
      tableId: tableId ?? undefined,
      channel: channelMap[nextMode],
      coverCount: nextMode === "TABLE" ? 2 : 1,
      ticketName: nextMode === "TABLE" ? undefined : `${nextMode} / ${new Date().toLocaleTimeString("tr-TR")}`,
    };

    try {
      const created = await posApi.createTicket(session.accessToken, payload);
      setMode(nextMode);
      await loadAll(branchId, String(created.id));
    } catch (createError) {
      if (!isQueueableOfflineError(createError)) {
        throw createError;
      }
      const offlineTicket = buildOfflineTicket(nextMode, tableId);
      upsertOfflineTicket(offlineTicket);
      enqueueOfflineOperation("create_ticket", offlineTicket.id, payload);
      setMode(nextMode);
      setSelectedTicket(offlineTicket);
      emitPosToast({
        tone: "warning",
        title: "Offline Adisyon",
        message: "Baglanti olmadigi icin adisyon lokal olarak acildi. Internet gelince otomatik sync edilecek.",
      });
    }
  }

  async function openTicketById(ticketId: string) {
    if (!session) return;
    if (isOfflineTicketId(ticketId)) {
      applyOfflineTicketSelection(ticketId);
      setMode("TABLE");
      setActiveDrawer("ticket");
      return;
    }
    const detail = await posApi.ticketDetail(session.accessToken, ticketId);
    setSelectedTicket(detail);
    setMode("TABLE");
    setActiveDrawer("ticket");
  }

  function resolveTableOpenTickets(tableId: string) {
    const serverTickets = getOpenTicketsForTable(
      ((ticketsData.items as Array<Record<string, any>> | undefined) ?? []).filter((ticket) =>
        ["OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING"].includes(String(ticket.status ?? "")),
      ),
      tableId,
    );
    const offlineTickets = getOfflineTicketsForBranch(offlineSyncStateRef.current, branchId).filter(
      (ticket) => String(ticket.tableId ?? "") === tableId && isOpenTicketStatus(String(ticket.status ?? "OPEN")),
    );
    const merged = [...serverTickets];
    for (const offlineTicket of offlineTickets) {
      if (!merged.some((ticket) => String(ticket.id) === String(offlineTicket.id))) {
        merged.push(offlineTicket);
      }
    }
    return merged;
  }

  async function handleSelectTable(table: Record<string, any>) {
    if (!session) return;
    await runOp("selectTable", async () => {
      setSelectedTableContext(table);
      const tableId = String(table.id);
      const tableTickets = resolveTableOpenTickets(tableId);

      if (tableTickets.length === 0) {
        await handleCreateTicket("TABLE", tableId);
        setActiveDrawer("ticket");
        return;
      }

      if (tableTickets.length === 1) {
        await openTicketById(String(tableTickets[0].id));
        return;
      }

      const preferredTicketId = resolveActiveTicketId(table);
      const preferredTicket = preferredTicketId
        ? tableTickets.find((ticket) => String(ticket.id) === String(preferredTicketId))
        : null;

      if (preferredTicket) {
        await openTicketById(String(preferredTicket.id));
        return;
      }

      setSelectedTicket(null);
      setMode("TABLE");
      setActiveDrawer("ticket");
    });
  }

  async function handleSelectTicketFromPicker(ticketId: string) {
    if (!session) return;
    await runOp("selectTicket", async () => {
      await openTicketById(ticketId);
    });
  }

  async function handleCreateTableTicket() {
    const tableId = selectedTableContext?.id ?? selectedTicket?.tableId;
    if (!tableId) return;
    await handleCreateTicket("TABLE", String(tableId));
    setActiveDrawer("ticket");
  }

  async function handleSendToKitchen() {
    if (!session || !selectedTicket) return;
    const itemCount = Array.isArray(selectedTicket.items) ? selectedTicket.items.length : 0;
    if (itemCount <= 0) {
      setError("Siparis gondermek icin once urun eklemelisin.");
      return;
    }
    await runOp("sendKitchen", async () => {
      await handlePrint("kitchen");
      setInfo("Siparis mutfaga/bar'a gonderildi.");
      emitPosToast({
        tone: "success",
        title: "Siparis Gonderildi",
        message: "Mutfak/bar fisleri yazdirildi.",
      });
    });
  }

  async function handleRequestBill() {
    if (!session || !selectedTicket) return;
    await runOp("requestBill", async () => {
      await posApi.requestBill(session.accessToken, String(selectedTicket.id));
      await loadAll(branchId, String(selectedTicket.id));
      setInfo("Hesap istendi.");
      emitPosToast({ tone: "info", title: "Hesap Istendi", message: "Kasa bilgilendirildi." });
    });
  }

  function openProductDrawer(product: Record<string, any>) {
    const activeTableId = String(selectedTableContext?.id ?? selectedTicket?.tableId ?? "");
    const tableTickets = activeTableId ? resolveTableOpenTickets(activeTableId) : [];
    if (tableTickets.length > 1 && !selectedTicket) {
      setError("Bu masada birden fazla adisyon var. Once hangi adisyona urun eklenecegini sec.");
      setActiveDrawer("ticket");
      return;
    }
    if (!selectedTicket) {
      setError(isWaiterSession(session) ? "Once bir masa secip adisyon ac." : "Once yeni bir adisyon ac. Sag paneldeki butonlari kullanabilirsin.");
      return;
    }
    if (["PAID", "CANCELLED", "VOIDED"].includes(String(selectedTicket.status ?? ""))) {
      setError("Kapali adisyona urun eklenemez.");
      return;
    }
    setActiveDrawer("ticket");
    setProductFlowTab("options");
    setProductFlowError(null);
    setSelectedProduct(product);
    setProductForm({
      quantity: 1,
      note: "",
      variantIds: [],
      modifierOptionIds: [],
      requiredChoiceOptionIds: [],
    });
  }

  async function submitProduct() {
    if (!session || !selectedTicket || !selectedProduct) return;
    if (["PAID", "CANCELLED", "VOIDED"].includes(String(selectedTicket.status ?? ""))) {
      const message = "Kapali adisyon uzerinde islem yapilamaz.";
      setProductFlowError(message);
      setError(message);
      return;
    }
    if (!Number.isFinite(productQuantityValue) || productQuantityValue <= 0) {
      setProductFlowError("Urun miktari sifirdan buyuk olmali.");
      setError("Urun miktari sifirdan buyuk olmali.");
      return;
    }
    const requiredIssues = getMissingSelectionMessages(selectedProduct, productForm);
    if (requiredIssues.length > 0) {
      if (requiredIssues[0].toLowerCase().includes("modifier")) {
        setProductFlowTab("modifiers");
      } else {
        setProductFlowTab("options");
      }
      setProductFlowError(requiredIssues[0]);
      setError(requiredIssues[0]);
      return;
    }
    setProductFlowError(null);
    await runOp("submitProduct", async () => {
      const serverTicketId = resolveServerTicketId(String(selectedTicket.id));
      if (!serverTicketId) {
        const message = "Adisyon bulunamadi.";
        setProductFlowError(message);
        throw new Error(message);
      }
      const latestTicket = await posApi.ticketDetail(session.accessToken, serverTicketId);
      if (["PAID", "CANCELLED", "VOIDED"].includes(String(latestTicket.status ?? ""))) {
        setSelectedTicket(latestTicket);
        const message = "Kapali adisyon uzerinde islem yapilamaz.";
        setProductFlowError(message);
        throw new Error(message);
      }
      const payload = {
        productId: selectedProduct.id,
        quantity: Number(productForm.quantity ?? 1),
        note: productForm.note ?? "",
        variantIds: productForm.variantIds ?? [],
        modifierOptionIds: productForm.modifierOptionIds ?? [],
        requiredChoiceOptionIds: productForm.requiredChoiceOptionIds ?? [],
      };
      try {
        await posApi.addItem(session.accessToken, serverTicketId, payload);
        setSelectedProduct(null);
        await loadAll(branchId, String(selectedTicket.id));
        setActiveDrawer("ticket");
      } catch (submitError) {
        if (!isQueueableOfflineError(submitError)) {
          throw submitError;
        }
        const nextTicket = appendOfflineItemToTicket(selectedTicket, payload);
        upsertOfflineTicket(nextTicket);
        enqueueOfflineOperation("add_item", String(selectedTicket.id), payload);
        setSelectedTicket(nextTicket);
        setSelectedProduct(null);
        setActiveDrawer("ticket");
        emitPosToast({
          tone: "warning",
          title: "Offline Urun",
          message: "Urun adisyona lokal olarak eklendi. Baglanti gelince sunucuya gonderilecek.",
        });
      }
    });
  }

  async function changeQuantity(item: Record<string, any>, diff: number) {
    if (!session || !selectedTicket) return;
    // Garson sadece arttırabilir. Azaltma/silme UI'da kapalı ama ekstra güvenlik.
    if (isWaiterMode && diff < 0) {
      setError("Garson modunda miktar azaltma kapalı.");
      return;
    }
    const nextQuantity = Number(item.quantity) + diff;
    if (nextQuantity <= 0) {
      if (isWaiterMode) {
        setError("Garson modunda ürün silme kapalı.");
        return;
      }
      openConfirm("Urun Sil", "Bu urunu adisyondan silmek istiyor musun?", async () => {
        await posApi.removeItem(session.accessToken, String(selectedTicket.id), String(item.id));
        await loadAll(branchId, String(selectedTicket.id));
      });
      return;
    }
    await runOp("changeQuantity", async () => {
      await posApi.updateItem(session.accessToken, String(selectedTicket.id), String(item.id), {
        quantity: nextQuantity,
        note: item.notes ?? "",
        variantIds: item.modifiersJson?.variantIds ?? [],
        modifierOptionIds: item.modifiersJson?.modifierOptionIds ?? [],
        requiredChoiceOptionIds: item.modifiersJson?.requiredChoiceOptionIds ?? [],
      });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function applyPresetNote(content: string) {
    if (!session || !selectedTicket) return;
    await runOp("applyPresetNote", async () => {
      await posApi.addNote(session.accessToken, String(selectedTicket.id), {
        ticketItemId: selectedItemId ?? undefined,
        content,
        noteType: selectedItemId ? "item" : "ticket",
      });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function applyDiscount() {
    if (!session || !selectedTicket) return;
    if (!discountForm.discountConfigId) {
      setError("Uygulanacak indirim tipini sec.");
      return;
    }
    const amount = Number(discountForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Indirim tutari gecersiz.");
      return;
    }
    await runOp("applyDiscount", async () => {
      await posApi.applyDiscount(session.accessToken, String(selectedTicket.id), {
        ticketItemId: discountForm.ticketItemId || undefined,
        discountType: discountForm.ticketItemId ? "line_manual" : "ticket_manual",
        label: discountForm.label,
        amount,
      });
      setDiscountForm({ discountConfigId: "", label: "", amount: "", ticketItemId: "" });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function addPaymentSplit() {
    if (!selectedTicket) return;
    const amount = roundCurrency(Number(paymentForm.amount));
    const currentTotal = paymentSplits.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const remainingAmount = roundCurrency(Math.max(Number(selectedTicket.remainingAmount ?? 0) - currentTotal, 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Odeme tutari gecersiz.");
      return;
    }
    if (amount > remainingAmount + 0.01) {
      setError("Girilen tutar kalan odemeyi asiyor.");
      return;
    }
    if (!paymentMethodOptions.some((item) => item.paymentMethod === activePaymentMethod)) {
      setError("Gecersiz odeme tipi secildi.");
      return;
    }
    setPaymentSplits((current) => [
      ...current,
      {
        method: activePaymentMethod,
        amount,
        referenceNumber: paymentForm.referenceNumber || undefined,
      },
    ]);
    setPaymentForm((current) => ({ ...current, amount: "", referenceNumber: "" }));
  }

  function removePaymentSplit(index: number) {
    setPaymentSplits((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submitPayment() {
    if (!session || !selectedTicket || paymentSplits.length === 0) return;
    if (["PAID", "CANCELLED", "VOIDED"].includes(String(selectedTicket.status ?? ""))) {
      setError("Kapali adisyon icin odeme islemi yapilamaz.");
      return;
    }
    const splitTotal = paymentSplits.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const remaining = Math.max(Number(selectedTicket.remainingAmount ?? 0), 0);
    if (!Number.isFinite(splitTotal) || splitTotal <= 0) {
      setError("Odeme parcalari gecersiz.");
      return;
    }
    if (splitTotal > remaining + 0.01) {
      setError("Odeme parcalari kalan tutari asamaz.");
      return;
    }
    const hasUnsupportedOfflinePayment = paymentSplits.some((split) => String(split.method).toUpperCase() !== "CASH");
    if (!online && hasUnsupportedOfflinePayment) {
      setError("Offline modda sadece nakit odemeler kuyruga alinabilir. Kart ve terminal odemeleri baglanti gerektirir.");
      return;
    }
    await runOp("submitPayment", async () => {
      const ticketId = String(selectedTicket.id);
      const terminalId = selectedTerminalId || undefined;
      const payload = {
        splits: paymentSplits,
        terminalId,
      };
      try {
        const paymentResultRaw = await posApi.collectPayment(session.accessToken, resolveMappedTicketId(offlineSyncState, ticketId), payload);
        const paymentResult = normalizePaymentResult(paymentResultRaw);
        setPaymentSplits([]);
        closeDrawer();
        const status = paymentResult.status;
        if (status === "PAID") {
          try {
            await handlePrint("receipt", undefined, ticketId);
          } catch {
            // loadAll yine calissin, print hatasi UI'da gosteriliyor
          }
        }
        if (status === "PAID") {
          setSelectedTicket(null);
          setSelectedItemId(null);
          await loadAll(branchId, null);
          setInfo("Odeme tamamlandi, adisyon kapatildi.");
          return;
        }
        await loadAll(branchId, ticketId);
      } catch (paymentError) {
        if (!isQueueableOfflineError(paymentError) || hasUnsupportedOfflinePayment) {
          throw paymentError;
        }
        const nextTicket = appendOfflinePaymentToTicket(selectedTicket, paymentSplits);
        upsertOfflineTicket(nextTicket);
        enqueueOfflineOperation("collect_payment", ticketId, payload);
        setSelectedTicket(nextTicket);
        setPaymentSplits([]);
        closeDrawer();
        emitPosToast({
          tone: "warning",
          title: "Offline Odeme",
          message: "Nakit odeme lokal olarak kaydedildi. Internet gelince otomatik sync edilecek.",
        });
      }
    });
  }

  async function handleSplit() {
    if (!session || !selectedTicket || !selectedItemId) return;
    const item = ((selectedTicket.items as Array<Record<string, any>>) ?? []).find((row) => String(row.id) === selectedItemId);
    if (!item) return;
    await handleSplitByItem(selectedItemId, Math.max(1, Number(item.quantity) / 2));
  }

  async function handleSplitByItem(itemId: string, quantity: number, targetTicketId?: string) {
    if (!session || !selectedTicket || !itemId) return;
    const item = ((selectedTicket.items as Array<Record<string, any>>) ?? []).find((row) => String(row.id) === String(itemId));
    if (!item) {
      setError("Bolunecek urun bulunamadi.");
      return;
    }
    const maxQuantity = Number(item.quantity ?? 0);
    const safeQuantity = Math.min(Math.max(0.01, quantity), maxQuantity);
    if (safeQuantity >= maxQuantity) {
      setError("Bolme icin kaynak adisyonda urun kalmali. Tamamini tasimak yerine adedi dusurun.");
      return;
    }
    await runOp("handleSplit", async () => {
      const result = await posApi.splitTicket(session.accessToken, String(selectedTicket.id), {
        items: [{ itemId: String(itemId), quantity: safeQuantity }],
        ticketName: `${selectedTicket.ticketName ?? selectedTicket.id} / Bolum`,
        targetChannel: selectedTicket.channel,
      });
      const target = (result as any)?.target ?? (result as any)?.data?.target;
      closeDrawer();
      await loadAll(branchId, target?.id ? String(target.id) : String(selectedTicket.id));
    });
  }

  async function handlePersonSplit() {
    if (!session || !selectedTicket) return;
    const persons = personSplitDraft
      .map((row, index) => ({
        label: row.label.trim() || `Kisi ${index + 1}`,
        items: row.itemId
          ? [{ itemId: row.itemId, quantity: Math.max(0.01, Number(row.quantity) || 1) }]
          : [],
      }))
      .filter((person) => person.items.length > 0);
    if (persons.length < 2) {
      setError("Kisi bazli bolme icin en az iki kisi ve urun secimi gerekli.");
      return;
    }
    openConfirm(
      "Kisi Bazli Bolme",
      `${persons.length} ayri hesap olusturulacak. Devam edilsin mi?`,
      async () => {
        await runOp("handlePersonSplit", async () => {
          const result = await posApi.splitTicketByPerson(session.accessToken, String(selectedTicket.id), {
            persons,
            targetChannel: selectedTicket.channel,
          });
          const firstTarget = (result as any)?.targets?.[0] ?? (result as any)?.data?.targets?.[0];
          closeDrawer();
          await loadAll(branchId, firstTarget?.id ? String(firstTarget.id) : String(selectedTicket.id));
        });
      },
    );
  }

  function openSplitConfirm() {
    if (!selectedTicket || !splitDraft.itemId) return;
    const item = ((selectedTicket.items as Array<Record<string, any>>) ?? []).find((row) => String(row.id) === splitDraft.itemId);
    if (!item) return;
    const qty = Math.max(0.01, Number(splitDraft.quantity) || 1);
    openConfirm(
      "Adisyon Bolme",
      `${String(item.productName)} urununun ${qty} adedi yeni alt hesaba tasinacak. Devam edilsin mi?`,
      async () => {
        await handleSplitByItem(splitDraft.itemId, qty);
      },
    );
  }

  async function handleMerge(targetTicketId: string) {
    if (!session || !selectedTicket || !targetTicketId) return;
    const targetTicket = mergeCandidateTickets.find((ticket) => String(ticket.id) === String(targetTicketId));
    const targetLabel = targetTicket?.ticketName ?? targetTicket?.table?.name ?? targetTicketId;
    openConfirm(
      "Masalari Birlestir",
      `"${selectedTicket.ticketName ?? selectedTicket.id}" adisyonu "${targetLabel}" adisyonuna birlestirilecek. Devam edilsin mi?`,
      async () => {
        await runOp("handleMerge", async () => {
          await posApi.mergeTickets(session.accessToken, {
            sourceTicketId: selectedTicket.id,
            targetTicketId,
          });
          closeDrawer();
          await loadAll(branchId, targetTicketId);
        });
      },
    );
  }

  async function handleTransfer(tableId: string) {
    if (!session || !selectedTicket || !tableId) {
      setError("Aktarim icin uygun masa bulunamadi.");
      return;
    }
    const targetTable = tables.find((table) => String(table.id) === String(tableId));
    const targetLabel = targetTable?.name ?? tableId;
    openConfirm(
      "Masayi Tasima",
      `"${selectedTicket.ticketName ?? selectedTicket.id}" adisyonu "${targetLabel}" masasina tasinacak. Devam edilsin mi?`,
      async () => {
        await runOp("handleTransfer", async () => {
          await posApi.transferTicket(session.accessToken, String(selectedTicket.id), { tableId });
          closeDrawer();
          await loadAll(branchId, String(selectedTicket.id));
        });
      },
    );
  }

  async function handlePendingOrderSelect(order: Record<string, any>) {
    if (!session) return;
    if (order.acceptedTicketId) {
      const detail = await posApi.ticketDetail(session.accessToken, String(order.acceptedTicketId));
      setSelectedTicket(detail);
      closeDrawer();
      return;
    }

    setError("Bu kuyruk kaydi henuz adisyona donusturulmemis.");
  }

  function resolvePrinterForDocument(
    documentType: PrintDocumentType,
    printers: Array<Record<string, any>>,
    preferredPrinterId?: string,
  ) {
    if (preferredPrinterId) {
      const preferred = printers.find((item) => String(item.id) === preferredPrinterId);
      if (preferred) return preferred;
    }
    const byType = (keywords: string[]) =>
      printers.find((item) => {
        const type = String(item.type ?? "").toLowerCase();
        const name = String(item.name ?? "").toLowerCase();
        return keywords.some((word) => type.includes(word) || name.includes(word));
      });

    if (documentType === "kitchen") {
      return printers.find((item) => Boolean(item.isKitchen)) ?? byType(["kitchen", "mutfak", "bar"]) ?? printers[0];
    }
    if (documentType === "label") {
      return byType(["label", "etiket"]) ?? printers.find((item) => !Boolean(item.isKitchen)) ?? printers[0];
    }
    return byType(["cash", "kasa", "receipt", "fis"]) ?? printers.find((item) => !Boolean(item.isKitchen)) ?? printers[0];
  }

  function groupKitchenItemsByStation(
    items: Array<Record<string, any>>,
    categories: Array<Record<string, any>>,
    products: Array<Record<string, any>>,
  ) {
    const categoryMap = new Map<string, Record<string, any>>();
    for (const category of categories) {
      categoryMap.set(String(category.id), category);
    }
    const productCategoryMap = new Map<string, string>();
    for (const product of products) {
      if (product?.id && product?.categoryId) {
        productCategoryMap.set(String(product.id), String(product.categoryId));
      }
    }
    const result: Record<"kitchen" | "bar", Array<Record<string, any>>> = { kitchen: [], bar: [] };
    for (const item of items) {
      const resolvedCategoryId = item.categoryId ?? productCategoryMap.get(String(item.productId ?? "")) ?? "";
      const category = categoryMap.get(String(resolvedCategoryId)) ?? null;
      const printerType = String(category?.printerType ?? "kitchen").toLowerCase();
      const target = printerType === "bar" ? "bar" : "kitchen";
      result[target].push(item);
    }
    return result;
  }

  async function handlePrint(documentType: PrintDocumentType, preferredPrinterId?: string, forcedTicketId?: string) {
    if (!session) return;
    const requestedTicketId = forcedTicketId ?? (selectedTicket ? String(selectedTicket.id) : "");
    if (!requestedTicketId) {
      const message = "Yazdirma icin aktif adisyon sec.";
      setError(message);
      throw new Error(message);
    }
    const ticketId = resolveMappedTicketId(offlineSyncStateRef.current, requestedTicketId);

    if (documentType === "kitchen" || documentType === "receipt") {
      const trigger = documentType === "receipt" ? "receipt" : "production";
      const localJobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const queuedJob: LocalPrintJob = {
        id: localJobId,
        ticketId: requestedTicketId,
        printerId: "routing",
        printerName: trigger === "receipt" ? "KASA" : "ROUTING",
        documentType,
        status: "queued",
        queuedAt: new Date().toISOString(),
        attempts: 1,
      };
      setPrintJobs((current) => [queuedJob, ...current].slice(0, 20));
      await runOp(`print-${localJobId}`, async () => {
        const dispatch = await dispatchTicketRoutingPrint({
          accessToken: session.accessToken,
          ticketId,
          trigger,
        });
        if (dispatch.duplicate) {
          setInfo("Yazdirma zaten gonderildi.");
          return;
        }
        const failed = dispatch.results.filter((result) => result.status === "failed");
        const sent = dispatch.results.filter((result) => result.status === "sent" || result.skipped);
        if (!dispatch.results.length) {
          throw new Error(trigger === "receipt" ? "Kasa fisi olusturulamadi." : "Yazdirilacak uretim fisi bulunamadi.");
        }
        if (failed.length > 0 && sent.length === 0) {
          throw new Error(failed[0]?.error ?? "Yazdirma basarisiz.");
        }
        setPrintJobs((current) =>
          current.map((jobRow) =>
            jobRow.id === localJobId
              ? {
                  ...jobRow,
                  status: failed.length > 0 ? "failed" : "sent",
                  error: failed[0]?.error,
                  printerName: dispatch.results.map((item) => item.destinationCode).filter(Boolean).join(", ") || jobRow.printerName,
                }
              : jobRow,
          ),
        );
      });
      return;
    }

    let ticketSnapshot =
      selectedTicket &&
      (String(selectedTicket.id) === String(ticketId) || String(selectedTicket.id) === String(requestedTicketId))
        ? selectedTicket
        : null;
    if (!ticketSnapshot) {
      ticketSnapshot = await posApi.ticketDetail(session.accessToken, ticketId);
    }
    let printers = (catalog.printers as Array<Record<string, any>> | undefined) ?? [];
    if (printers.length === 0) {
      const catalogBranchId = String(ticketSnapshot.branchId ?? branchId ?? "");
      if (!catalogBranchId) {
        const message = "Yazici katalogu icin sube bilgisi eksik.";
        setError(message);
        throw new Error(message);
      }
      const refreshedCatalog = await posApi.catalog(session.accessToken, catalogBranchId);
      setCatalog(refreshedCatalog);
      printers = (refreshedCatalog.printers as Array<Record<string, any>> | undefined) ?? [];
    }

    const printer = resolvePrinterForDocument(documentType, printers, preferredPrinterId);
    if (!printer) {
      const message = "Yazici tanimi bulunamadi.";
      setError(message);
      throw new Error(message);
    }
    const localJobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queuedJob: LocalPrintJob = {
      id: localJobId,
      ticketId: requestedTicketId,
      printerId: String(printer?.id ?? "browser-print"),
      printerName: String(printer?.name ?? printer?.type ?? printer?.id ?? "Tarayici Yazdirma"),
      documentType,
      status: "queued",
      queuedAt: new Date().toISOString(),
      attempts: 1,
    };
    setPrintJobs((current) => [queuedJob, ...current].slice(0, 20));
    await runOp(`print-${localJobId}`, async () => {
      try {
        const dispatch = normalizePrintDispatch(await posApi.print(session.accessToken, {
          printerId: String(printer!.id),
          ticketId,
          documentType,
        }));
        if (!dispatch.success) {
          throw new Error("Yazdirma kuyruga alinamadi.");
        }
        setPrintJobs((current) => current.map((job) => (job.id === localJobId ? { ...job, status: "sent" } : job)));
      } catch (printError) {
        const message = printError instanceof Error ? printError.message : "Yazdirma basarisiz.";
        setPrintJobs((current) =>
          current.map((job) => (job.id === localJobId ? { ...job, status: "failed", error: message } : job)),
        );
        throw printError;
      }
    });
  }

  async function retryPrint(jobId: string) {
    if (!session) return;
    const job = printJobs.find((row) => row.id === jobId);
    if (!job) return;
    await runOp(`retryPrint-${jobId}`, async () => {
      try {
        setPrintJobs((current) => current.map((row) => (row.id === jobId ? { ...row, status: "queued", attempts: row.attempts + 1, error: undefined } : row)));
        const dispatch = normalizePrintDispatch(await posApi.print(session.accessToken, {
          printerId: job.printerId,
          ticketId: job.ticketId ?? undefined,
          documentType: job.documentType,
        }));
        if (!dispatch.success) {
          throw new Error("Yazdirma kuyruga alinamadi.");
        }
        setPrintJobs((current) => current.map((row) => (row.id === jobId ? { ...row, status: "sent" } : row)));
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : "Yazdirma yeniden deneme basarisiz.";
        setPrintJobs((current) => current.map((row) => (row.id === jobId ? { ...row, status: "failed", error: message } : row)));
        throw retryError;
      }
    });
  }

  async function handleDrawerOpen() {
    if (!session) return;
    if (!hasSessionPermission(session, "drawer.open")) {
      setError("Para cekmecesi acma yetkin yok.");
      return;
    }
    if (!selectedTerminalId) {
      setError("Terminal secimi eksik. Baglanti ekranindan terminal sec.");
      return;
    }
    await runOp("openDrawer", async () => {
      await posApi.openDrawer(session.accessToken, { terminalId: selectedTerminalId, reason: "manuel_cash_access" });
      setInfo("Para cekmecesi acma komutu gonderildi.");
    });
  }

  function updateRegisterDenomination(denomination: number, quantity: number) {
    setRegisterForm((current) => ({
      ...current,
      denominations: {
        ...current.denominations,
        [String(denomination)]: Math.max(0, quantity),
      },
    }));
  }

  async function handleOpenRegister() {
    if (!session) return;
    if (!hasSessionPermission(session, "register.open")) {
      setError("Kasa acma yetkin yok.");
      return;
    }
    const openingCash = roundCurrency(Number(registerForm.openingCash));
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      setError("Acilis nakdi gecersiz.");
      return;
    }
    const terminalId = selectedTerminalId || undefined;
    await runOp("openRegister", async () => {
      const response = await posApi.openRegister(session.accessToken, {
        branchId,
        terminalId,
        openingCash,
      });
      setRegisterResult(response);
      setInfo("Kasa acilisi kaydedildi.");
    });
  }

  async function handleCloseRegister() {
    if (!session) return;
    if (!hasSessionPermission(session, "register.close")) {
      setError("Kasa kapatma yetkin yok.");
      return;
    }
    const terminalId = selectedTerminalId || undefined;
    await runOp("closeRegister", async () => {
      const response = await posApi.closeRegister(session.accessToken, {
        branchId,
        terminalId,
        countedCash: countedCashTotal,
        denominations: CASH_DENOMINATIONS
          .map((denomination) => ({
            denomination,
            quantity: Number(registerForm.denominations[String(denomination)] ?? 0),
          }))
          .filter((row) => row.quantity > 0),
      });
      setRegisterResult(response);
      setInfo("Kasa kapanisi tamamlandi.");
      await loadAll(branchId, selectedTicket?.id ? String(selectedTicket.id) : null);
    });
  }

  async function handleCreateExpenseEntry() {
    if (!session) return;
    if (!hasSessionPermission(session, "expense.manage")) {
      setError("Gider ekleme yetkin yok.");
      return;
    }
    const description = expenseForm.description.trim();
    const amount = roundCurrency(Number(expenseForm.amount));
    if (!description) {
      setError("Gider aciklamasi bos olamaz.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Gider tutari gecersiz.");
      return;
    }
    const terminalId = selectedTerminalId || undefined;
    await runOp("createExpense", async () => {
      await posApi.createExpense(session.accessToken, {
        branchId,
        terminalId,
        title: description,
        description,
        amount,
        category: "genel",
        paymentType: "cash",
      });
      setExpenseForm({ description: "", amount: "" });
      closeDrawer();
      setInfo("Gider kaydi olusturuldu.");
      await loadAll(branchId, selectedTicket?.id ? String(selectedTicket.id) : null);
    });
  }

  async function applyReportFilters() {
    if (reportFilters.dateFrom && reportFilters.dateTo && reportFilters.dateFrom > reportFilters.dateTo) {
      setError("Rapor tarih araligi gecersiz.");
      return;
    }
    await loadReportSummary();
  }

  async function handleExportReport() {
    if (!session || !branchId) return;
    await runOp("exportReport", async () => {
      const csv = await posApi.exportReportSummary(session.accessToken, {
        branchId,
        dateFrom: reportFilters.dateFrom,
        dateTo: reportFilters.dateTo,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pos-rapor-${reportFilters.dateFrom}-${reportFilters.dateTo}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });
  }

  function handlePrintReport() {
    if (!reportData) return;
    const reportWindow = window.open("", "_blank", "width=960,height=720");
    if (!reportWindow) {
      setError("Yazdirma penceresi acilamadi.");
      return;
    }

    const cards = ((reportData.cards as Array<Record<string, any>> | undefined) ?? [])
      .map(
        (card) =>
          `<div style="border:1px solid #ddd;border-radius:12px;padding:12px"><div style="font-size:12px;color:#666">${String(card.label ?? "")}</div><div style="font-size:22px;font-weight:700">${formatCurrency(Number(card.value ?? 0))}</div><div style="font-size:12px;color:#888">${String(card.helper ?? "")}</div></div>`,
      )
      .join("");

    const categoryRows = ((reportData.categorySales as Array<Record<string, any>> | undefined) ?? [])
      .map(
        (row) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #eee">${String(row.categoryName ?? "")}</td><td style="padding:8px;border-bottom:1px solid #eee">${Number(row.quantity ?? 0)}</td><td style="padding:8px;border-bottom:1px solid #eee">${formatCurrency(Number(row.revenue ?? 0))}</td></tr>`,
      )
      .join("");

    reportWindow.document.write(`
      <html>
        <head>
          <title>POS Raporu</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            .cards { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
            table { width:100%; border-collapse: collapse; }
            h1,h2 { margin: 0 0 12px; }
          </style>
        </head>
        <body>
          <h1>POS Raporu</h1>
          <p>${reportFilters.dateFrom} - ${reportFilters.dateTo}</p>
          <div class="cards">${cards}</div>
          <h2>Kategori Bazli Satis</h2>
          <table>
            <thead>
              <tr><th align="left">Kategori</th><th align="left">Adet</th><th align="left">Ciro</th></tr>
            </thead>
            <tbody>${categoryRows}</tbody>
          </table>
        </body>
      </html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }

  async function handleVoid(reason: string) {
    if (!session || !selectedTicket) return;
    await runOp("handleVoid", async () => {
      const serverTicketId = resolveServerTicketId(String(selectedTicket.id));
      if (!serverTicketId) {
        setSelectedTicket(null);
        setSelectedItemId(null);
        setSelectedProduct(null);
        setActiveDrawer(null);
        await loadAll(branchId, null);
        throw new Error("Adisyon bulunamadi.");
      }
      await posApi.voidTicket(session.accessToken, serverTicketId, { reason });
      await loadAll(branchId);
    });
  }

  async function handleRefund() {
    if (!session || !selectedTicket) return;
    if (!hasSessionPermission(session, "ticket.refund")) {
      setError("Iade yetkin yok.");
      return;
    }
    const terminalId = selectedTerminalId || undefined;
    await runOp("handleRefund", async () => {
      await posApi.refund(session.accessToken, String(selectedTicket.id), {
        reason: "Musteri talebi",
        amount: Number(selectedTicket.paidTotal ?? 0) || Number(selectedTicket.grandTotal ?? 0),
        terminalId,
      });
      await posApi.approval(session.accessToken, {
        action: "ticket.refund",
        referenceType: "ticket",
        referenceId: selectedTicket.id,
        reason: "Refund approval requested",
      });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function handleRenameTicket() {
    if (!session || !selectedTicket) return;
    const name = actionForm.ticketName.trim();
    if (!name) {
      setError("Adisyon adi bos olamaz.");
      return;
    }
    await runOp("handleRenameTicket", async () => {
      await posApi.updateTicket(session.accessToken, String(selectedTicket.id), { ticketName: name });
      await loadAll(branchId, String(selectedTicket.id));
      setInfo("Adisyon adi guncellendi.");
    });
  }

  async function handleUpdateCoverCount() {
    if (!session || !selectedTicket) return;
    const coverCount = Number(actionForm.coverCount);
    if (!Number.isFinite(coverCount) || coverCount <= 0) {
      setError("Musteri sayisi gecersiz.");
      return;
    }
    await runOp("handleUpdateCoverCount", async () => {
      await posApi.updateTicket(session.accessToken, String(selectedTicket.id), { coverCount });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function handleComplimentary(reason: string) {
    if (!session || !selectedTicket) return;
    const item = ((selectedTicket.items as Array<Record<string, any>> | undefined) ?? []).find((row) => String(row.id) === selectedItemId);
    if (!item) {
      setError("Ikram icin satir sec.");
      return;
    }
    await runOp("handleComplimentary", async () => {
      await posApi.applyDiscount(session.accessToken, String(selectedTicket.id), {
        ticketItemId: item.id,
        discountType: "COMP",
        discountKind: "COMP",
        label: "Ikram",
        amount: Number(item.lineTotal ?? 0),
        reason,
      });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function handleApplyActionDiscount(reason: string) {
    if (!session || !selectedTicket) return;
    const amountValue = Number(actionForm.discountAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Indirim degeri gecersiz.");
      return;
    }
    const ticketItemId = actionForm.discountScope === "line" ? selectedItemId : null;
    if (actionForm.discountScope === "line" && !ticketItemId) {
      setError("Satir indirimi icin urun sec.");
      return;
    }
    const baseTotal = ticketItemId
      ? Number(((selectedTicket.items as Array<Record<string, any>> | undefined) ?? []).find((row) => String(row.id) === ticketItemId)?.lineTotal ?? 0)
      : Number(selectedTicket.grandTotal ?? 0);
    const previewTotal =
      actionForm.discountMode === "percent"
        ? roundCurrency(Math.max(baseTotal - (baseTotal * amountValue) / 100, 0))
        : roundCurrency(Math.max(baseTotal - amountValue, 0));
    await runOp("handleApplyActionDiscount", async () => {
      await posApi.applyDiscount(session.accessToken, String(selectedTicket.id), {
        ticketItemId: ticketItemId ?? undefined,
        discountType: actionForm.discountMode === "percent" ? "PERCENTAGE" : "AMOUNT",
        discountKind: "DISCOUNT",
        label: actionForm.discountLabel.trim() || "Manuel Indirim",
        ...(actionForm.discountMode === "percent" ? { percentage: amountValue } : { amount: amountValue }),
        reason,
      });
      setActionForm((current) => ({ ...current, discountAmount: "" }));
      setInfo(`Indirim uygulandi. Yeni toplam yaklasik: ${formatCurrency(previewTotal)}`);
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function handleWaste() {
    if (!session || !selectedTicket || !selectedItemId) {
      setError("Atik icin satir sec.");
      return;
    }
    await runOp("handleWaste", async () => {
      await posApi.removeItem(session.accessToken, String(selectedTicket.id), selectedItemId);
      await posApi.addNote(session.accessToken, String(selectedTicket.id), {
        content: "Atik olarak isaretlendi",
        noteType: "waste",
      });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  async function handleCancelLine(reason: string) {
    if (!session || !selectedTicket || !selectedItemId) {
      setError("Iptal icin satir sec.");
      return;
    }
    await runOp("handleCancelLine", async () => {
      await posApi.voidItem(session.accessToken, String(selectedTicket.id), selectedItemId, { reason });
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  function openFinancialConfirm(title: string, message: string, onConfirm: (reason: string) => Promise<void>) {
    setFinancialConfirm({ title, message, reason: "", onConfirm });
  }

  function openConfirm(title: string, message: string, onConfirm: () => Promise<void>) {
    setConfirmState({ title, message, onConfirm });
  }

  async function submitQuickNote() {
    if (!session || !selectedTicket || !noteDraft.trim()) return;
    await runOp("submitQuickNote", async () => {
      await posApi.addNote(session.accessToken, String(selectedTicket.id), {
        ticketItemId: selectedItemId ?? undefined,
        content: noteDraft.trim(),
        noteType: selectedItemId ? "item" : "ticket",
      });
      setNoteDraft("");
      closeDrawer();
      await loadAll(branchId, String(selectedTicket.id));
    });
  }

  function appendNoteKey(key: string) {
    setNoteDraft((current) => `${current}${key}`);
  }

  function appendProductNoteKey(key: string) {
    setProductForm((current: Record<string, any>) => ({ ...current, note: `${String(current.note ?? "")}${key}` }));
  }

  function applyPresetProductNote(content: string) {
    const normalized = content.trim();
    if (!normalized) return;
    setProductForm((current: Record<string, any>) => {
      const currentNote = String(current.note ?? "").trim();
      if (!currentNote) {
        return { ...current, note: normalized };
      }
      if (currentNote.toLowerCase().includes(normalized.toLowerCase())) {
        return current;
      }
      return { ...current, note: `${currentNote}, ${normalized}` };
    });
  }

  function toggleGroupOption(
    group: Record<string, any>,
    optionId: string,
    key: "requiredChoiceOptionIds" | "modifierOptionIds",
    defaultMax = Number.MAX_SAFE_INTEGER,
  ) {
    setProductForm((current: Record<string, any>) => {
      const currentIds = ((current[key] as Array<unknown> | undefined) ?? []).map((id) => String(id));
      const optionIds = ((group.options as Array<Record<string, any>> | undefined) ?? []).map((option) => String(option.id));
      const selectedInGroup = currentIds.filter((id) => optionIds.includes(id));
      const active = currentIds.includes(optionId);
      const max = Math.max(1, Number(group.selectionMax ?? defaultMax));

      let nextIds = [...currentIds];
      if (active) {
        nextIds = nextIds.filter((id) => id !== optionId);
      } else {
        if (selectedInGroup.length >= max) {
          if (max <= 1) {
            nextIds = nextIds.filter((id) => !optionIds.includes(id));
          } else {
            nextIds = nextIds.filter((id) => id !== selectedInGroup[0]);
          }
        }
        nextIds.push(optionId);
      }

      return {
        ...current,
        [key]: Array.from(new Set(nextIds)),
      };
    });
  }

  async function runQuickAction(action: "self" | "delivery" | "takeaway" | "tasks" | "messages") {
    if (!session) return;
    await runOp(`quick-${action}`, async () => {
      if (action === "self") {
        await handleCreateTicket("SELF_SERVICE");
        return;
      }
      if (action === "delivery") {
        await handleCreateTicket("DELIVERY");
        return;
      }
      if (action === "takeaway") {
        await handleCreateTicket("TAKEAWAY");
        return;
      }
      if (action === "tasks") {
        openDrawer("history");
        return;
      }
      if (action === "messages") {
        openDrawer("pending");
      }
    });
  }

  const isWaiterMode = session ? isWaiterSession(session) : false;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("pos-waiter-mode", isWaiterMode);
    return () => {
      document.body.classList.remove("pos-waiter-mode");
    };
  }, [isWaiterMode]);

  const filteredCancelList = useMemo(() => {
    const query = cancelListSearch.trim().toLowerCase();
    if (!query) return cancelListRows;
    return cancelListRows.filter((row) =>
      [row.actionLabel, row.tableName, row.productName, row.ticketId, row.userName].some((value) =>
        String(value).toLowerCase().includes(query),
      ),
    );
  }, [cancelListRows, cancelListSearch]);

  if (!session) {
    return <PosLoginScreen onSubmit={handleLogin} loading={loading} error={error} />;
  }

  const openTickets = ((ticketsData.items as Array<Record<string, any>>) ?? []).filter((ticket) =>
    ["OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING"].includes(String(ticket.status)),
  );
  const activeTableId = String(selectedTableContext?.id ?? selectedTicket?.tableId ?? "");
  const selectedTableOpenTickets = getOpenTicketsForTable(openTickets, activeTableId || null);
  const selectedTableLabel = String(
    selectedTableContext?.name ??
      selectedTableContext?.code ??
      selectedTicket?.tableName ??
      (activeTableId ? `Masa ${activeTableId.slice(-4)}` : ""),
  );
  const historyTickets = ((ticketsData.history as Array<Record<string, any>>) ?? []);
  const selectedProductRequiredGroups = ((selectedProduct?.requiredChoiceGroups as Array<Record<string, any>> | undefined) ?? []);
  const selectedProductModifierGroups = ((selectedProduct?.modifierGroups as Array<Record<string, any>> | undefined) ?? []);
  const selectedProductVariants = ((selectedProduct?.variants as Array<Record<string, any>> | undefined) ?? []);
  const selectedRequiredChoiceIds = ((productForm.requiredChoiceOptionIds as Array<unknown> | undefined) ?? []).map((id) => String(id));
  const selectedModifierIds = ((productForm.modifierOptionIds as Array<unknown> | undefined) ?? []).map((id) => String(id));
  const selectedVariantIds = ((productForm.variantIds as Array<unknown> | undefined) ?? []).map((id) => String(id));
  const extraGroups = selectedProductModifierGroups.filter((group) => {
    const name = String(group.name ?? "").toLowerCase();
    const type = String(group.type ?? group.kind ?? "").toLowerCase();
    return Boolean(group.isExtra) || type.includes("extra") || name.includes("ekstra") || name.includes("extra");
  });
  const standardModifierGroups = selectedProductModifierGroups.filter((group) => !extraGroups.includes(group));
  const productSelectionIssues = selectedProduct ? getMissingSelectionMessages(selectedProduct, productForm) : [];
  const productQuantityValue = Number(productForm.quantity ?? 1);
  const canSubmitProduct = productSelectionIssues.length === 0 && Number.isFinite(productQuantityValue) && productQuantityValue > 0;
  const productPresetNotes = presetNotes
    .map((note) => String(note.content ?? note.label ?? note.name ?? ""))
    .filter((note) => note.trim().length > 0)
    .slice(0, 12);
  const paymentMethodSource = paymentMethods.length > 0 ? paymentMethods : FALLBACK_PAYMENT_METHODS;
  const paymentMethodMap = new Map<string, { id: string; name: string; paymentMethod: string }>();
  for (const method of [...paymentMethodSource, ...FALLBACK_PAYMENT_METHODS]) {
    const paymentMethod = String(method.paymentMethod ?? "");
    if (!paymentMethod || paymentMethodMap.has(paymentMethod)) continue;
    paymentMethodMap.set(paymentMethod, {
      id: String(method.id ?? paymentMethod),
      name: paymentMethod === "CASH" ? "Nakit" : String(method.name ?? paymentMethod),
      paymentMethod,
    });
  }
  const paymentMethodOptions = Array.from(paymentMethodMap.values());
  const discountTypeOptions = discountTypes.filter((item) =>
    Number(item.defaultValue ?? 0) > 0 &&
    ["AMOUNT", "PERCENTAGE", "FIXED_PRICE"].includes(String(item.discountType ?? "")),
  );
  const productVariantSummary = selectedProductVariants.filter((variant) => selectedVariantIds.includes(String(variant.id)));
  const productRequiredSummary = selectedProductRequiredGroups.flatMap((group) =>
    ((group.options as Array<Record<string, any>> | undefined) ?? []).filter((option) =>
      selectedRequiredChoiceIds.includes(String(option.id)),
    ),
  );
  const productModifierSummary = standardModifierGroups.flatMap((group) =>
    ((group.options as Array<Record<string, any>> | undefined) ?? []).filter((option) =>
      selectedModifierIds.includes(String(option.id)),
    ),
  );
  const productExtraSummary = extraGroups.flatMap((group) =>
    ((group.options as Array<Record<string, any>> | undefined) ?? []).filter((option) =>
      selectedModifierIds.includes(String(option.id)),
    ),
  );
  const productBuilderSummaryRows = [
    ...productVariantSummary.map((variant) => ({
      key: `variant-${String(variant.id)}`,
      label: String(variant.name),
      price: Number(variant.priceDiff ?? 0),
    })),
    ...productRequiredSummary.map((option) => ({
      key: `required-${String(option.id)}`,
      label: String(option.name),
      price: Number(option.priceDiff ?? 0),
    })),
    ...productModifierSummary.map((option) => ({
      key: `modifier-${String(option.id)}`,
      label: String(option.name),
      price: Number(option.priceDiff ?? 0),
    })),
    ...productExtraSummary.map((option) => ({
      key: `extra-${String(option.id)}`,
      label: String(option.name),
      price: Number(option.priceDiff ?? 0),
    })),
  ];
  const singleItemPreviewTotal =
    Number(selectedProduct?.price ?? 0) +
    productVariantSummary.reduce((sum, variant) => sum + Number(variant.priceDiff ?? 0), 0) +
    productRequiredSummary.reduce((sum, option) => sum + Number(option.priceDiff ?? 0), 0) +
    [...productModifierSummary, ...productExtraSummary].reduce((sum, option) => sum + Number(option.priceDiff ?? 0), 0);
  const previewTotal = singleItemPreviewTotal * Number(productForm.quantity ?? 1);
  const selectedTicketSubtotal = Math.max(Number(selectedTicket?.subtotal ?? 0), 0);
  const selectedTicketGrandTotal = Math.max(Number(selectedTicket?.grandTotal ?? 0), 0);
  const selectedTicketRemainingAmount = Math.max(Number(selectedTicket?.remainingAmount ?? 0), 0);
  const isSelectedTicketClosed = ["PAID", "CANCELLED", "VOIDED"].includes(String(selectedTicket?.status ?? ""));
  const rawSelectedTicketPaidAmount = Math.max(Number(selectedTicket?.paidTotal ?? 0), 0);
  const selectedTicketPaidAmount =
    rawSelectedTicketPaidAmount > 0 && selectedTicketRemainingAmount < selectedTicketGrandTotal - 0.01
      ? rawSelectedTicketPaidAmount
      : 0;
  const splitTotal = paymentSplits.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const splitAccounts = ((selectedTicket?.splitAccounts as Array<Record<string, any>> | undefined) ?? []);
  const paymentRemainingAfterSplits = Math.max(selectedTicketRemainingAmount - splitTotal, 0);
  const anyPending = Object.keys(pendingOps).length > 0;
  const printBusy = Object.keys(pendingOps).some((key) => key.startsWith("print-") || key.startsWith("retryPrint-"));
  const paymentBusy = Boolean(pendingOps.submitPayment || pendingOps.applyDiscount || printBusy);
  const activePaymentMethod =
    paymentMethodOptions.find((item) => item.paymentMethod === paymentForm.method)?.paymentMethod ??
    paymentMethodOptions[0]?.paymentMethod ??
    "CASH";
  const paymentAmountValue = roundCurrency(Number(paymentForm.amount));
  const canAddPaymentSplit =
    !paymentBusy &&
    !isSelectedTicketClosed &&
    selectedTicketRemainingAmount > 0 &&
    paymentMethodOptions.some((item) => item.paymentMethod === activePaymentMethod) &&
    Number.isFinite(paymentAmountValue) &&
    paymentAmountValue > 0 &&
    paymentAmountValue <= selectedTicketRemainingAmount + 0.01;
  const canSubmitPayment =
    !paymentBusy &&
    !isSelectedTicketClosed &&
    paymentSplits.length > 0 &&
    Number.isFinite(splitTotal) &&
    splitTotal > 0 &&
    splitTotal <= selectedTicketRemainingAmount + 0.01;
  const countedCashTotal = roundCurrency(
    CASH_DENOMINATIONS.reduce((sum, denomination) => {
      const quantity = Number(registerForm.denominations[String(denomination)] ?? 0);
      return sum + denomination * quantity;
    }, 0),
  );
  const currentTicketBreakdown = (() => {
    const base = { cash: 0, card: 0, mobile: 0 };
    const payments = ((selectedTicket?.payments as Array<Record<string, any>> | undefined) ?? []);
    for (const payment of payments) {
      const bucket = getPaymentBucket(String(payment.method ?? ""));
      base[bucket] += Number(payment.amount ?? 0);
    }
    return base;
  })();
  const draftPaymentBreakdown = (() => {
    const base = { cash: 0, card: 0, mobile: 0 };
    for (const split of paymentSplits) {
      const bucket = getPaymentBucket(String(split.method ?? ""));
      base[bucket] += Number(split.amount ?? 0);
    }
    return base;
  })();
  const registerExpectedCash = Number(registerResult?.summary?.expectedCash ?? registerResult?.expectedCash ?? 0);
  const registerDifferencePreview = registerResult ? roundCurrency(countedCashTotal - registerExpectedCash) : null;
  const registerExpectedCard = Number(registerResult?.summary?.paymentBreakdown?.card ?? 0);
  const registerExpectedMobile = Number(registerResult?.summary?.paymentBreakdown?.mobile ?? 0);
  const openingCashValue = roundCurrency(Number(registerForm.openingCash));
  const canManagePayments = hasSessionPermission(session, "payment.manage");
  const canManageExpenses = hasSessionPermission(session, "expense.manage");
  const canOpenRegisterPermission = hasSessionPermission(session, "register.open");
  const canCloseRegisterPermission = hasSessionPermission(session, "register.close");
  const canViewReports = hasSessionPermission(session, "reports.view");
  const canSplitTicket = hasSessionPermission(session, "ticket.manage");
  const canMergeTickets = hasSessionPermission(session, "table.merge") && !isWaiterMode;
  const canTransferTable = hasSessionPermission(session, "table.transfer") && !isWaiterMode;
  const canDispatchPrinter = hasSessionPermission(session, "ticket.manage");
  const canRefundTicket = hasSessionPermission(session, "ticket.refund");
  const canOpenDrawerPermission = hasSessionPermission(session, "drawer.open");
  const canViewConnections = hasSessionPermission(session, "device.view");
  const canViewCancelList = hasSessionPermission(session, "reports.view");

  // Garson: ürün ekleyebilir ve miktarı arttırabilir.
  // Azaltma/silme UI seviyesinde kapalı olduğu için "kilit" miktar arttırmayı engellememeli.
  const canMutateCurrentTicketItems = true;
  const canOpenRegister = canOpenRegisterPermission && !anyPending && Number.isFinite(openingCashValue) && openingCashValue >= 0;
  const expenseDescription = expenseForm.description.trim();
  const expenseAmountValue = roundCurrency(Number(expenseForm.amount));
  const canCreateExpense = canManageExpenses && !anyPending && expenseDescription.length > 0 && Number.isFinite(expenseAmountValue) && expenseAmountValue > 0;

  return (
    <div className="pos-shell pos-shell--modalized">
      {!online ? (
        <div className="status status--warning">
          Internet baglantisi yok. Nakit satislar lokal kuyruga alinacak ve baglanti gelince otomatik sync edilecek.
        </div>
      ) : null}
      {online && offlineSyncState.queue.length > 0 ? (
        <div className="status status--info">
          {syncBusy
            ? `Offline kuyruk senkronize ediliyor... Bekleyen islem: ${offlineSyncState.queue.length}`
            : `Bekleyen offline islem var: ${offlineSyncState.queue.length}. Sistem otomatik sync deniyor.`}
        </div>
      ) : null}
      {toasts.length > 0 ? (
        <div className="pos-toast-stack">
          {toasts.map((toast) => (
            <div key={toast.id} className={`status ${toast.tone === "success" ? "status--success" : toast.tone === "warning" ? "status--warning" : toast.tone === "danger" ? "status--danger" : "status--info"}`}>
              {toast.title ? `${toast.title}: ` : ""}
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
      <PosTopbar
        caption={""}
        search={search}
        onSearchChange={setSearch}
        modeLabel={isWaiterMode ? "Garson Modu" : undefined}
        userLabel={session?.user.fullName ?? ""}
        onLogout={logoutSession}
      />
      {(error || info || anyPending) ? (
        <div className="pos-runtime-status">
          {error ? <div className="status status--danger">{error}</div> : null}
          {!error && info ? <div className="status status--info">{info}</div> : null}
          {anyPending ? <div className="status status--warning">Islem suruyor...</div> : null}
        </div>
      ) : null}

      <section className="pos-layout">
        <CatalogPane>
          <CatalogToolbar>
            <div className="table-floor-switch">
              {FLOOR_OPTIONS.map((floor) => (
                <button
                  key={floor.key}
                  type="button"
                  className={activeFloor === floor.key ? "active" : ""}
                  onClick={() => setActiveFloor(floor.key)}
                >
                  <span className="pos-floor-tab__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M7 21h10v-2H7v2Zm0-4h10v-2H7v2Zm0-4h10v-2H7v2Zm10-6V3H7v4H5V3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4h-2Z"
                      />
                    </svg>
                  </span>
                  <span className="pos-floor-tab__label">{floor.label}</span>
                </button>
              ))}
            </div>
          </CatalogToolbar>

          <CatalogContent>
            {isWaiterMode ? (
              <WaiterTableLobby
                floorLabel={`${FLOOR_OPTIONS.find((item) => item.key === activeFloor)?.label ?? "Zemin Kat"} / Masalar`}
                tables={waiterFloorTables}
                openTickets={openTickets}
                loading={loading && waiterFloorTables.length === 0}
                pending={Boolean(pendingOps.selectTable) || anyPending}
                onSelectTable={(table) => {
                  void handleSelectTable(table);
                }}
              />
            ) : (
            <div className="table-lobby">
              <h3>{`${FLOOR_OPTIONS.find((item) => item.key === activeFloor)?.label ?? "Zemin Kat"} / Masalar`}</h3>
              <div className="table-lobby__grid">
                {floorTableSlots.map((slot) => {
                  const table = slot.table;
                  const busy = table ? String(table.status ?? "").toUpperCase() !== "AVAILABLE" : false;
                  return (
                    <button
                      key={slot.key}
                      type="button"
                      className={`table-lobby__table ${busy ? "busy" : ""} ${!table ? "empty" : ""}`}
                      disabled={!table || anyPending}
                      onClick={() => {
                        if (!table) return;
                        void handleSelectTable(table);
                      }}
                    >
                      <strong>{slot.label}</strong>
                      <small>{table ? String(table.name ?? slot.label) : "Masa tanimli degil"}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            )}
            {!isWaiterMode ? (
              <OperationsToolbar>
                <button type="button" onClick={() => openDrawer("ticket")} disabled={!selectedTicket || anyPending}>Adisyon</button>
                <button type="button" onClick={() => openDrawer("actions")} disabled={!selectedTicket || anyPending}>Islemler</button>
                {canManagePayments ? <button type="button" onClick={() => openDrawer("payment")} disabled={!selectedTicket || anyPending}>Odeme</button> : null}
                <button type="button" onClick={() => void runQuickAction("self")} disabled={anyPending}>Self Servis</button>
                <button type="button" onClick={() => void runQuickAction("delivery")} disabled={anyPending}>Paket Servis</button>
                <button type="button" onClick={() => void runQuickAction("takeaway")} disabled={anyPending}>Gel-Al</button>
                {canManageExpenses ? <button type="button" onClick={() => openDrawer("expense")} disabled={anyPending}>Gider Ekle</button> : null}
                {canOpenRegisterPermission || canCloseRegisterPermission ? (
                  <button type="button" onClick={() => openDrawer("register")} disabled={anyPending}>Kasa Kapanis</button>
                ) : null}
                {canViewReports ? <button type="button" onClick={() => openDrawer("reports")} disabled={anyPending}>Raporlar</button> : null}
                {canViewConnections ? <button type="button" onClick={() => openDrawer("connections")} disabled={anyPending}>Baglanti Kontrol</button> : null}
                <button type="button" onClick={() => void runQuickAction("tasks")} disabled={anyPending}>Gorevler</button>
                <button type="button" onClick={() => void runQuickAction("messages")} disabled={anyPending}>Mesajlar</button>
              </OperationsToolbar>
            ) : null}
          </CatalogContent>
        </CatalogPane>
      </section>

      {selectedProduct ? (
        <div
          className="product-builder-backdrop"
          onClick={() => {
            setSelectedProduct(null);
            if (selectedTicket) {
              setActiveDrawer("ticket");
            }
          }}
        >
          <div className="product-builder" onClick={(event) => event.stopPropagation()}>
            <div className="product-builder__topbar">
              <div className="product-builder__title-row">
                <span className="product-builder__product-pill">{String(selectedProduct.name)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    if (selectedTicket) {
                      setActiveDrawer("ticket");
                    }
                  }}
                >
                  Iptal
                </button>
              </div>
            </div>
            <div className="product-builder__layout">
              <div className="product-builder__main">
                <div className="product-flow-tabs product-flow-tabs--builder">
                  <button
                    type="button"
                    className={productFlowTab === "options" ? "active" : ""}
                    onClick={() => setProductFlowTab("options")}
                  >
                    Secenekler
                  </button>
                  <button
                    type="button"
                    className={productFlowTab === "modifiers" ? "active" : ""}
                    onClick={() => setProductFlowTab("modifiers")}
                  >
                    {(() => {
                      const category = categories.find((item) => String(item.id) === String(selectedProduct?.categoryId ?? ""));
                      const name = String(category?.name ?? "").toLowerCase();
                      const isDrink = name.includes("içecek") || name.includes("icecek") || name.includes("kahve");
                      return isDrink ? "Suruplar" : "Ekstralar";
                    })()}
                  </button>
                  {extraGroups.length > 0 ? (
                    <button
                      type="button"
                      className={productFlowTab === "extras" ? "active" : ""}
                      onClick={() => setProductFlowTab("extras")}
                    >
                      Ekstralar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={productFlowTab === "notes" ? "active" : ""}
                    onClick={() => setProductFlowTab("notes")}
                  >
                    Not Ekle
                  </button>
                </div>

                {productFlowError ? <div className="status status--danger">{productFlowError}</div> : null}
                {!productFlowError && productSelectionIssues.length > 0 ? (
                  <div className="status status--warning">{productSelectionIssues[0]}</div>
                ) : null}

                {productFlowTab === "options" ? (
                  <div className="product-flow-pane">
                    {selectedProductVariants.length > 0 &&
                    (() => {
                      const category = categories.find((item) => String(item.id) === String(selectedProduct?.categoryId ?? ""));
                      const name = String(category?.name ?? "").toLowerCase();
                      return name.includes("içecek") || name.includes("icecek") || name.includes("kahve");
                    })() ? (
                      <div className="pos-choice-group">
                        <span>Varyant</span>
                        <div className="pos-chip-grid">
                          {selectedProductVariants.map((variant) => {
                            const active = selectedVariantIds.includes(String(variant.id));
                            return (
                              <button
                                key={String(variant.id)}
                                type="button"
                                className={`pos-chip ${active ? "active" : ""}`}
                                onClick={() =>
                                  setProductForm((current: Record<string, any>) => ({
                                    ...current,
                                    variantIds: active ? [] : [String(variant.id)],
                                  }))
                                }
                              >
                                {`${variant.name} / ${formatCurrency(Number(variant.priceDiff ?? 0))}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {selectedProductRequiredGroups.map((group: Record<string, any>) => {
                      const min = Number(group.selectionMin ?? 0);
                      const max = Math.max(1, Number(group.selectionMax ?? 1));
                      const selectedCount = getGroupSelectedCount(group, selectedRequiredChoiceIds);
                      return (
                        <div className="pos-choice-group" key={String(group.id)}>
                          <span>{String(group.name)}</span>
                          <small>{`Secim: ${selectedCount} / min ${min} - max ${max}`}</small>
                          <div className="pos-chip-grid">
                            {((group.options as Array<Record<string, any>> | undefined) ?? []).map((option) => {
                              const active = selectedRequiredChoiceIds.includes(String(option.id));
                              return (
                                <button
                                  key={String(option.id)}
                                  type="button"
                                  className={`pos-chip ${active ? "active" : ""}`}
                                  onClick={() => toggleGroupOption(group, String(option.id), "requiredChoiceOptionIds", max)}
                                >
                                  {`${option.name} / ${formatCurrency(Number(option.priceDiff ?? 0))}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {productFlowTab === "modifiers" ? (
                  <div className="product-flow-pane">
                    {standardModifierGroups.length === 0 ? <div className="status">Bu urun icin modifier yok.</div> : null}
                    {standardModifierGroups.map((group: Record<string, any>) => {
                      const min = Number(group.selectionMin ?? 0);
                      const max = Number(group.selectionMax ?? Number.MAX_SAFE_INTEGER);
                      const selectedCount = getGroupSelectedCount(group, selectedModifierIds);
                      return (
                        <div className="pos-choice-group" key={String(group.id)}>
                          <span>{String(group.name)}</span>
                          <small>
                            {`Secim: ${selectedCount}${min > 0 ? ` / min ${min}` : ""}${Number.isFinite(max) ? ` - max ${max}` : ""}`}
                          </small>
                          <div className="pos-chip-grid">
                            {((group.options as Array<Record<string, any>> | undefined) ?? []).map((option) => {
                              const active = selectedModifierIds.includes(String(option.id));
                              return (
                                <button
                                  key={String(option.id)}
                                  type="button"
                                  className={`pos-chip ${active ? "active" : ""}`}
                                  onClick={() => toggleGroupOption(group, String(option.id), "modifierOptionIds")}
                                >
                                  {`${option.name} / ${formatCurrency(Number(option.priceDiff ?? 0))}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {productFlowTab === "extras" ? (
                  <div className="product-flow-pane">
                    {extraGroups.map((group: Record<string, any>) => (
                      <div className="pos-choice-group" key={String(group.id)}>
                        <span>{String(group.name)}</span>
                        <div className="pos-chip-grid">
                          {((group.options as Array<Record<string, any>> | undefined) ?? []).map((option) => {
                            const active = selectedModifierIds.includes(String(option.id));
                            return (
                              <button
                                key={String(option.id)}
                                type="button"
                                className={`pos-chip ${active ? "active" : ""}`}
                                onClick={() => toggleGroupOption(group, String(option.id), "modifierOptionIds")}
                              >
                                {`${option.name} / ${formatCurrency(Number(option.priceDiff ?? 0))}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {productFlowTab === "notes" ? (
                  <div className="product-flow-pane">
                    <label className="pos-field">
                      <span>Urun Notu</span>
                      <textarea
                        value={String(productForm.note ?? "")}
                        onChange={(event) => setProductForm((current: Record<string, any>) => ({ ...current, note: event.target.value }))}
                        placeholder="Or: buzsuz, az sicak, ekstra sos"
                      />
                    </label>
                    <div className="product-note-preset-grid">
                      {productPresetNotes.map((note) => (
                        <button key={note} type="button" className="pos-chip" onClick={() => applyPresetProductNote(note)}>
                          {note}
                        </button>
                      ))}
                    </div>
                    <div className="keyboard-grid product-note-keypad">
                      {[...NOTE_KEYBOARD_ROWS.flat(), ...NOTE_KEYBOARD_ACTIONS].map((key) => (
                        <button
                          key={`product-${key}`}
                          type="button"
                          onClick={() => {
                            if (key === "Sil") {
                              setProductForm((current: Record<string, any>) => ({
                                ...current,
                                note: String(current.note ?? "").slice(0, -1),
                              }));
                              return;
                            }
                            if (key === "Temizle") {
                              setProductForm((current: Record<string, any>) => ({ ...current, note: "" }));
                              return;
                            }
                            appendProductNoteKey(key);
                          }}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <aside className="product-builder__sidebar">
                <div className="product-builder__sidebar-card">
                  <div className="product-builder__sidebar-head">
                    <strong>{String(selectedProduct.name)}</strong>
                  </div>
                  <label className="pos-field">
                    <span>Urun Notu</span>
                    <input
                      value={String(productForm.note ?? "")}
                      onChange={(event) => setProductForm((current: Record<string, any>) => ({ ...current, note: event.target.value }))}
                      placeholder="Not ekle"
                    />
                  </label>
                  <div className="product-builder__qty">
                    <span>Adet</span>
                    <div className="product-builder__qty-controls">
                      <button
                        type="button"
                        onClick={() =>
                          setProductForm((current: Record<string, any>) => ({
                            ...current,
                            quantity: Math.max(1, Number(current.quantity ?? 1) - 1),
                          }))
                        }
                      >
                        -
                      </button>
                      <strong>{Number(productForm.quantity ?? 1)}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          setProductForm((current: Record<string, any>) => ({
                            ...current,
                            quantity: Math.max(1, Number(current.quantity ?? 1) + 1),
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="product-builder__selection-list">
                    {productBuilderSummaryRows.map((row) => (
                      <div key={row.key} className="product-builder__selection-row">
                        <span>{row.label}</span>
                        <strong>{formatCurrency(row.price)}</strong>
                      </div>
                    ))}
                    {String(productForm.note ?? "").trim().length > 0 ? (
                      <div className="product-builder__selection-row product-builder__selection-row--note">
                        <span>Not</span>
                        <strong>{String(productForm.note).trim()}</strong>
                      </div>
                    ) : null}
                    {productBuilderSummaryRows.length === 0 && String(productForm.note ?? "").trim().length === 0 ? (
                      <div className="product-builder__selection-empty">Secim yapilmadi.</div>
                    ) : null}
                  </div>
                </div>
                <div className="product-builder__bottom">
                  <div className="product-builder__total">
                    <span>Toplam</span>
                    <strong>{formatCurrency(previewTotal)}</strong>
                  </div>
                  <button className="primary" type="button" onClick={() => void submitProduct()} disabled={!canSubmitProduct || Boolean(pendingOps.submitProduct)}>
                    {canSubmitProduct ? "Ekle" : "Secimi Tamamla"}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      <PaymentDrawer
        open={activeDrawer === "ticket"}
        eyebrow="Adisyon"
        title="Adisyon Detay"
        className="pos-drawer--ticket-modern"
        hideHeader
        closeLabel="×"
        onClose={closeDrawer}
      >
        <PosTableDetailModal
          ticket={selectedTicket}
          tableLabel={activeTableId ? selectedTableLabel : "Masa"}
          statusLabel={selectedTicket?.status ? formatTicketStatus(String(selectedTicket.status)) : null}
          pending={anyPending}
          isWaiterMode={isWaiterMode}
          canMutateItems={canMutateCurrentTicketItems}
          onClose={closeDrawer}
          onOpenCatalog={() => openDrawer("catalog")}
          onOpenActions={() => openDrawer("actions")}
          onOpenHistory={() => openDrawer("history")}
          onOpenNote={() => openDrawer("note")}
          onPrint={() => (isWaiterMode ? void handleSendToKitchen() : void handlePrint("receipt"))}
          onSendToKitchen={() => void handleSendToKitchen()}
          onRequestBill={() => void handleRequestBill()}
          billRequested={Boolean(selectedTicket?.billRequestedAt)}
          onOpenPayment={() => openDrawer("payment")}
          onChangeQuantity={(item, diff) => void changeQuantity(item, diff)}
          onRemoveItem={(item) => {
            if (!canMutateCurrentTicketItems) {
              setError("Garson modunda bu adisyon icin urun silme kilitli.");
              return;
            }
            if (!selectedTicket) return;
            setSelectedItemId(String(item.id));
            openConfirm("Urun Sil", "Bu urunu adisyondan silmek istiyor musun?", async () => {
              await posApi.removeItem(session.accessToken, String(selectedTicket.id), String(item.id));
              await loadAll(branchId, String(selectedTicket.id));
            });
          }}
        />
      </PaymentDrawer>

      <PaymentDrawer open={activeDrawer === "catalog"} eyebrow="Menü" title="Ürün Ekle" onClose={closeDrawer}>
        <div className="pos-catalog-drawer">
          <CategoryStrip>
            <button
              className={`category-pill ${activeTopCategoryId === "all" ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveTopCategoryId("all");
                setActiveSubCategoryId("all");
              }}
            >
              Tüm Ürünler
            </button>
            {topCategories.map((category) => (
              <button
                key={String(category.id)}
                className={`category-pill ${activeTopCategoryId === String(category.id) ? "active" : ""}`}
                type="button"
                onClick={() => {
                  setActiveTopCategoryId(String(category.id));
                  setActiveSubCategoryId("all");
                }}
              >
                {String(category.name)}
              </button>
            ))}
          </CategoryStrip>
          <SubcategoryStrip>
            <button className={`subcategory-pill ${activeSubCategoryId === "all" ? "active" : ""}`} type="button" onClick={() => setActiveSubCategoryId("all")}>
              Tümü
            </button>
            {subCategories.map((category) => (
              <button
                key={String(category.id)}
                className={`subcategory-pill ${activeSubCategoryId === String(category.id) ? "active" : ""}`}
                type="button"
                onClick={() => setActiveSubCategoryId(String(category.id))}
              >
                {String(category.name)}
              </button>
            ))}
          </SubcategoryStrip>
          <div className="pos-catalog-drawer__products">
            {pagedProducts.length ? (
              pagedProducts.map((product) => (
                <PosProductCard key={String(product.id)} product={product} onSelect={() => openProductDrawer(product)} />
              ))
            ) : (
              <div className="waiter-lobby__empty">Bu kategoride ürün bulunamadı.</div>
            )}
          </div>
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "payment"}
        eyebrow="Odeme Islemi"
        title="Odeme Al"
        className="pos-drawer--payment-modern"
        bodyClassName="pos-drawer__body--payment-modern"
        closeLabel="×"
        onClose={closeDrawer}
      >
        <div className="payment-modern">
          <div className="payment-modern__left">
            <div className="payment-modern__headline">
              <h4>Odeme Al</h4>
              <p>Adisyon odemesini tamamlayin</p>
            </div>
            <div className="payment-modern__segments">
              <button
                type="button"
                className="active"
                onClick={() => setPaymentForm((current) => ({ ...current, amount: selectedTicketRemainingAmount.toFixed(2) }))}
              >
                Tamami
              </button>
              <button
                type="button"
                onClick={() => setPaymentForm((current) => ({ ...current, amount: Math.max(selectedTicketRemainingAmount / 2, 0).toFixed(2) }))}
              >
                Yarisi
              </button>
              <button
                type="button"
                onClick={() =>
                  setPaymentForm((current) => ({
                    ...current,
                    amount: Math.max(selectedTicketRemainingAmount - splitTotal, 0).toFixed(2),
                  }))
                }
              >
                Kalan
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentSplits([]);
                  setPaymentForm((current) => ({ ...current, amount: "", referenceNumber: "" }));
                }}
              >
                Temizle
              </button>
            </div>
            <div className="payment-modern__entry">
              <select
                value={activePaymentMethod}
                onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))}
              >
                {paymentMethodOptions.map((method) => (
                  <option key={String(method.paymentMethod)} value={String(method.paymentMethod)}>
                    {String(method.name)}
                  </option>
                ))}
              </select>
              <div className="payment-modern__amount">
                <span>₺</span>
                <input
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, amount: sanitizeMoneyInput(event.target.value) }))}
                />
              </div>
              <button type="button" onClick={() => void addPaymentSplit()}>
                Ekle
              </button>
            </div>
            <NumericKeypad
              value={paymentForm.amount}
              onChange={(value) => setPaymentForm((current) => ({ ...current, amount: sanitizeMoneyInput(value) }))}
              onSubmit={() => void addPaymentSplit()}
              submitLabel="Parcayi Ekle"
              submitDisabled={false}
            />
            <label className="payment-modern__reference">
              <span>Referans No</span>
              <input
                placeholder="Islem referans numarasi"
                value={paymentForm.referenceNumber}
                onChange={(event) => setPaymentForm((current) => ({ ...current, referenceNumber: event.target.value }))}
              />
            </label>
            <div className="payment-modern__list">
              {paymentSplits.length === 0 ? <div className="status">Odeme parcasi yok.</div> : null}
              {paymentSplits.map((split, index) => {
                const method = String(split.method).toUpperCase();
                const icon = method === "CASH" ? "💵" : method === "CREDIT_CARD" ? "💳" : method === "QR" ? "🧾" : "🪙";
                const methodLabel = method === "CASH" ? "Nakit" : method === "CREDIT_CARD" ? "Kart" : method === "QR" ? "QR" : method;
                return (
                  <div key={`${split.method}-${index}`} className="payment-modern__split-item">
                    <div className="payment-modern__split-main">
                      <span>{icon}</span>
                      <strong>{methodLabel}</strong>
                    </div>
                    <b>{formatCurrency(split.amount)}</b>
                    <button type="button" onClick={() => removePaymentSplit(index)} aria-label="Sil">
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            {canSplitTicket ? (
              <div className="payment-modern__split-card">
                <h5>Urun / Adet Bolme</h5>
                <p className="admin-subtle-text">Detayli bolme ve kisi bazli hesap icin Adisyon Bol ekranini kullanin.</p>
                <button type="button" onClick={() => openDrawer("splitBill")} disabled={anyPending}>
                  Split Bill Ac
                </button>
              </div>
            ) : null}
            {splitAccounts.length > 0 ? (
              <div className="payment-modern__split-card">
                <h5>Alt Hesaplar</h5>
                <div className="pos-history-grid">
                  {splitAccounts.map((account) => (
                    <button
                      key={String(account.id)}
                      type="button"
                      className="pos-history-card"
                      onClick={() => void openTicketById(String(account.id))}
                    >
                      <strong>{account.personLabel ?? account.ticketName ?? account.id}</strong>
                      <span>{`${account.status} / ${formatCurrency(Number(account.grandTotal ?? 0))} / Kalan ${formatCurrency(Number(account.remainingAmount ?? 0))}`}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="payment-modern__right">
            <div className="payment-modern__summary">
              <div><span>Toplam Tutar</span><strong>{formatCurrency(selectedTicketGrandTotal)}</strong></div>
              <div><span>Odenen</span><strong>{formatCurrency(selectedTicketPaidAmount)}</strong></div>
              <div className={`payment-modern__remaining ${selectedTicketRemainingAmount <= 0 ? "ok" : ""}`}>
                <span>Kalan</span>
                <strong>{formatCurrency(paymentRemainingAfterSplits)}</strong>
              </div>
            </div>
            <div className="payment-modern__discounts">
              <h5>Hazir Indirimler</h5>
              {discountTypeOptions.length === 0 ? <div className="status">Tanimli indirim bulunamadi.</div> : null}
              {discountTypeOptions.length > 0 ? (
                <label className="payment-modern__discount-select">
                  <span>Indirim Sec</span>
                  <select
                    value={discountForm.discountConfigId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      const selectedDiscount = discountTypeOptions.find((item) => String(item.id) === nextId);
                      if (!selectedDiscount) {
                        setDiscountForm({ discountConfigId: "", label: "", amount: "", ticketItemId: "" });
                        return;
                      }
                      setDiscountForm({
                        discountConfigId: String(selectedDiscount.id),
                        label: String(selectedDiscount.name ?? "Indirim"),
                        amount: roundCurrency(Number(selectedDiscount.defaultValue ?? 0)).toFixed(2),
                        ticketItemId: "",
                      });
                    }}
                  >
                    <option value="">Hazir indirim secin</option>
                    {discountTypeOptions.map((discount) => (
                      <option key={String(discount.id)} value={String(discount.id)}>
                        {String(discount.name ?? "Indirim")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="payment-modern__actions">
              <button type="button" onClick={() => void applyDiscount()} disabled={paymentBusy || !discountForm.discountConfigId}>
                Indirimi Uygula
              </button>
              <button className="primary" type="button" onClick={() => void submitPayment()} disabled={!canSubmitPayment}>
                {Boolean(pendingOps.submitPayment) ? "Isleniyor..." : "Odemeyi Tamamla"}
              </button>
            </div>
          </div>
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "actions"}
        eyebrow="Adisyon Islemleri"
        title="Adisyon Islemleri"
        className="pos-drawer--actions-modern"
        bodyClassName="pos-drawer__body--actions-modern"
        closeLabel="×"
        onClose={closeDrawer}
      >
        <div className="actions-modern">
          <div className="actions-modern__left">
            <div className="actions-modern__headline">
              <h4>Adisyon Islemleri</h4>
              <p>Ikram, iptal, indirim ve operasyon adimlarini yonetin</p>
            </div>

            <div className="actions-modern__card">
              <h5>Temel Bilgiler</h5>
              <div className="actions-modern__field-grid">
                <label className="actions-modern__field">
                  <span>Adisyon Adi</span>
                  <input
                    value={actionForm.ticketName}
                    onChange={(event) => setActionForm((current) => ({ ...current, ticketName: event.target.value }))}
                    placeholder="Adisyon ismi"
                  />
                </label>
                <label className="actions-modern__field">
                  <span>Musteri Sayisi</span>
                  <input
                    type="number"
                    min="1"
                    value={actionForm.coverCount}
                    onChange={(event) => setActionForm((current) => ({ ...current, coverCount: event.target.value }))}
                    placeholder="1"
                  />
                </label>
              </div>
              <div className="actions-modern__inline-actions">
                <button type="button" onClick={() => void handleRenameTicket()} disabled={anyPending}>Adisyona Isim Ver</button>
                <button type="button" onClick={() => void handleUpdateCoverCount()} disabled={anyPending}>Musteri Sayisini Kaydet</button>
                <button type="button" onClick={() => openDrawer("note")} disabled={anyPending}>Not Ekle</button>
              </div>
            </div>

            <div className="actions-modern__card">
              <h5>Indirim</h5>
              <div className="actions-modern__field-grid">
                <label className="actions-modern__field">
                  <span>Indirim Turu</span>
                  <select
                    value={actionForm.discountScope}
                    onChange={(event) =>
                      setActionForm((current) => ({ ...current, discountScope: event.target.value === "line" ? "line" : "ticket" }))
                    }
                  >
                    <option value="ticket">Adisyon Geneli</option>
                    <option value="line" disabled={!selectedItemId}>Secili Satir</option>
                  </select>
                </label>
                <label className="actions-modern__field">
                  <span>Indirim Aciklamasi</span>
                  <input
                    value={actionForm.discountLabel}
                    onChange={(event) => setActionForm((current) => ({ ...current, discountLabel: event.target.value }))}
                    placeholder="Manuel Indirim"
                  />
                </label>
              </div>
              <div className="actions-modern__field-grid">
                <label className="actions-modern__field">
                  <span>Indirim Turu</span>
                  <select
                    value={actionForm.discountMode}
                    onChange={(event) =>
                      setActionForm((current) => ({ ...current, discountMode: event.target.value === "percent" ? "percent" : "amount" }))
                    }
                  >
                    <option value="amount">Sabit Tutar</option>
                    <option value="percent">Yuzde</option>
                  </select>
                </label>
                <label className="actions-modern__field">
                  <span>{actionForm.discountMode === "percent" ? "Yuzde (%)" : "Tutar"}</span>
                  <input
                    type="number"
                    min="0"
                    step={actionForm.discountMode === "percent" ? "1" : "0.01"}
                    max={actionForm.discountMode === "percent" ? "100" : undefined}
                    value={actionForm.discountAmount}
                    onChange={(event) => setActionForm((current) => ({ ...current, discountAmount: event.target.value }))}
                    placeholder={actionForm.discountMode === "percent" ? "10" : "0.00"}
                  />
                </label>
              </div>
              <div className="actions-modern__inline-actions">
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    const baseTotal =
                      actionForm.discountScope === "line" && selectedItemId
                        ? Number(
                            ((selectedTicket?.items as Array<Record<string, any>> | undefined) ?? []).find((row) => String(row.id) === selectedItemId)?.lineTotal ?? 0,
                          )
                        : Number(selectedTicket?.grandTotal ?? 0);
                    const amountValue = Number(actionForm.discountAmount);
                    const preview =
                      actionForm.discountMode === "percent"
                        ? roundCurrency(Math.max(baseTotal - (baseTotal * amountValue) / 100, 0))
                        : roundCurrency(Math.max(baseTotal - amountValue, 0));
                    openFinancialConfirm(
                      "Indirim Onayi",
                      `${actionForm.discountScope === "line" ? "Satir" : "Adisyon"} indirimi uygulanacak. Yeni toplam: ${formatCurrency(preview)}`,
                      handleApplyActionDiscount,
                    );
                  }}
                  disabled={anyPending || !selectedTicket}
                >
                  Indirim Yap
                </button>
              </div>
            </div>

            {canViewCancelList ? (
              <div className="actions-modern__card">
                <h5>Iptal Listesi</h5>
                <p className="admin-subtle-text">Iptal edilen adisyon ve urunleri raporlayin.</p>
                <div className="actions-modern__inline-actions">
                  <button type="button" onClick={() => openDrawer("cancelList")} disabled={anyPending}>
                    Iptal Listesini Ac
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="actions-modern__right">
            <div className="actions-modern__card">
              <h5>Hizli Islemler</h5>
              <div className="actions-modern__button-grid">
                <button
                  type="button"
                  onClick={() => {
                    const item = ((selectedTicket?.items as Array<Record<string, any>> | undefined) ?? []).find((row) => String(row.id) === selectedItemId);
                    if (!item) {
                      setError("Ikram icin satir sec.");
                      return;
                    }
                    openFinancialConfirm(
                      "Ikram Onayi",
                      `${String(item.productName ?? "Urun")} — ${formatCurrency(Number(item.lineTotal ?? 0))}\nIkram olarak isaretlenecek.`,
                      handleComplimentary,
                    );
                  }}
                  disabled={anyPending || !selectedItemId}
                >
                  Ikram
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const item = ((selectedTicket?.items as Array<Record<string, any>> | undefined) ?? []).find((row) => String(row.id) === selectedItemId);
                    if (!item) {
                      setError("Iptal icin satir sec.");
                      return;
                    }
                    openFinancialConfirm(
                      "Urun Iptal",
                      `${String(item.productName ?? "Urun")} — ${formatCurrency(Number(item.lineTotal ?? 0))}\nIptal edilecek.`,
                      handleCancelLine,
                    );
                  }}
                  disabled={anyPending || !selectedItemId}
                >
                  Urun Iptal
                </button>
                <button type="button" onClick={() => openConfirm("Atik Isaretle", "Secili satiri atik olarak isaretlemek istiyor musun?", async () => { await handleWaste(); })} disabled={anyPending}>Atik</button>
                {canManagePayments ? <button type="button" onClick={() => openDrawer("payment")} disabled={anyPending}>Odeme Al</button> : null}
                <button type="button" onClick={() => void handlePrint("label")} disabled={anyPending}>Etiket Yazdir</button>
                {canOpenDrawerPermission ? <button type="button" onClick={() => void handleDrawerOpen()} disabled={anyPending}>Para Cekmecesi</button> : null}
                {canViewConnections ? <button type="button" onClick={() => openDrawer("connections")} disabled={anyPending}>Baglanti</button> : null}
                {canSplitTicket && !isWaiterMode ? (
                  <button type="button" onClick={() => openDrawer("splitBill")} disabled={anyPending || !selectedTicket}>Adisyon Bol</button>
                ) : null}
                {canTransferTable ? (
                  <button type="button" onClick={() => openDrawer("transfer")} disabled={anyPending || !selectedTicket?.tableId}>Masayi Tasima</button>
                ) : null}
                {canMergeTickets ? (
                  <button type="button" onClick={() => openDrawer("merge")} disabled={anyPending || mergeCandidateTickets.length === 0}>Masalari Birlestir</button>
                ) : null}
                {canRefundTicket ? (
                  <button type="button" onClick={() => openConfirm("Iade Baslat", "Secili adisyon icin iade baslatilsin mi?", async () => { await handleRefund(); })} disabled={anyPending}>Iade</button>
                ) : null}
              </div>
            </div>

            <div className="actions-modern__card">
              <h5>Yazdirma Kuyrugu / Log</h5>
              {printJobs.length === 0 ? <div className="status">Bu oturumda yazdirma kaydi yok.</div> : null}
              <div className="actions-modern__logs">
                {printJobs.map((job) => (
                  <div key={job.id} className="actions-modern__log-item">
                    <span>{`${job.documentType.toUpperCase()} / ${job.printerName} / ${job.status.toUpperCase()} / deneme ${job.attempts}`}</span>
                    {job.status === "failed" ? (
                      <button type="button" onClick={() => void retryPrint(job.id)} disabled={anyPending}>Retry</button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "expense"}
        compact
        eyebrow="Hizli Gider"
        title="Gider Ekle"
        onClose={closeDrawer}
      >
        <div className="finance-stack">
          <label className="pos-field">
            <span>Aciklama</span>
            <input
              value={expenseForm.description}
              onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Or: market, servis, anlik alim"
            />
          </label>
          <label className="pos-field">
            <span>Tutar</span>
            <input
              value={expenseForm.amount}
              onChange={(event) => setExpenseForm((current) => ({ ...current, amount: sanitizeMoneyInput(event.target.value) }))}
              placeholder="0.00"
            />
          </label>
          <NumericKeypad
            value={expenseForm.amount}
            onChange={(value) => setExpenseForm((current) => ({ ...current, amount: sanitizeMoneyInput(value) }))}
            onSubmit={() => void handleCreateExpenseEntry()}
            submitLabel="Gideri Kaydet"
          submitDisabled={!canCreateExpense}
          />
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "register"}
        eyebrow="Kasa Islemleri"
        title="Kasa Kapanisi"
        onClose={closeDrawer}
      >
        <div className="finance-stack">
          <div className="finance-grid finance-grid--two">
            <label className="pos-field">
              <span>Opening Cash</span>
              <input
                value={registerForm.openingCash}
                onChange={(event) => setRegisterForm((current) => ({ ...current, openingCash: sanitizeMoneyInput(event.target.value) }))}
                placeholder="0.00"
              />
            </label>
            <div className="finance-card finance-card--actions">
              <div className="finance-card__head">
                <strong>Yeni Session</strong>
                <span>Kasa acilis</span>
              </div>
              <NumericKeypad
                value={registerForm.openingCash}
                onChange={(value) => setRegisterForm((current) => ({ ...current, openingCash: sanitizeMoneyInput(value) }))}
                onSubmit={() => void handleOpenRegister()}
                submitLabel="Kasa Ac"
                submitDisabled={!canOpenRegister}
              />
            </div>
          </div>

          <CashCountGrid
            quantities={registerForm.denominations}
            onChange={updateRegisterDenomination}
            denominations={CASH_DENOMINATIONS}
            total={countedCashTotal}
          />

          <div className="finance-grid finance-grid--two">
            <label className="pos-field">
              <span>Kart Odeme</span>
              <input
                value={registerForm.cardAmount}
                onChange={(event) => setRegisterForm((current) => ({ ...current, cardAmount: sanitizeMoneyInput(event.target.value) }))}
                placeholder="0.00"
              />
              <small className="finance-helper">{`Beklenen: ${formatCurrency(registerExpectedCard)}`}</small>
            </label>
            <label className="pos-field">
              <span>Mobil Odeme</span>
              <input
                value={registerForm.mobileAmount}
                onChange={(event) => setRegisterForm((current) => ({ ...current, mobileAmount: sanitizeMoneyInput(event.target.value) }))}
                placeholder="0.00"
              />
              <small className="finance-helper">{`Beklenen: ${formatCurrency(registerExpectedMobile)}`}</small>
            </label>
          </div>

          <div className="finance-grid finance-grid--summary">
            <div className="finance-card">
              <div className="finance-card__head">
                <strong>Counted Cash</strong>
                <span>{formatCurrency(countedCashTotal)}</span>
              </div>
            </div>
            <div className="finance-card">
              <div className="finance-card__head">
                <strong>Expected Cash</strong>
                <span>{formatCurrency(registerExpectedCash)}</span>
              </div>
            </div>
            <div className="finance-card">
              <div className="finance-card__head">
                <strong>Difference</strong>
                <span>{registerDifferencePreview == null ? "-" : formatCurrency(registerDifferencePreview)}</span>
              </div>
            </div>
          </div>

          <div className="pos-inline-actions">
            {canCloseRegisterPermission ? (
              <button className="primary" type="button" onClick={() => void handleCloseRegister()} disabled={anyPending}>
                Kasa Kapat
              </button>
            ) : null}
          </div>
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "reports"}
        eyebrow="Satis Raporlari"
        title="POS Rapor Ekrani"
        onClose={closeDrawer}
      >
        <PosReportScreen
          loading={Boolean(pendingOps.loadReportSummary || pendingOps.exportReport)}
          dateFrom={reportFilters.dateFrom}
          dateTo={reportFilters.dateTo}
          onDateFromChange={(value) => setReportFilters((current) => ({ ...current, dateFrom: value }))}
          onDateToChange={(value) => setReportFilters((current) => ({ ...current, dateTo: value }))}
          onApply={() => void applyReportFilters()}
          onPrint={handlePrintReport}
          onExport={() => void handleExportReport()}
          data={reportData}
        />
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "connections"}
        eyebrow="Terminal ve Cihaz"
        title="Baglanti Kontrol Ekrani"
        onClose={closeDrawer}
      >
        <div className="finance-stack">
          <label className="pos-field">
            <span>Aktif Terminal</span>
            <select
              value={selectedTerminalId}
              onChange={(event) => {
                const nextTerminalId = event.target.value;
                setSelectedTerminalId(nextTerminalId);
                void loadAll(branchId, selectedTicket?.id ? String(selectedTicket.id) : null).catch(() => {
                  // runOp hata state'ine duser
                });
              }}
            >
              {terminals.length === 0 ? <option value="">Terminal bulunamadi</option> : null}
              {terminals.map((terminal) => (
                <option key={String(terminal.id)} value={String(terminal.id)}>
                  {`${String(terminal.name ?? terminal.code ?? terminal.id)} / ${String(terminal.status ?? "unknown")}`}
                </option>
              ))}
            </select>
          </label>

          <div className="finance-grid finance-grid--summary">
            <div className="finance-card">
              <div className="finance-card__head">
                <strong>Terminal</strong>
                <span>{activeTerminal ? String(activeTerminal.name ?? activeTerminal.code ?? "-") : "Secim yok"}</span>
              </div>
              <small>{activeTerminal ? `Durum: ${String(activeTerminal.status ?? "unknown")}` : "Terminal kaydi eksik"}</small>
            </div>
            <div className="finance-card">
              <div className="finance-card__head">
                <strong>POS Cihazi</strong>
                <span>{String(catalog.deviceConfig?.defaultDevice?.name ?? "Fallback / tanimsiz")}</span>
              </div>
              <small>{String(catalog.deviceConfig?.defaultDevice?.status ?? "unknown")}</small>
            </div>
            <div className="finance-card">
              <div className="finance-card__head">
                <strong>Fis Yazicisi</strong>
                <span>{String(catalog.deviceConfig?.defaultPrinter?.name ?? "Tanimli degil")}</span>
              </div>
              <small>{catalog.deviceConfig?.defaultPrinter ? "Hazir" : "Fallback bekliyor"}</small>
            </div>
          </div>

          {Array.isArray(catalog.deviceConfig?.diagnostics?.warnings) && catalog.deviceConfig.diagnostics.warnings.length > 0 ? (
            <div className="status status--warning">
              {catalog.deviceConfig.diagnostics.warnings.map((warning: string) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : (
            <div className="status">Config fallback zinciri saglikli gorunuyor.</div>
          )}

          <div className="pos-inline-actions">
            <button type="button" onClick={() => void loadConnectionStatus()} disabled={Boolean(pendingOps.loadConnectionStatus)}>
              Durumu Yenile
            </button>
            <button
              type="button"
              onClick={() =>
                void runOp("testPrinter", async () => {
                  const printerId = String(catalog.deviceConfig?.defaultPrinter?.id ?? "");
                  if (!printerId) {
                    throw new Error("Test icin uygun yazici bulunamadi.");
                  }
                  await posApi.testPrinter(session.accessToken, {
                    printerId,
                    documentType: "receipt",
                    content: "POS TEST CIKTISI",
                  });
                  setInfo("Yazici test ciktisi kuyruga alindi.");
                  await loadConnectionStatus();
                })
              }
              disabled={Boolean(pendingOps.testPrinter)}
            >
              Yazici Test Ciktisi
            </button>
          </div>

          {connectionStatus ? (
            <div className="action-panel-card">
              <strong>Canli Teshis</strong>
              <ul className="pos-list payment-splits-list">
                <li>{`Terminal heartbeat: ${String(connectionStatus.terminal?.heartbeatAt ?? "-")}`}</li>
                <li>{`Cihaz: ${String(connectionStatus.device?.name ?? "-")} / ${String(connectionStatus.device?.status ?? "-")}`}</li>
                <li>{`Atama sayisi: ${Array.isArray(connectionStatus.deviceAssignments) ? connectionStatus.deviceAssignments.length : 0}`}</li>
                <li>{`Yazici isleri: ${Array.isArray(connectionStatus.printerJobs) ? connectionStatus.printerJobs.length : 0}`}</li>
              </ul>
            </div>
          ) : null}
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "splitBill"}
        eyebrow="Split Bill"
        title="Adisyon Bolme"
        onClose={closeDrawer}
      >
        <div className="finance-stack">
          <div className="payment-modern__segments">
            <button type="button" className={splitMode === "item" ? "active" : ""} onClick={() => setSplitMode("item")}>
              Urun / Adet
            </button>
            <button type="button" className={splitMode === "person" ? "active" : ""} onClick={() => setSplitMode("person")}>
              Kisi Bazli
            </button>
          </div>

          {splitMode === "item" ? (
            <div className="payment-modern__split-card">
              <h5>Urun veya Adet Bolme</h5>
              <div className="payment-modern__split-grid">
                <label>
                  <span>Urun</span>
                  <select
                    value={splitDraft.itemId}
                    onChange={(event) => setSplitDraft((current) => ({ ...current, itemId: event.target.value }))}
                  >
                    <option value="">Secin</option>
                    {((selectedTicket?.items as Array<Record<string, any>> | undefined) ?? []).map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {`${String(item.productName)} (${Number(item.quantity)})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Adet</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={splitDraft.quantity}
                    onChange={(event) => setSplitDraft((current) => ({ ...current, quantity: event.target.value }))}
                  />
                </label>
                <button type="button" onClick={() => openSplitConfirm()} disabled={anyPending || !splitDraft.itemId}>
                  Alt Hesap Olustur
                </button>
              </div>
            </div>
          ) : (
            <div className="payment-modern__split-card">
              <h5>Kisi Bazli Bolme</h5>
              {personSplitDraft.map((row, index) => (
                <div key={`person-${index}`} className="payment-modern__split-grid">
                  <label>
                    <span>Kisi</span>
                    <input
                      value={row.label}
                      onChange={(event) =>
                        setPersonSplitDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Urun</span>
                    <select
                      value={row.itemId}
                      onChange={(event) =>
                        setPersonSplitDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, itemId: event.target.value } : entry,
                          ),
                        )
                      }
                    >
                      <option value="">Secin</option>
                      {((selectedTicket?.items as Array<Record<string, any>> | undefined) ?? []).map((item) => (
                        <option key={String(item.id)} value={String(item.id)}>
                          {`${String(item.productName)} (${Number(item.quantity)})`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Adet</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={row.quantity}
                      onChange={(event) =>
                        setPersonSplitDraft((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, quantity: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <button type="button" onClick={() => void handlePersonSplit()} disabled={anyPending}>
                Kisi Hesaplarini Olustur
              </button>
            </div>
          )}

          {splitAccounts.length > 0 ? (
            <div className="payment-modern__split-card">
              <h5>Mevcut Alt Hesaplar</h5>
              <div className="pos-history-grid">
                {splitAccounts.map((account) => (
                  <button
                    key={String(account.id)}
                    type="button"
                    className="pos-history-card"
                    onClick={() => void openTicketById(String(account.id))}
                  >
                    <strong>{account.personLabel ?? account.ticketName ?? account.id}</strong>
                    <span>{`${formatCurrency(Number(account.grandTotal ?? 0))} / Odenen ${formatCurrency(Number(account.paidTotal ?? 0))} / Kalan ${formatCurrency(Number(account.remainingAmount ?? 0))}`}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "transfer"}
        eyebrow="Masa Tasima"
        title="Hedef masa secin"
        onClose={closeDrawer}
      >
        <p className="admin-subtle-text">Yalnizca musait masalar secilebilir. Dolu masalar devre disidir.</p>
        <div className="pos-history-grid">
          {tables.length === 0 ? <div className="pos-history-card">Masa bulunamadi.</div> : null}
          {tables.map((table) => {
            const isCurrent = String(table.id) === String(selectedTicket?.tableId ?? "");
            const isAvailable = String(table.status) === "AVAILABLE" && !table.activeTicketId;
            const isDisabled = isCurrent || !isAvailable;
            return (
              <button
                key={String(table.id)}
                type="button"
                className={`pos-history-card${isDisabled ? " pos-history-card--disabled" : ""}`}
                disabled={isDisabled || anyPending}
                onClick={() => void handleTransfer(String(table.id))}
              >
                <strong>{String(table.name ?? table.code ?? table.id)}</strong>
                <span>
                  {isCurrent
                    ? "Mevcut masa"
                    : isAvailable
                      ? "Musait"
                      : `Dolu / ${String(table.status ?? "OCCUPIED")}`}
                </span>
              </button>
            );
          })}
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "merge"}
        eyebrow="Masa Birlestirme"
        title="Hedef adisyon secin"
        onClose={closeDrawer}
      >
        <p className="admin-subtle-text">Acik adisyonlardan birini secerek mevcut adisyonla birlestirin.</p>
        <div className="pos-history-grid">
          {mergeCandidateTickets.length === 0 ? <div className="pos-history-card">Birlestirilecek acik adisyon yok.</div> : null}
          {mergeCandidateTickets.map((ticket) => (
            <button
              key={String(ticket.id)}
              type="button"
              className="pos-history-card"
              disabled={anyPending}
              onClick={() => void handleMerge(String(ticket.id))}
            >
              <strong>{ticket.ticketName ?? ticket.table?.name ?? ticket.id}</strong>
              <span>{`${ticket.status} / ${formatCurrency(Number(ticket.grandTotal ?? 0))} / ${ticket.table?.name ?? "Masa yok"}`}</span>
            </button>
          ))}
        </div>
      </PaymentDrawer>

      <PaymentDrawer
        open={activeDrawer === "history"}
        eyebrow="Geçmiş Siparişler"
        title="Kapalı fişler"
        onClose={closeDrawer}
      >
        <div className="pos-history-grid">
          {historyTickets.length === 0 ? <div className="pos-history-card">Gecmis adisyon bulunmuyor.</div> : null}
          {historyTickets.map((ticket) => (
            <div key={String(ticket.id)} className="pos-history-card">
              <strong>{ticket.ticketName ?? ticket.id}</strong>
              <span>{`${ticket.status} / ${formatCurrency(Number(ticket.grandTotal ?? 0))}`}</span>
            </div>
          ))}
        </div>
      </PaymentDrawer>

      <PaymentDrawer open={activeDrawer === "pending"} eyebrow="Paket / Mesaj" title="Bekleyen Siparisler" onClose={closeDrawer}>
        <label className="pos-field">
          <span>Musteri Ara</span>
          <input value={quickActionSearch} onChange={(event) => setQuickActionSearch(event.target.value)} placeholder="Ada gore ara" />
        </label>
        <div className="pos-history-grid">
          {pendingOrders.length === 0 ? <div className="pos-history-card">Bekleyen kayit yok.</div> : null}
          {pendingOrders
            .filter((row) =>
              quickActionSearch.trim()
                ? String(row.customerName ?? "").toLowerCase().includes(quickActionSearch.trim().toLowerCase())
                : true,
            )
            .map((row) => (
              <button key={String(row.id)} type="button" className="pos-history-card" onClick={() => void handlePendingOrderSelect(row)}>
                <strong>{String(row.customerName ?? row.id)}</strong>
                <span>{`${String(row.channel ?? "-")} / ${String(row.status ?? "-")}`}</span>
              </button>
            ))}
        </div>
      </PaymentDrawer>

      <PaymentDrawer open={activeDrawer === "note"} eyebrow="Not Ekle" title="Urun veya adisyon notu" onClose={closeDrawer}>
        <label className="pos-field">
          <span>Not</span>
          <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Or: az sicak, seker yok, once servis" />
        </label>
        <div className="keyboard-grid">
          {[...NOTE_KEYBOARD_ROWS.flat(), ...NOTE_KEYBOARD_ACTIONS].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === "Sil") {
                  setNoteDraft((current) => current.slice(0, -1));
                  return;
                }
                if (key === "Temizle") {
                  setNoteDraft("");
                  return;
                }
                appendNoteKey(key);
              }}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="pos-inline-actions">
          <button type="button" onClick={closeDrawer}>Iptal</button>
          <button className="primary" type="button" onClick={() => void submitQuickNote()}>Not Ekle</button>
        </div>
      </PaymentDrawer>

      <PaymentDrawer open={activeDrawer === "cancelList"} eyebrow="Iptal Listesi" title="Iptal Islemleri" onClose={closeDrawer}>
        <label className="pos-field">
          <span>Arama</span>
          <input
            value={cancelListSearch}
            onChange={(event) => setCancelListSearch(event.target.value)}
            placeholder="Adisyon, masa, urun veya personel"
          />
        </label>
        {cancelListLoading ? <div className="status">Iptal listesi yukleniyor...</div> : null}
        {cancelListError ? <div className="status status--warning">{cancelListError}</div> : null}
        {!cancelListLoading && !cancelListError && filteredCancelList.length === 0 ? (
          <div className="status">Iptal kaydi bulunamadi.</div>
        ) : null}
        {!cancelListLoading && !cancelListError && filteredCancelList.length > 0 ? (
          <div className="pos-history-grid">
            {filteredCancelList.map((row) => (
              <div key={row.id} className="pos-history-card">
                <strong>{row.actionLabel}</strong>
                <span>{row.createdAt ? new Date(row.createdAt).toLocaleString("tr-TR") : "-"}</span>
                <span>{`Masa: ${row.tableName} | Adisyon: ${row.ticketId}`}</span>
                <span>{`Urun: ${row.productName} | Adet: ${row.quantity || "-"}`}</span>
                <span>{`Personel: ${row.userName}`}</span>
              </div>
            ))}
          </div>
        ) : null}
      </PaymentDrawer>

      <nav className="pos-bottom-nav" aria-label="Alt menü">
        <button type="button" className="pos-bottom-nav__item pos-bottom-nav__item--active" onClick={closeDrawer}>
          <span className="pos-bottom-nav__icon" aria-hidden="true">
            ▦
          </span>
          <span className="pos-bottom-nav__label">Masalar</span>
        </button>
        {!isWaiterMode ? (
          <button
            type="button"
            className="pos-bottom-nav__item"
            onClick={() => {
              openDrawer("history");
            }}
          >
            <span className="pos-bottom-nav__icon" aria-hidden="true">
              ≡
            </span>
            <span className="pos-bottom-nav__label">Adisyonlar</span>
          </button>
        ) : null}
        <button
          type="button"
          className="pos-bottom-nav__item"
          onClick={() => {
            openDrawer("pending");
          }}
        >
          <span className="pos-bottom-nav__icon" aria-hidden="true">
            ⏱
          </span>
          <span className="pos-bottom-nav__label">Siparişler</span>
        </button>
        <button
          type="button"
          className="pos-bottom-nav__item"
          onClick={() => {
            openDrawer("actions");
          }}
        >
          <span className="pos-bottom-nav__icon" aria-hidden="true">
            ⦿
          </span>
          <span className="pos-bottom-nav__label">Profil</span>
        </button>
      </nav>

      {financialConfirm.onConfirm ? (
        <div className="pos-confirm-backdrop" onClick={() => setFinancialConfirm({ title: "", message: "", reason: "", onConfirm: null })}>
          <div className="pos-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>{financialConfirm.title}</h3>
            <p style={{ whiteSpace: "pre-line" }}>{financialConfirm.message}</p>
            <label className="actions-modern__field">
              <span>Gerekce</span>
              <input
                value={financialConfirm.reason}
                onChange={(event) => setFinancialConfirm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="En az 3 karakter"
              />
            </label>
            <div className="pos-inline-actions">
              <button type="button" onClick={() => setFinancialConfirm({ title: "", message: "", reason: "", onConfirm: null })}>Vazgec</button>
              <button
                className="primary"
                type="button"
                disabled={financialConfirm.reason.trim().length < 3}
                onClick={() =>
                  void (async () => {
                    const fn = financialConfirm.onConfirm;
                    const reason = financialConfirm.reason.trim();
                    setFinancialConfirm({ title: "", message: "", reason: "", onConfirm: null });
                    if (fn) await fn(reason);
                  })()
                }
              >
                Onayla
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmState.onConfirm ? (
        <div className="pos-confirm-backdrop" onClick={() => setConfirmState({ title: "", message: "", onConfirm: null })}>
          <div className="pos-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>{confirmState.title}</h3>
            <p>{confirmState.message}</p>
            <div className="pos-inline-actions">
              <button type="button" onClick={() => setConfirmState({ title: "", message: "", onConfirm: null })}>Vazgec</button>
              <button
                className="primary"
                type="button"
                onClick={() =>
                  void (async () => {
                    const fn = confirmState.onConfirm;
                    setConfirmState({ title: "", message: "", onConfirm: null });
                    if (fn) await fn();
                  })()
                }
              >
                Onayla
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
