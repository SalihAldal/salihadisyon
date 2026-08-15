import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PosReportsService } from "./pos-reports.service";

function createService() {
  const prisma = {
    ticket: {
      findMany: vi.fn(),
    },
    refundRequest: {
      findMany: vi.fn(),
    },
  };

  return {
    service: new PosReportsService(prisma as any),
    prisma,
  };
}

describe("PosReportsService", () => {
  it("refund sayisini tamamlanan iade kayitlari ile hizalar", async () => {
    const { service, prisma } = createService();

    prisma.ticket.findMany
      .mockResolvedValueOnce([
        {
          grandTotal: 100,
          discountTotal: 0,
          payments: [{ method: "CASH", amount: 100, status: "COMPLETED" }],
          items: [],
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.refundRequest.findMany.mockResolvedValue([
      { amount: 10, status: "completed" },
      { amount: 5, status: "requested" },
    ]);

    const summary = await service.getSummary({
      tenantId: "tenant-1",
      userId: "user-1",
      branchIds: ["branch-1"],
    });

    expect(summary.cancelRefundSummary.refundCount).toBe(1);
    expect(summary.cancelRefundSummary.refundAmount).toBe(10);
  });

  it("yetkisiz sube filtresinde sessiz fallback yerine hata firlatir", async () => {
    const { service } = createService();

    await expect(
      service.getSummary(
        {
          tenantId: "tenant-1",
          userId: "user-1",
          branchIds: ["branch-1"],
        },
        { branchId: "branch-2" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
