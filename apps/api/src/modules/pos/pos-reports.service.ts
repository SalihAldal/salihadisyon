import { BadRequestException, Injectable } from "@nestjs/common";
import { toCsv } from "../../common/utils/csv";
import { PrismaService } from "../../common/database/prisma.service";
import { aggregatePaymentMethods, buildCategoryDistribution, sumRefundAmount, sumTicketDiscount, sumTicketRevenue } from "../../common/reporting/accounting.utils";

type PosActor = { tenantId: string; userId: string; branchIds: string[]; terminalId?: string | null; permissions?: string[] };

@Injectable()
export class PosReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(actor: PosActor, query?: { branchId?: string; dateFrom?: string; dateTo?: string }) {
    const branchIds = this.resolveBranchIds(actor, query?.branchId);
    const range = this.resolveDateRange(query?.dateFrom, query?.dateTo);

    const [paidTickets, cancelledTickets, refundRequests] = await Promise.all([
      this.prisma.ticket.findMany({
        where: {
          companyId: actor.tenantId,
          branchId: { in: branchIds },
          status: "PAID",
          closedAt: { gte: range.start, lte: range.end },
        },
        include: {
          payments: true,
          items: {
            include: {
              product: {
                include: { category: true },
              },
            },
          },
        },
        orderBy: { closedAt: "desc" },
      }),
      this.prisma.ticket.findMany({
        where: {
          companyId: actor.tenantId,
          branchId: { in: branchIds },
          status: { in: ["VOIDED", "CANCELLED"] },
          closedAt: { gte: range.start, lte: range.end },
        },
        orderBy: { closedAt: "desc" },
      }),
      this.prisma.refundRequest.findMany({
        where: {
          companyId: actor.tenantId,
          branchId: { in: branchIds },
          createdAt: { gte: range.start, lte: range.end },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalSales = sumTicketRevenue(paidTickets);
    const totalProductQuantity = paidTickets.reduce(
      (sum, ticket) => sum + ticket.items.reduce((itemSum, item) => itemSum + Number(item.quantity), 0),
      0,
    );
    const totalDiscount = sumTicketDiscount(paidTickets);
    const cancelTotal = sumTicketRevenue(cancelledTickets);
    const completedRefunds = refundRequests.filter((refund) => refund.status === "completed");
    const refundTotal = sumRefundAmount(completedRefunds);
    const paymentBreakdown = [...aggregatePaymentMethods(paidTickets.flatMap((ticket) => ticket.payments.filter((payment) => payment.status === "COMPLETED"))).values()]
      .map((row) => ({
        method: row.method,
        amount: row.amount,
        ratio: totalSales > 0 ? (row.amount / totalSales) * 100 : 0,
      }))
      .sort((left, right) => right.amount - left.amount);
    const categorySales = buildCategoryDistribution(paidTickets)
      .map((row) => ({
        categoryName: row.categoryName,
        quantity: row.quantity,
        revenue: row.revenue,
        grossRevenue: row.grossRevenue,
        discount: row.discount,
        tax: row.tax,
      }))
      .sort((left, right) => right.revenue - left.revenue);

    return {
      filters: {
        branchId: query?.branchId ?? null,
        dateFrom: range.start.toISOString(),
        dateTo: range.end.toISOString(),
      },
      cards: [
        { key: "sales", label: "Toplam Satis", value: totalSales, helper: "PAID adisyonlar", tone: "success" },
        { key: "quantity", label: "Toplam Urun Adedi", value: totalProductQuantity, helper: "Satilan toplam miktar", tone: "info" },
        { key: "discount", label: "Indirim", value: totalDiscount, helper: "Adisyon indirim toplami", tone: "warning" },
        { key: "cancel_refund", label: "Iptal / Iade", value: cancelTotal + refundTotal, helper: "Void/cancel + refund", tone: "danger" },
      ],
      totals: {
        totalSales,
        totalProductQuantity,
        totalDiscount,
        cancelTotal,
        refundTotal,
      },
      paymentBreakdown,
      categorySales,
      cancelRefundSummary: {
        cancelledTicketCount: cancelledTickets.length,
        cancelledAmount: cancelTotal,
        refundCount: completedRefunds.length,
        refundAmount: refundTotal,
      },
    };
  }

  async exportSummary(actor: PosActor, query?: { branchId?: string; dateFrom?: string; dateTo?: string }) {
    const summary = await this.getSummary(actor, query);
    const headers = ["Bolum", "Anahtar", "Deger", "Aciklama"];
    const rows: Array<Array<string | number>> = [
      ["Genel", "Toplam Satis", summary.totals.totalSales, "PAID adisyonlar"],
      ["Genel", "Toplam Urun Adedi", summary.totals.totalProductQuantity, "Satilan toplam miktar"],
      ["Genel", "Indirim", summary.totals.totalDiscount, "Toplam indirim"],
      ["Genel", "Iptal Tutar", summary.totals.cancelTotal, "VOIDED/CANCELLED"],
      ["Genel", "Iade Tutar", summary.totals.refundTotal, "Refund request"],
      ...summary.paymentBreakdown.map((item: { method: string; amount: number; ratio: number }) => [
        "Odeme Dagilimi",
        item.method,
        item.amount,
        `${item.ratio.toFixed(2)}%`,
      ]),
      ...summary.categorySales.map((item: { categoryName: string; quantity: number; revenue: number }) => [
        "Kategori",
        item.categoryName,
        item.revenue,
        `Adet: ${item.quantity}`,
      ]),
    ];
    return toCsv(headers, rows);
  }

  private resolveBranchIds(actor: PosActor, branchId?: string) {
    if (!branchId) {
      return actor.branchIds;
    }
    if (!actor.branchIds.includes(branchId)) {
      throw new BadRequestException("Bu sube icin rapor erisim yetkin yok.");
    }
    return [branchId];
  }

  private resolveDateRange(dateFrom?: string, dateTo?: string) {
    const end = dateTo ? new Date(dateTo) : new Date();
    const start = dateFrom ? new Date(dateFrom) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
}
