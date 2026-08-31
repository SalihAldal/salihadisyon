const DEFAULT_BRIDGE_URL = "http://127.0.0.1:9247";
const DEFAULT_BRIDGE_TOKEN = "dev-bridge-token";

export type PrintBridgeStatus = "online" | "offline" | "unknown" | "unavailable";

export function getPrintBridgeConfig() {
  const env = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  return {
    baseUrl: env.env?.VITE_PRINT_BRIDGE_URL ?? DEFAULT_BRIDGE_URL,
    token: env.env?.VITE_PRINT_BRIDGE_TOKEN ?? DEFAULT_BRIDGE_TOKEN,
  };
}

export async function probePrintBridgeHealth() {
  const { baseUrl, token } = getPrintBridgeConfig();
  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { reachable: false as const, status: "unavailable" as PrintBridgeStatus };
    return { reachable: true as const, status: "online" as PrintBridgeStatus };
  } catch {
    return { reachable: false as const, status: "unknown" as PrintBridgeStatus };
  }
}

export async function sendToLocalPrintBridge(input: { printerName: string; content: string }) {
  const { baseUrl, token } = getPrintBridgeConfig();
  const response = await fetch(`${baseUrl}/print`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      printerName: input.printerName,
      content: input.content,
    }),
  });
  const payload = (await response.json()) as { error?: string; success?: boolean; status?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Print bridge error (${response.status})`);
  }
  return payload;
}

export async function getLocalPrinterStatus(printerName: string) {
  const { baseUrl, token } = getPrintBridgeConfig();
  const response = await fetch(`${baseUrl}/printers/${encodeURIComponent(printerName)}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    return { found: false, status: "unavailable" as PrintBridgeStatus };
  }
  return (await response.json()) as { found: boolean; status: PrintBridgeStatus; printerName: string };
}

export function createPrintBatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
