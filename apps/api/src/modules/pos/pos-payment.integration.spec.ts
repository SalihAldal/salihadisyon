import { describe, expect, it, vi } from "vitest";
import { PosRegisterService } from "./pos-register.service";
import { PosService } from "./pos.service";

describe("Pos ödeme integration", () => {
  it("tam odemede servisler DI zinciriyle birlikte calisir", async () => {
    const txState = {
      payments: [] as Array<Record<string, unknown>>,
      ticketStatus: "OPEN",
      closedAt: null as Date | null,
    };

    const ticketBase = {
      id: "ticket-1",
      companyId: "tenant-1",
      branchId: "branch-1",
      tableId: null,
      status: "OPEN",
      grandTotal: 90,
      subtotal: 90,
      discountTotal: 0,
      taxTotal: 0,
      items: [],
      payments: [],
      customer: null,
      table: null,
    };

    const tx = {
      ticket: {
        findUnique: vi.fn(async () => ({
          ...ticketBase,
          status: txState.ticketStatus,
          closedAt: txState.closedAt,
          payments: [...txState.payments],
        })),
        update: vi.fn(async ({ data }: { data: { status: string; closedAt: Date | null } }) => {
          txState.ticketStatus = data.status;
          txState.closedAt = data.closedAt;
          return {
            ...ticketBase,
            status: txState.ticketStatus,
            closedAt: txState.closedAt,
            payments: [...txState.payments],
          };
        }),
      },
      payment: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `payment-${txState.payments.length + 1}`, ...data };
          txState.payments.push(row);
          return row;
        }),
        findMany: vi.fn(async () => [...txState.payments]),
      },
      ticketEvent: {
        create: vi.fn(),
      },
      diningTable: {
        update: vi.fn(),
      },
    };

    const prisma = {
      $transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) => callback(tx)),
      ticket: {
        findUnique: vi.fn(async () => ({
          ...ticketBase,
          status: txState.ticketStatus,
          closedAt: txState.closedAt,
          payments: [...txState.payments],
          customer: null,
          table: null,
          items: [],
        })),
      },
    };

    const auditLogService = { create: vi.fn() };
    const inventoryConsumptionService = {
      validateTicketSaleAvailability: vi.fn().mockResolvedValue({ success: true }),
      applySaleConsumptionWithinTransaction: vi.fn().mockResolvedValue({
        entryCount: 1,
        inventoryItemCount: 1,
        theoreticalCost: 22,
      }),
    };
    const posGateway = { emitToTicket: vi.fn(), emitToBranch: vi.fn() };
    const posIntegrationsService = { startSale: vi.fn().mockResolvedValue({ success: true }) };
    const registerService = new PosRegisterService(prisma as any, auditLogService as any);
    const service = new PosService(
      prisma as any,
      auditLogService as any,
      inventoryConsumptionService as any,
      posGateway as any,
      posIntegrationsService as any,
      {} as any,
      registerService,
      {} as any,
    );

    vi.spyOn(registerService, "ensureActiveRegisterSession").mockResolvedValue({
      id: "closing-1",
    } as any);
    vi.spyOn(registerService, "recordSalePaymentsWithinTransaction").mockResolvedValue({
      closingId: "closing-1",
      totals: { cash: 90, card: 0, mobile: 0 },
      transactions: [{ id: "trx-1" }],
    });

    const result = await service.collectPayment(
      {
        ticketId: "ticket-1",
        splits: [{ method: "CASH", amount: 90 }],
      },
      {
        tenantId: "tenant-1",
        userId: "user-1",
        branchIds: ["branch-1"],
      },
    );

    expect(result.ticket.status).toBe("PAID");
    expect(result.totalPaid).toBe(90);
    expect(registerService.ensureActiveRegisterSession).toHaveBeenCalled();
    expect(registerService.recordSalePaymentsWithinTransaction).toHaveBeenCalled();
  });
});
