import { describe, expect, it, vi } from "vitest";
import { PosRegisterService } from "./pos-register.service";

const actor = {
  tenantId: "tenant-1",
  userId: "user-1",
  branchIds: ["branch-1"],
};

function createService() {
  const tx = {
    registerClosing: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    registerTransaction: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    cashDenomination: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    expense: {
      create: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) => callback(tx)),
    terminal: {
      findFirst: vi.fn(),
    },
  };

  const auditLogService = {
    create: vi.fn(),
  };
  const posGateway = {
    emitToBranch: vi.fn(),
  };

  return {
    service: new PosRegisterService(prisma as any, auditLogService as any, posGateway as any),
    prisma,
    tx,
    auditLogService,
  };
}

describe("PosRegisterService", () => {
  it("register closing akisini beklenen kasa farki ile tamamlar", async () => {
    const { service, tx, auditLogService } = createService();
    const createdAt = new Date("2026-03-19T10:00:00.000Z");
    const closedAt = new Date("2026-03-19T18:00:00.000Z");

    tx.registerClosing.findFirst.mockResolvedValue({
      id: "closing-1",
      branchId: "branch-1",
      userId: "user-1",
      terminalId: null,
      openingCash: 100,
      isOpen: true,
      createdAt,
    });
    tx.registerTransaction.findMany.mockResolvedValue([
      { type: "sale", paymentType: "cash", amount: 50 },
      { type: "sale", paymentType: "card", amount: 20 },
      { type: "expense", paymentType: "cash", amount: 10 },
      { type: "refund", paymentType: "cash", amount: 5 },
    ]);
    tx.registerClosing.updateMany.mockResolvedValue({ count: 1 });
    tx.registerClosing.findUniqueOrThrow.mockResolvedValue({
      id: "closing-1",
      branchId: "branch-1",
      userId: "user-1",
      terminalId: null,
      openingCash: 100,
      expectedCash: 135,
      countedCash: 130,
      difference: -5,
      isOpen: false,
      createdAt,
      closedAt,
      paymentBreakdown: {
        cash: 50,
        card: 20,
        mobile: 0,
      },
      denominations: [
        { denomination: 100, quantity: 1, total: 100 },
        { denomination: 10, quantity: 3, total: 30 },
      ],
      transactions: [],
    });

    const result = await service.closeRegister(
      {
        countedCash: 130,
        denominations: [
          { denomination: 100, quantity: 1 },
          { denomination: 10, quantity: 3 },
        ],
      },
      actor,
    );

    expect(result.summary).toMatchObject({
      openingCash: 100,
      expectedCash: 135,
      countedCash: 130,
      difference: -5,
      transactionCount: 4,
      paymentBreakdown: {
        cash: 50,
        card: 20,
        mobile: 0,
      },
    });
    expect(tx.cashDenomination.deleteMany).toHaveBeenCalledWith({
      where: { closingId: "closing-1" },
    });
    expect(tx.cashDenomination.createMany).toHaveBeenCalled();
    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "register.close",
        entityId: "closing-1",
      }),
    );
  });

  it("expense flow icin gider ve register transaction kaydi olusturur", async () => {
    const { service, tx, auditLogService } = createService();
    const expenseDate = "2026-03-19T12:00:00.000Z";

    tx.registerClosing.findFirst.mockResolvedValue({
      id: "closing-1",
      branchId: "branch-1",
      userId: "user-1",
      terminalId: null,
      openingCash: 100,
      isOpen: true,
      createdAt: new Date("2026-03-19T09:00:00.000Z"),
    });
    tx.expense.create.mockResolvedValue({
      id: "expense-1",
      branchId: "branch-1",
      userId: "user-1",
      title: "Market",
      description: "Anlik alim",
      amount: 45.5,
      category: "office",
      expenseDate: new Date(expenseDate),
    });
    tx.registerTransaction.create.mockResolvedValue({
      id: "rtx-1",
      closingId: "closing-1",
      type: "expense",
      paymentType: "cash",
      amount: 45.5,
    });

    const result = await service.createExpense(
      {
        title: "Market",
        description: "Anlik alim",
        category: "office",
        amount: 45.5,
        paymentType: "cash",
        expenseDate,
      },
      actor,
    );

    expect(tx.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Market",
          description: "Anlik alim",
          amount: 45.5,
        }),
      }),
    );
    expect(tx.registerTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "expense",
          paymentType: "cash",
          amount: 45.5,
        }),
      }),
    );
    expect(result).toMatchObject({
      expense: expect.objectContaining({ id: "expense-1" }),
      registerTransaction: expect.objectContaining({ id: "rtx-1" }),
      closingId: "closing-1",
    });
    expect(auditLogService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense.create",
        entityId: "expense-1",
      }),
    );
  });
});
