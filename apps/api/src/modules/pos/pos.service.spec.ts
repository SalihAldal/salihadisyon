import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PosService } from "./pos.service";

const actor = {
  tenantId: "tenant-1",
  userId: "user-1",
  branchIds: ["branch-1"],
  terminalId: null,
};

const waiterActor = {
  ...actor,
  role: "waiter",
};

const garsonActor = {
  ...actor,
  role: "garson",
};

function createService() {
  const liveTicket = {
    id: "ticket-1",
    companyId: "tenant-1",
    branchId: "branch-1",
    tableId: "table-1",
    status: "OPEN",
    grandTotal: 100,
    subtotal: 100,
    discountTotal: 0,
    taxTotal: 0,
    customer: null,
    table: { id: "table-1", name: "Masa 1" },
    items: [],
    payments: [],
  };

  const txState = {
    payments: [] as Array<Record<string, unknown>>,
    refunds: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    ticketStatus: "OPEN",
    closedAt: null as Date | null,
  };

  const tx = {
    ticket: {
      findUnique: vi.fn(async () => ({
        ...liveTicket,
        status: txState.ticketStatus,
        closedAt: txState.closedAt,
        payments: [...txState.payments],
      })),
      update: vi.fn(async ({ data }: { data: { status: string; closedAt: Date | null } }) => {
        txState.ticketStatus = data.status;
        txState.closedAt = data.closedAt;
        return {
          ...liveTicket,
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
    refundRequest: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => [...txState.refunds]),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `refund-${txState.refunds.length + 1}`, ...data };
        txState.refunds.push(row);
        return row;
      }),
    },
    ticketEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        txState.events.push(data);
        return data;
      }),
    },
    diningTable: {
      update: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) => callback(tx)),
    ticket: {
      findUnique: vi.fn(async () => ({
        ...liveTicket,
        status: txState.ticketStatus,
        closedAt: txState.closedAt,
        payments: [...txState.payments],
        customer: null,
        table: { id: "table-1", name: "Masa 1" },
        items: [],
      })),
    },
    ticketDiscount: {
      findMany: vi.fn(async () => []),
    },
  };

  const auditLogService = {
    create: vi.fn(),
  };
  const inventoryConsumptionService = {
    validateTicketSaleAvailability: vi.fn().mockResolvedValue({ success: true }),
    applySaleConsumptionWithinTransaction: vi.fn().mockResolvedValue({
      entryCount: 2,
      inventoryItemCount: 1,
      theoreticalCost: 32,
    }),
    reverseSaleConsumptionWithinTransaction: vi.fn().mockResolvedValue({
      entryCount: 2,
      inventoryItemCount: 1,
      theoreticalCost: 32,
    }),
  };
  const posGateway = {
    emitToTicket: vi.fn(),
    emitToBranch: vi.fn(),
  };
  const posIntegrationsService = {
    startSale: vi.fn().mockResolvedValue({ success: true, status: "success" }),
    startRefund: vi.fn().mockResolvedValue({ success: true, status: "success" }),
  };
  const posAdminService = {};
  const posRegisterService = {
    ensureActiveRegisterSession: vi.fn().mockResolvedValue({ id: "closing-1" }),
    recordSalePaymentsWithinTransaction: vi.fn().mockResolvedValue({
      closingId: "closing-1",
      totals: { cash: 100, card: 0, mobile: 0 },
      transactions: [{ id: "rtx-sale-1" }],
    }),
    recordRefundWithinTransaction: vi.fn().mockResolvedValue({
      closingId: "closing-1",
      totals: { cash: -100, card: 0, mobile: 0 },
      transaction: { id: "rtx-refund-1" },
    }),
  };
  const posReportsService = {};

  return {
    service: new PosService(
      prisma as any,
      auditLogService as any,
      inventoryConsumptionService as any,
      posGateway as any,
      posIntegrationsService as any,
      posAdminService as any,
      posRegisterService as any,
      posReportsService as any,
    ),
    prisma,
    tx,
    txState,
    auditLogService,
    inventoryConsumptionService,
    posGateway,
    posRegisterService,
  };
}

describe("PosService", () => {
  it("waiter rolunde odeme alma islemini backend seviyesinde engeller", async () => {
    const { service } = createService();

    await expect(
      service.collectPayment(
        {
          ticketId: "ticket-1",
          splits: [{ method: "CASH", amount: 100 }],
        },
        waiterActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde urun satiri guncellemeyi backend seviyesinde engeller", async () => {
    const { service } = createService();

    await expect(
      service.updateItem(
        "ticket-1",
        "item-1",
        {
          quantity: 2,
        },
        waiterActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde urun satiri silmeyi backend seviyesinde engeller", async () => {
    const { service } = createService();

    await expect(service.removeItem("ticket-1", "item-1", waiterActor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("garson rolunde odeme alma islemini backend seviyesinde engeller", async () => {
    const { service } = createService();

    await expect(
      service.collectPayment(
        {
          ticketId: "ticket-1",
          splits: [{ method: "CASH", amount: 100 }],
        },
        garsonActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde indirim islemini backend seviyesinde engeller", async () => {
    const { service } = createService();
    await expect(
      service.applyDiscount(
        "ticket-1",
        { discountType: "fixed", label: "Test", amount: 10, reason: "Test indirimi" },
        waiterActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde adisyon bolme islemini backend seviyesinde engeller", async () => {
    const { service } = createService();
    await expect(
      service.splitTicket(
        "ticket-1",
        { items: [{ itemId: "item-1", quantity: 1 }] },
        waiterActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde masa tasima islemini backend seviyesinde engeller", async () => {
    const { service } = createService();
    await expect(
      service.transferTicket("ticket-1", { tableId: "table-2" }, waiterActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde adisyon birlestirme islemini backend seviyesinde engeller", async () => {
    const { service } = createService();
    await expect(
      service.mergeTickets({ sourceTicketId: "ticket-1", targetTicketId: "ticket-2" }, waiterActor, "ticket-2"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde adisyon iptal islemini backend seviyesinde engeller", async () => {
    const { service } = createService();
    await expect(service.voidTicket("ticket-1", { reason: "Musteri vazgecti" }, waiterActor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("waiter rolunde kasa acilis islemini backend seviyesinde engeller", async () => {
    const { service, posRegisterService } = createService();
    await expect(
      service.openRegister({ branchId: "branch-1", openingCash: 100 }, waiterActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(posRegisterService.ensureActiveRegisterSession).not.toHaveBeenCalled();
  });

  it("payment flow tam odemede ticket, register ve stock zincirini tamamlar", async () => {
    const { service, txState, inventoryConsumptionService, posRegisterService, auditLogService, posGateway, tx } = createService();

    const result = await service.collectPayment(
      {
        ticketId: "ticket-1",
        splits: [{ method: "CASH", amount: 100 }],
      },
      actor,
    );

    expect(result.ticket.status).toBe("PAID");
    expect(result.totalPaid).toBe(100);
    expect(result.remainingAmount).toBe(0);
    expect(inventoryConsumptionService.validateTicketSaleAvailability).toHaveBeenCalledWith("ticket-1", actor);
    expect(inventoryConsumptionService.applySaleConsumptionWithinTransaction).toHaveBeenCalledWith(tx, "ticket-1", actor);
    expect(posRegisterService.recordSalePaymentsWithinTransaction).toHaveBeenCalled();
    expect(tx.diningTable.update).toHaveBeenCalledWith({
      where: { id: "table-1" },
      data: {
        status: "AVAILABLE",
        activeTicketId: null,
      },
    });
    expect(txState.payments).toHaveLength(1);
    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment.collect",
        entityId: "ticket-1",
      }),
    );
    expect(posGateway.emitToTicket).toHaveBeenCalled();
  });

  it("refund flow tam iadede register ve stock reversal zincirini tamamlar", async () => {
    const { service, txState, inventoryConsumptionService, posRegisterService, auditLogService, posGateway } = createService();
    txState.ticketStatus = "PAID";
    txState.payments.push({
      id: "payment-1",
      ticketId: "ticket-1",
      method: "CASH",
      status: "COMPLETED",
      amount: 100,
    });

    const refund = await service.requestRefund(
      "ticket-1",
      {
        amount: 100,
        reason: "Musteri memnuniyetsizligi",
      },
      actor,
    );

    expect(refund).toMatchObject({
      id: "refund-1",
      ticketId: "ticket-1",
      amount: 100,
      status: "completed",
    });
    expect(posRegisterService.recordRefundWithinTransaction).toHaveBeenCalled();
    expect(inventoryConsumptionService.reverseSaleConsumptionWithinTransaction).toHaveBeenCalledWith(
      expect.anything(),
      "ticket-1",
      actor,
      "refund",
      "Musteri memnuniyetsizligi",
    );
    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ticket.refund",
      }),
    );
    expect(posGateway.emitToBranch).toHaveBeenCalledWith(
      "branch-1",
      "refund.requested",
      expect.objectContaining({
        ticketId: "ticket-1",
        amount: 100,
      }),
    );
  });
});
