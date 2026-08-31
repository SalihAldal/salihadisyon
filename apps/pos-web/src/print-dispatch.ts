import { posApi } from "./api";
import { createPrintBatchId, sendToLocalPrintBridge } from "./print-bridge-client";

type RoutingPrintResult = {
  destinationCode?: string;
  destinationName?: string;
  jobId?: string;
  printerName?: string;
  content?: string;
  status?: string;
  skipped?: boolean;
  requiresLocalPrint?: boolean;
  error?: string;
};

const inFlightBatches = new Set<string>();
const inFlightTriggers = new Set<string>();

export async function dispatchTicketRoutingPrint(input: {
  accessToken: string;
  ticketId: string;
  trigger: "production" | "receipt";
  printBatchId?: string;
}) {
  const triggerLock = `${input.ticketId}:${input.trigger}`;
  if (inFlightTriggers.has(triggerLock)) {
    return { printBatchId: input.printBatchId ?? "", results: [], duplicate: true as const };
  }
  const printBatchId = input.printBatchId ?? createPrintBatchId();
  if (inFlightBatches.has(printBatchId)) {
    return { printBatchId, results: [], duplicate: true as const };
  }
  inFlightBatches.add(printBatchId);
  inFlightTriggers.add(triggerLock);
  try {
    const response = (await posApi.dispatchTicketPrintRouting(input.accessToken, input.ticketId, {
      trigger: input.trigger,
      printBatchId,
    })) as { results?: RoutingPrintResult[] };
    const results = response.results ?? [];

    for (const result of results) {
      if (result.skipped) continue;
      if (!result.jobId || !result.printerName || !result.content) continue;
      if (result.requiresLocalPrint || result.status === "queued") {
        try {
          await sendToLocalPrintBridge({
            printerName: result.printerName,
            content: result.content,
          });
          await posApi.acknowledgePrintJob(input.accessToken, result.jobId, { status: "sent" });
          result.status = "sent";
        } catch (error) {
          await posApi.acknowledgePrintJob(input.accessToken, result.jobId, {
            status: "failed",
            error: error instanceof Error ? error.message : "bridge_print_failed",
          });
          result.status = "failed";
          result.error = error instanceof Error ? error.message : "bridge_print_failed";
        }
      }
    }

    return { printBatchId, results, duplicate: false as const };
  } finally {
    inFlightBatches.delete(printBatchId);
    inFlightTriggers.delete(triggerLock);
  }
}
