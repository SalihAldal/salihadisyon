const RECEIPT_LINE_WIDTH = 38;

function centerText(value: string, width = RECEIPT_LINE_WIDTH) {
  const trimmed = value.trim();
  if (trimmed.length >= width) return trimmed.slice(0, width);
  const padding = Math.max(Math.floor((width - trimmed.length) / 2), 0);
  return `${" ".repeat(padding)}${trimmed}`;
}

function receiptRow(label: string, amount: string) {
  const safeLabel = label.slice(0, RECEIPT_LINE_WIDTH - amount.length - 1);
  const spaces = Math.max(RECEIPT_LINE_WIDTH - safeLabel.length - amount.length, 1);
  return `${safeLabel}${" ".repeat(spaces)}${amount}`;
}

function splitLines(value: string, width = RECEIPT_LINE_WIDTH) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [value.slice(0, width)];
}

export type PrintTemplateContext = {
  businessName?: string;
  branchName?: string;
  tableLabel?: string;
  ticketLabel?: string;
  destinationName: string;
  destinationCode: string;
  printerName?: string;
  openedAt?: string | Date | null;
  closedAt?: string | Date | null;
  isCashRegister?: boolean;
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  payments?: Array<{ method: string; amount: number }>;
};

export type PrintTemplateItem = {
  productName: string;
  quantity: number;
  lineTotal?: number;
  notes?: string | null;
  detailLines?: string[];
};

function formatDate(value?: string | Date | null) {
  if (!value) return new Date().toLocaleString("tr-TR");
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString("tr-TR");
  return parsed.toLocaleString("tr-TR");
}

function formatMoney(value?: number) {
  return Number(value ?? 0).toFixed(2);
}

export function buildProductionSlipContent(items: PrintTemplateItem[], context: PrintTemplateContext) {
  const separator = "=".repeat(RECEIPT_LINE_WIDTH);
  const lines: string[] = [];
  lines.push(centerText(context.businessName ?? "ADISYON SISTEMI"));
  lines.push(centerText(`${context.destinationName} SIPARIS FISI`));
  lines.push(separator);
  lines.push(`Tarih : ${formatDate(context.openedAt ?? context.closedAt)}`);
  lines.push(`Sube  : ${context.branchName ?? "-"}`);
  lines.push(`Masa  : ${context.tableLabel ?? "-"}`);
  lines.push(`Adisyon: ${context.ticketLabel ?? "-"}`);
  lines.push(`Yazici: ${context.printerName ?? "-"}`);
  lines.push(separator);
  if (!items.length) {
    lines.push("Urun bulunamadi");
  } else {
    for (const item of items) {
      lines.push(`${Number(item.quantity)} x ${item.productName}`);
      for (const detail of item.detailLines ?? []) {
        lines.push(`  - ${detail}`);
      }
      if (item.notes?.trim()) {
        lines.push(`  Not: ${item.notes.trim()}`);
      }
    }
  }
  lines.push(separator);
  return lines.join("\n");
}

export function buildCashRegisterSlipContent(items: PrintTemplateItem[], context: PrintTemplateContext) {
  const separator = "=".repeat(RECEIPT_LINE_WIDTH);
  const lines: string[] = [];
  lines.push(centerText(context.businessName ?? "ADISYON SISTEMI"));
  lines.push(centerText("KASA FISI"));
  lines.push(separator);
  lines.push(`Tarih : ${formatDate(context.closedAt ?? context.openedAt)}`);
  lines.push(`Sube  : ${context.branchName ?? "-"}`);
  lines.push(`Masa  : ${context.tableLabel ?? "-"}`);
  lines.push(`Adisyon: ${context.ticketLabel ?? "-"}`);
  lines.push(separator);
  for (const item of items) {
    const lineTotal = formatMoney(item.lineTotal);
    lines.push(receiptRow(`${Number(item.quantity)} x ${item.productName}`, lineTotal));
    for (const detail of item.detailLines ?? []) {
      lines.push(`  - ${detail}`);
    }
    if (item.notes?.trim()) {
      lines.push(`  Not: ${item.notes.trim()}`);
    }
  }
  lines.push(separator);
  if (context.subtotal != null) lines.push(receiptRow("Ara Toplam", formatMoney(context.subtotal)));
  if (Number(context.discountTotal ?? 0) > 0) {
    lines.push(receiptRow("Indirim", `-${formatMoney(context.discountTotal)}`));
  }
  if (Number(context.taxTotal ?? 0) > 0) {
    lines.push(receiptRow("Vergi", formatMoney(context.taxTotal)));
  }
  lines.push(receiptRow("TOPLAM", formatMoney(context.grandTotal)));
  if ((context.payments ?? []).length) {
    lines.push(separator);
    for (const payment of context.payments ?? []) {
      lines.push(receiptRow(String(payment.method), formatMoney(payment.amount)));
    }
  }
  lines.push(centerText("Tesekkurler"));
  lines.push(separator);
  return lines.join("\n");
}

export function buildPrinterTestContent(context: {
  slipName: string;
  printerName: string;
  branchName?: string;
  destinationName?: string;
}) {
  const separator = "=".repeat(RECEIPT_LINE_WIDTH);
  const lines = [
    separator,
    centerText("ADISYON SISTEMI"),
    centerText("YAZICI TESTI"),
    separator,
    "",
    `Fis     : ${context.slipName}`,
    `Yazici  : ${context.printerName}`,
    context.destinationName ? `Fislik  : ${context.destinationName}` : "",
    context.branchName ? `Sube    : ${context.branchName}` : "",
    "",
    "Test basarili.",
    "",
    `Tarih/Saat: ${formatDate(new Date())}`,
    "",
    separator,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildSlipContent(
  items: PrintTemplateItem[],
  context: PrintTemplateContext,
) {
  if (context.isCashRegister || context.destinationCode.toUpperCase() === "KASA") {
    return buildCashRegisterSlipContent(items, context);
  }
  return buildProductionSlipContent(items, context);
}

export function splitReceiptLines(value: string, width = RECEIPT_LINE_WIDTH) {
  return splitLines(value, width);
}
