import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import {
  aggregatePaymentMethods,
  buildCategoryDistribution,
  roundCurrency,
  sumRefundAmount,
  sumTicketDiscount,
  sumTicketRevenue,
  summarizeRegisterTransactions,
} from "../../common/reporting/accounting.utils";
import { toCsv } from "../../common/utils/csv";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { GoalProgressService } from "../staff/goal-progress.service";
import { BranchRevenueQueryDto } from "./dto/branch-revenue-query.dto";
import { ReportQueryDto } from "./dto/report-query.dto";
import { RevenueQueryDto } from "./dto/revenue-query.dto";
import type { ReportResource } from "./reports.resources";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalProgressService: GoalProgressService,
  ) {}

  async getCatalog(actor: AuthenticatedUser) {
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: actor.branchIds } },
      orderBy: { name: "asc" },
    });

    return {
      reports: [
        { key: "sales-reports", title: "Satis Raporlari", description: "Ciro, fis, kanal ve sube kirilimlari" },
        { key: "payment-method-reports", title: "Odeme Tipi Raporlari", description: "Odeme dagilimi, tutar ve islem adedi" },
        { key: "expense-reports", title: "Gider Raporlari", description: "Sabit, operasyonel ve personel gider analizi" },
        { key: "cash-closure-reports", title: "Kasa Kapanis Raporlari", description: "Kasa farklari ve kapanis performansi" },
        { key: "discount-reports", title: "Indirim Raporlari", description: "Iskonto kullanimi ve satisa etkisi" },
        { key: "product-reports", title: "Urun Raporlari", description: "Urun satis, miktar ve performans analizi" },
        { key: "profitability-reports", title: "Maliyet & Karlilik", description: "Recete maliyeti, brut ve net kar takibi" },
        { key: "stock-reports", title: "Stok Raporlari", description: "Stok hareketi, kritik stok ve depo karsilastirmasi" },
        { key: "consumption-reports", title: "Hammadde Tuketim Raporlari", description: "Satisa bagli hammadde tuketimi ve maliyet etkisi" },
        { key: "finance-reports", title: "Finans Raporlari", description: "Tahsilat, gider, net akim ve hesap bazli analiz" },
        { key: "employee-reports", title: "Calisan Raporlari", description: "Mesai, gec kalma, fazla mesai ve hedef takibi" },
        { key: "shift-reports", title: "Mesai Raporlari", description: "Vardiya, gec kalma ve fazla mesai trendi" },
        { key: "goal-bonus-reports", title: "Hedef & Prim Raporlari", description: "Hedef ilerlemesi, prim hak edisi ve onay durumu" },
      ],
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  async getReport(report: ReportResource, query: ReportQueryDto, actor: AuthenticatedUser) {
    switch (report) {
      case "sales-reports":
        return this.getSalesReport(query, actor);
      case "payment-method-reports":
        return this.getPaymentMethodReport(query, actor);
      case "expense-reports":
        return this.getExpenseReport(query, actor);
      case "cash-closure-reports":
        return this.getCashClosureReport(query, actor);
      case "discount-reports":
        return this.getDiscountReport(query, actor);
      case "product-reports":
        return this.getProductReport(query, actor);
      case "profitability-reports":
        return this.getProfitabilityReport(query, actor);
      case "stock-reports":
        return this.getStockReport(query, actor);
      case "consumption-reports":
        return this.getConsumptionReport(query, actor);
      case "finance-reports":
        return this.getFinanceReport(query, actor);
      case "employee-reports":
        return this.getEmployeeReport(query, actor);
      case "shift-reports":
        return this.getShiftReport(query, actor);
      case "goal-bonus-reports":
        return this.getGoalBonusReport(query, actor);
      default:
        throw new ForbiddenException("Desteklenmeyen rapor tipi.");
    }
  }

  async exportReport(report: ReportResource, query: ReportQueryDto, actor: AuthenticatedUser) {
    const result = await this.getReport(report, query, actor);
    return toCsv(
      result.tableColumns.map((column: { label: string }) => column.label),
      result.table.map((row: Record<string, unknown>) =>
        result.tableColumns.map((column: { key: string }) => {
          const value = this.getValueByPath(row, column.key);
          return typeof value === "object" && value !== null ? JSON.stringify(value) : (value as string | number | null | undefined);
        }),
      ),
    );
  }

  async getRevenueOverview(query: RevenueQueryDto, actor: AuthenticatedUser) {
    const range = this.resolveDateRange(query.dateFrom, query.dateTo);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds } },
      orderBy: { name: "asc" },
    });

    const tickets = await this.prisma.ticket.findMany({
      where: {
        companyId: actor.tenantId,
        branchId: { in: branchIds },
        status: "PAID",
        closedAt: {
          gte: range.start,
          lte: range.end,
        },
      },
      include: {
        branch: true,
        payments: true,
      },
      orderBy: { closedAt: "asc" },
    });

    const totalRevenue = tickets.reduce((sum, ticket) => sum + Number(ticket.grandTotal), 0);
    const ticketCount = tickets.length;
    const totalDiscount = tickets.reduce((sum, ticket) => sum + Number(ticket.discountTotal), 0);
    const averageBasket = ticketCount > 0 ? totalRevenue / ticketCount : 0;

    const trendMap = new Map<string, { label: string; revenue: number; ticketCount: number }>();
    const paymentMap = new Map<string, number>();

    for (const ticket of tickets) {
      const ticketDate = ticket.closedAt ?? ticket.openedAt;
      const key = this.createBucketKey(ticketDate, query.groupBy ?? "day");
      const label = this.createBucketLabel(ticketDate, query.groupBy ?? "day");
      const current = trendMap.get(key) ?? { label, revenue: 0, ticketCount: 0 };

      current.revenue += Number(ticket.grandTotal);
      current.ticketCount += 1;
      trendMap.set(key, current);

      for (const payment of ticket.payments) {
        paymentMap.set(payment.method, (paymentMap.get(payment.method) ?? 0) + Number(payment.amount));
      }
    }

    const rows = [...trendMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => ({
        label: value.label,
        revenue: value.revenue,
        ticketCount: value.ticketCount,
        averageBasket: value.ticketCount > 0 ? value.revenue / value.ticketCount : 0,
      }));

    return {
      filters: {
        branchId: query.branchId ?? null,
        dateFrom: range.start.toISOString(),
        dateTo: range.end.toISOString(),
        groupBy: query.groupBy ?? "day",
      },
      cards: [
        { key: "revenue", label: "Toplam Ciro", value: totalRevenue, tone: "success", helper: "Secili donem" },
        { key: "ticketCount", label: "Adisyon Sayisi", value: ticketCount, tone: "info", helper: "PAID fisler" },
        { key: "averageBasket", label: "Ortalama Sepet", value: averageBasket, tone: "warning", helper: "Ciro / fis" },
        { key: "discount", label: "Toplam Iskonto", value: totalDiscount, tone: "danger", helper: "Donem indirim tutari" },
      ],
      chart: {
        groupBy: query.groupBy ?? "day",
        points: rows,
      },
      paymentBreakdown: [...paymentMap.entries()].map(([method, amount]) => ({
        method,
        amount,
      })),
      table: rows.slice(0, query.limit ?? 60),
      branchOptions: branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
      })),
    };
  }

  async getRegisterSummaryReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const ranges = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const [tickets, expenses, registerTransactions] = await Promise.all([
      this.fetchPaidTickets(actor.tenantId, branchIds, ranges.current.start, ranges.current.end),
      this.prisma.expense.findMany({
        where: {
          branchId: { in: branchIds },
          expenseDate: { gte: ranges.current.start, lte: ranges.current.end },
        },
        include: { branch: true },
        orderBy: { expenseDate: "asc" },
      }),
      this.prisma.registerTransaction.findMany({
        where: {
          branchId: { in: branchIds },
          createdAt: { gte: ranges.current.start, lte: ranges.current.end },
        },
        include: {
          branch: true,
          closing: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const salesTotal = sumTicketRevenue(tickets);
    const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const registerSummary = summarizeRegisterTransactions(registerTransactions);
    const refundTotal = registerSummary.refunds;
    const netCash = registerSummary.net.cash;

    const groupedByBranch = new Map<string, { branchId: string; branchName: string; sales: number; expenses: number; net: number }>();
    for (const ticket of tickets) {
      const current = groupedByBranch.get(ticket.branchId) ?? {
        branchId: ticket.branchId,
        branchName: ticket.branch.name,
        sales: 0,
        expenses: 0,
        net: 0,
      };
      current.sales += Number(ticket.grandTotal);
      current.net = current.sales - current.expenses;
      groupedByBranch.set(ticket.branchId, current);
    }
    for (const expense of expenses) {
      const current = groupedByBranch.get(expense.branchId) ?? {
        branchId: expense.branchId,
        branchName: expense.branch.name,
        sales: 0,
        expenses: 0,
        net: 0,
      };
      current.expenses += Number(expense.amount);
      current.net = current.sales - current.expenses;
      groupedByBranch.set(expense.branchId, current);
    }

    const rows = [...groupedByBranch.values()].sort((left, right) => right.net - left.net);

    return {
      filters: this.buildFiltersPayload(query, ranges.current, ranges.previous),
      cards: [
        { key: "salesTotal", label: "Toplam Satis", value: salesTotal, tone: "success", helper: "PAID adisyonlar" },
        { key: "expenseTotal", label: "Toplam Gider", value: expenseTotal, tone: "danger", helper: "POS + diger giderler" },
        {
          key: "netAmount",
          label: "Net Durum",
          value: roundCurrency(salesTotal - expenseTotal - refundTotal),
          tone: salesTotal - expenseTotal - refundTotal >= 0 ? "success" : "danger",
          helper: "Satis - gider - iade",
        },
        { key: "cashExpected", label: "Beklenen Nakit", value: netCash, tone: "info", helper: "Kasa transaction bazli" },
      ],
      chart: {
        groupBy: "branch",
        points: rows.map((row) => ({
          label: row.branchName,
          sales: row.sales,
          expenses: row.expenses,
          net: row.net,
        })),
      },
      tableColumns: [
        { key: "branchName", label: "Sube" },
        { key: "sales", label: "Satis" },
        { key: "expenses", label: "Gider" },
        { key: "net", label: "Net" },
      ],
      table: rows.slice(0, query.limit ?? 100),
    };
  }

  async getRegisterPaymentsReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const ranges = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const rows = await this.prisma.registerTransaction.findMany({
      where: {
        branchId: { in: branchIds },
        createdAt: { gte: ranges.current.start, lte: ranges.current.end },
      },
      include: {
        branch: true,
        user: true,
        order: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const paymentSummary = summarizeRegisterTransactions(rows);

    const table = rows.map((row) => ({
      id: row.id,
      branchName: row.branch.name,
      userName: row.user?.fullName ?? "-",
      type: row.type,
      paymentType: row.paymentType,
      amount: Number(row.amount),
      orderId: row.orderId,
      ticketName: row.order?.ticketName ?? "-",
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      filters: this.buildFiltersPayload(query, ranges.current, ranges.previous),
      cards: [
        { key: "sales", label: "Satis Hareketi", value: paymentSummary.sales, tone: "success", helper: "Register sale" },
        { key: "expenses", label: "Gider Hareketi", value: paymentSummary.expenses, tone: "danger", helper: "Register expense" },
        { key: "cash", label: "Net Nakit", value: paymentSummary.net.cash, tone: "warning", helper: "sale - refund - expense" },
        { key: "cardMobile", label: "Net Kart + Mobil", value: roundCurrency(paymentSummary.net.card + paymentSummary.net.mobile), tone: "info", helper: "card + mobile" },
      ],
      breakdown: {
        cash: paymentSummary.net.cash,
        card: paymentSummary.net.card,
        mobile: paymentSummary.net.mobile,
        refunds: paymentSummary.refunds,
      },
      tableColumns: [
        { key: "createdAt", label: "Tarih" },
        { key: "branchName", label: "Sube" },
        { key: "userName", label: "Personel" },
        { key: "type", label: "Tip" },
        { key: "paymentType", label: "Odeme Tipi" },
        { key: "amount", label: "Tutar" },
        { key: "ticketName", label: "Adisyon" },
      ],
      table: table.slice(0, query.limit ?? 200),
    };
  }

  async getCategorySummaryReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const ranges = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        companyId: actor.tenantId,
        branchId: { in: branchIds },
        status: "PAID",
        closedAt: { gte: ranges.current.start, lte: ranges.current.end },
      },
      include: {
        items: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
      orderBy: { closedAt: "desc" },
    });
    const table = buildCategoryDistribution(tickets).sort((left, right) => right.revenue - left.revenue);

    return {
      filters: this.buildFiltersPayload(query, ranges.current, ranges.previous),
      cards: [
        { key: "categoryCount", label: "Kategori Sayisi", value: table.length, tone: "info", helper: "Satis alan kategoriler" },
        { key: "totalRevenue", label: "Kategori Cirosu", value: roundCurrency(table.reduce((sum, row) => sum + row.revenue, 0)), tone: "success", helper: "Net kategori dagilimi" },
        { key: "totalQuantity", label: "Toplam Adet", value: table.reduce((sum, row) => sum + row.quantity, 0), tone: "warning", helper: "Satilan urun miktari" },
      ],
      chart: {
        groupBy: "category",
        points: table.map((row) => ({
          label: row.categoryName,
          revenue: row.revenue,
          quantity: row.quantity,
        })),
      },
      tableColumns: [
        { key: "categoryName", label: "Kategori" },
        { key: "quantity", label: "Miktar" },
        { key: "itemCount", label: "Satir" },
        { key: "grossRevenue", label: "Brut Ciro" },
        { key: "discount", label: "Indirim Payi" },
        { key: "tax", label: "Vergi Payi" },
        { key: "revenue", label: "Net Ciro" },
        { key: "averageLineRevenue", label: "Ort. Satir Cirosu" },
      ],
      table: table.slice(0, query.limit ?? 100),
    };
  }

  async getBranchRevenue(query: BranchRevenueQueryDto, actor: AuthenticatedUser) {
    const range = this.resolveDateRange(query.dateFrom, query.dateTo);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: actor.branchIds } },
      orderBy: { name: "asc" },
    });
    const branchIds = branches.map((branch) => branch.id);

    const tickets = await this.prisma.ticket.findMany({
      where: {
        companyId: actor.tenantId,
        branchId: { in: branchIds },
        status: "PAID",
        closedAt: {
          gte: range.start,
          lte: range.end,
        },
      },
      include: {
        branch: true,
      },
    });

    const grouped = new Map<
      string,
      { branchId: string; branchName: string; revenue: number; ticketCount: number; firstSaleAt: Date | null; lastSaleAt: Date | null }
    >();

    for (const ticket of tickets) {
      const current = grouped.get(ticket.branchId) ?? {
        branchId: ticket.branchId,
        branchName: ticket.branch.name,
        revenue: 0,
        ticketCount: 0,
        firstSaleAt: ticket.closedAt,
        lastSaleAt: ticket.closedAt,
      };

      current.revenue += Number(ticket.grandTotal);
      current.ticketCount += 1;
      current.firstSaleAt = !current.firstSaleAt || (ticket.closedAt && ticket.closedAt < current.firstSaleAt) ? ticket.closedAt : current.firstSaleAt;
      current.lastSaleAt = !current.lastSaleAt || (ticket.closedAt && ticket.closedAt > current.lastSaleAt) ? ticket.closedAt : current.lastSaleAt;
      grouped.set(ticket.branchId, current);
    }

    let rows = [...grouped.values()].map((row) => ({
      ...row,
      averageBasket: row.ticketCount > 0 ? row.revenue / row.ticketCount : 0,
      firstSaleAt: row.firstSaleAt?.toISOString() ?? null,
      lastSaleAt: row.lastSaleAt?.toISOString() ?? null,
    }));

    if (query.search) {
      const search = query.search.toLowerCase();
      rows = rows.filter((row) => row.branchName.toLowerCase().includes(search));
    }

    const sortBy = query.sortBy ?? "revenue";
    const direction = query.sortDirection === "asc" ? 1 : -1;
    rows.sort((left, right) => {
      const leftValue = left[sortBy];
      const rightValue = right[sortBy];

      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return 0;
    });

    return {
      filters: {
        dateFrom: range.start.toISOString(),
        dateTo: range.end.toISOString(),
        sortBy,
        sortDirection: query.sortDirection ?? "desc",
        search: query.search ?? "",
      },
      chart: rows.map((row) => ({
        label: row.branchName,
        revenue: row.revenue,
        ticketCount: row.ticketCount,
      })),
      table: rows,
    };
  }

  async exportRevenueOverview(query: RevenueQueryDto, actor: AuthenticatedUser) {
    const overview = await this.getRevenueOverview(query, actor);
    return toCsv(
      ["label", "revenue", "ticketCount", "averageBasket"],
      overview.table.map((row) => [row.label, row.revenue, row.ticketCount, row.averageBasket]),
    );
  }

  async exportBranchRevenue(query: BranchRevenueQueryDto, actor: AuthenticatedUser) {
    const report = await this.getBranchRevenue(query, actor);
    return toCsv(
      ["branchName", "revenue", "ticketCount", "averageBasket", "firstSaleAt", "lastSaleAt"],
      report.table.map((row) => [row.branchName, row.revenue, row.ticketCount, row.averageBasket, row.firstSaleAt, row.lastSaleAt]),
    );
  }

  private async getSalesReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });

    const [currentTickets, previousTickets] = await Promise.all([
      this.fetchPaidTickets(actor.tenantId, branchIds, current.start, current.end),
      this.fetchPaidTickets(actor.tenantId, branchIds, previous.start, previous.end),
    ]);

    const currentRevenue = currentTickets.reduce((sum, ticket) => sum + Number(ticket.grandTotal), 0);
    const previousRevenue = previousTickets.reduce((sum, ticket) => sum + Number(ticket.grandTotal), 0);
    const currentCount = currentTickets.length;
    const previousCount = previousTickets.length;
    const currentDiscount = currentTickets.reduce((sum, ticket) => sum + Number(ticket.discountTotal), 0);
    const previousDiscount = previousTickets.reduce((sum, ticket) => sum + Number(ticket.discountTotal), 0);

    const branchCompare = this.buildBranchTicketComparison(branches, currentTickets, previousTickets);
    const chart = this.buildTicketChart(currentTickets, previousTickets, query.groupBy ?? "day");

    const table = currentTickets
      .filter((ticket) => {
        if (!query.search) return true;
        const search = query.search.toLowerCase();
        return (
          (ticket.ticketName ?? "").toLowerCase().includes(search) ||
          ticket.branch.name.toLowerCase().includes(search) ||
          (ticket.customer?.fullName ?? "").toLowerCase().includes(search)
        );
      })
      .sort((left, right) => (right.closedAt?.getTime() ?? 0) - (left.closedAt?.getTime() ?? 0))
      .slice(0, query.limit ?? 100)
      .map((ticket) => ({
        id: ticket.id,
        ticketName: ticket.ticketName ?? ticket.id,
        branchName: ticket.branch.name,
        customerName: ticket.customer?.businessName ?? ticket.customer?.fullName ?? "-",
        channel: ticket.channel,
        ticketCount: 1,
        grandTotal: Number(ticket.grandTotal),
        discountTotal: Number(ticket.discountTotal),
        paidAt: ticket.closedAt?.toISOString() ?? null,
      }));

    return {
      report: "sales-reports",
      title: "Satis Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("revenue", "Toplam Satis", currentRevenue, previousRevenue),
        this.createCard("ticketCount", "Fis Sayisi", currentCount, previousCount),
        this.createCard("averageBasket", "Ort. Sepet", currentCount > 0 ? currentRevenue / currentCount : 0, previousCount > 0 ? previousRevenue / previousCount : 0),
        this.createCard("discount", "Toplam Iskonto", currentDiscount, previousDiscount),
      ],
      comparisonSummary: this.createComparisonSummary(currentRevenue, previousRevenue),
      chart,
      comparisonTable: branchCompare,
      tableColumns: [
        { key: "ticketName", label: "Adisyon" },
        { key: "branchName", label: "Sube" },
        { key: "customerName", label: "Musteri" },
        { key: "channel", label: "Kanal" },
        { key: "grandTotal", label: "Toplam" },
        { key: "paidAt", label: "Kapanis" },
      ],
      table,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getPaymentMethodReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });
    const [currentPayments, previousPayments] = await Promise.all([
      this.fetchCompletedPayments(branchIds, current.start, current.end),
      this.fetchCompletedPayments(branchIds, previous.start, previous.end),
    ]);

    const currentMap = this.aggregatePaymentMethodRows(currentPayments);
    const previousMap = this.aggregatePaymentMethodRows(previousPayments);
    let rows = [...currentMap.values()].map((row) => {
      const previousRow = previousMap.get(row.method);
      return {
        ...row,
        previousAmount: previousRow?.amount ?? 0,
        previousCount: previousRow?.count ?? 0,
        deltaAmount: row.amount - (previousRow?.amount ?? 0),
      };
    });
    if (query.search) {
      const lowered = query.search.toLowerCase();
      rows = rows.filter((row) => row.methodLabel.toLowerCase().includes(lowered));
    }
    rows = this.sortRows(rows, query.sortBy ?? "amount", query.sortDirection ?? "desc").slice(0, query.limit ?? 100);

    const currentAmount = [...currentMap.values()].reduce((sum, row) => sum + row.amount, 0);
    const previousAmount = [...previousMap.values()].reduce((sum, row) => sum + row.amount, 0);
    const currentCount = [...currentMap.values()].reduce((sum, row) => sum + row.count, 0);
    const previousCount = [...previousMap.values()].reduce((sum, row) => sum + row.count, 0);

    return {
      report: "payment-method-reports",
      title: "Odeme Tipi Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("amount", "Toplam Tahsilat", currentAmount, previousAmount),
        this.createCard("paymentCount", "Islem Sayisi", currentCount, previousCount),
        this.createCard("averagePayment", "Ortalama Islem", currentCount > 0 ? currentAmount / currentCount : 0, previousCount > 0 ? previousAmount / previousCount : 0),
        this.createCard("activeMethods", "Aktif Odeme Tipi", rows.length, previousMap.size),
      ],
      comparisonSummary: this.createComparisonSummary(currentAmount, previousAmount),
      chart: {
        groupBy: query.groupBy ?? "month",
        currentLabel: "Secili donem",
        previousLabel: "Karsilastirma",
        points: rows.slice(0, 8).map((row) => ({ label: row.methodLabel, current: row.amount, previous: row.previousAmount })),
      },
      comparisonTable: this.buildBranchPaymentComparison(branches, currentPayments, previousPayments),
      tableColumns: [
        { key: "methodLabel", label: "Odeme Tipi" },
        { key: "amount", label: "Tutar" },
        { key: "count", label: "Islem" },
        { key: "averageAmount", label: "Ort. Tutar" },
        { key: "deltaAmount", label: "Delta" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getExpenseReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });
    const [currentExpenses, previousExpenses, currentPayroll, previousPayroll, currentOther, previousOther] = await Promise.all([
      this.prisma.expense.findMany({ where: { branchId: { in: branchIds }, expenseDate: { gte: current.start, lte: current.end } }, include: { branch: true, account: true } }),
      this.prisma.expense.findMany({ where: { branchId: { in: branchIds }, expenseDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, account: true } }),
      this.prisma.payrollPayment.findMany({ where: { branchId: { in: branchIds }, movementType: "PAYMENT", deletedAt: null, paymentDate: { gte: current.start, lte: current.end } }, include: { branch: true, employeeProfile: { include: { user: true } } } }),
      this.prisma.payrollPayment.findMany({ where: { branchId: { in: branchIds }, movementType: "PAYMENT", deletedAt: null, paymentDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, employeeProfile: { include: { user: true } } } }),
      this.prisma.otherPayment.findMany({ where: { branchId: { in: branchIds }, paymentDate: { gte: current.start, lte: current.end } }, include: { branch: true, account: true } }),
      this.prisma.otherPayment.findMany({ where: { branchId: { in: branchIds }, paymentDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, account: true } }),
    ]);

    const allCurrentRows = this.buildExpenseDetailRows(currentExpenses, currentPayroll, currentOther, query.search);
    const rows = allCurrentRows.slice(0, query.limit ?? 100);
    const currentTotal = allCurrentRows.reduce((sum, row) => sum + row.amount, 0);
    const previousTotal = this.buildExpenseDetailRows(previousExpenses, previousPayroll, previousOther).reduce((sum, row) => sum + row.amount, 0);
    const payrollTotal = currentPayroll.reduce((sum, row) => sum + Number(row.amount), 0);
    const fixedTotal = currentExpenses.filter((row) => row.expenseType === "fixed_cost").reduce((sum, row) => sum + Number(row.amount), 0);
    const otherTotal = currentOther.reduce((sum, row) => sum + Number(row.amount), 0);

    return {
      report: "expense-reports",
      title: "Gider Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("outflow", "Toplam Gider", currentTotal, previousTotal),
        this.createCard("fixed", "Sabit Gider", fixedTotal, previousExpenses.filter((row) => row.expenseType === "fixed_cost").reduce((sum, row) => sum + Number(row.amount), 0)),
        this.createCard("payroll", "Personel Gideri", payrollTotal, previousPayroll.reduce((sum, row) => sum + Number(row.amount), 0)),
        this.createCard("other", "Diger Gider", otherTotal, previousOther.reduce((sum, row) => sum + Number(row.amount), 0)),
      ],
      comparisonSummary: this.createComparisonSummary(currentTotal, previousTotal),
      chart: this.buildExpenseChart(currentExpenses, currentPayroll, currentOther, previousExpenses, previousPayroll, previousOther, query.groupBy ?? "day"),
      comparisonTable: this.buildExpenseBranchComparison(branches, currentExpenses, currentPayroll, currentOther, previousExpenses, previousPayroll, previousOther),
      tableColumns: [
        { key: "title", label: "Kalem" },
        { key: "branchName", label: "Sube" },
        { key: "category", label: "Kategori" },
        { key: "expenseTypeLabel", label: "Tip" },
        { key: "amount", label: "Tutar" },
        { key: "date", label: "Tarih" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getCashClosureReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });
    const [currentClosures, previousClosures] = await Promise.all([
      this.prisma.cashClosure.findMany({ where: { branchId: { in: branchIds }, closureDate: { gte: current.start, lte: current.end } }, include: { branch: true, account: true } }),
      this.prisma.cashClosure.findMany({ where: { branchId: { in: branchIds }, closureDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, account: true } }),
    ]);

    let rows = currentClosures.map((closure) => ({
      id: closure.id,
      branchName: closure.branch.name,
      closureDate: closure.closureDate.toISOString(),
      expectedAmount: Number(closure.expectedAmount),
      countedAmount: Number(closure.countedAmount),
      varianceAmount: Number(closure.varianceAmount),
      note: closure.notes ?? "-",
    }));
    if (query.search) {
      const lowered = query.search.toLowerCase();
      rows = rows.filter((row) => row.branchName.toLowerCase().includes(lowered) || row.note.toLowerCase().includes(lowered));
    }
    rows = rows.slice(0, query.limit ?? 100);

    const currentVariance = currentClosures.reduce((sum, row) => sum + Number(row.varianceAmount), 0);
    const previousVariance = previousClosures.reduce((sum, row) => sum + Number(row.varianceAmount), 0);

    return {
      report: "cash-closure-reports",
      title: "Kasa Kapanis Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("closureCount", "Kapanis Sayisi", currentClosures.length, previousClosures.length),
        this.createCard("expected", "Beklenen Kasa", currentClosures.reduce((sum, row) => sum + Number(row.expectedAmount), 0), previousClosures.reduce((sum, row) => sum + Number(row.expectedAmount), 0)),
        this.createCard("counted", "Sayilan Kasa", currentClosures.reduce((sum, row) => sum + Number(row.countedAmount), 0), previousClosures.reduce((sum, row) => sum + Number(row.countedAmount), 0)),
        this.createCard("variance", "Kasa Farki", currentVariance, previousVariance),
      ],
      comparisonSummary: this.createComparisonSummary(currentVariance, previousVariance),
      chart: this.buildCashClosureChart(currentClosures, previousClosures, query.groupBy ?? "day"),
      comparisonTable: this.buildCashClosureBranchComparison(branches, currentClosures, previousClosures),
      tableColumns: [
        { key: "branchName", label: "Sube" },
        { key: "closureDate", label: "Tarih" },
        { key: "expectedAmount", label: "Beklenen" },
        { key: "countedAmount", label: "Sayilan" },
        { key: "varianceAmount", label: "Fark" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getDiscountReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });
    const [currentTickets, previousTickets] = await Promise.all([
      this.fetchPaidTickets(actor.tenantId, branchIds, current.start, current.end),
      this.fetchPaidTickets(actor.tenantId, branchIds, previous.start, previous.end),
    ]);

    const discountedCurrent = currentTickets.filter((ticket) => Number(ticket.discountTotal) > 0);
    const discountedPrevious = previousTickets.filter((ticket) => Number(ticket.discountTotal) > 0);
    let rows = discountedCurrent.map((ticket) => ({
      id: ticket.id,
      ticketName: ticket.ticketName ?? ticket.id,
      branchName: ticket.branch.name,
      subtotal: Number(ticket.subtotal),
      discountTotal: Number(ticket.discountTotal),
      grandTotal: Number(ticket.grandTotal),
      discountRate: Number(ticket.subtotal) > 0 ? (Number(ticket.discountTotal) / Number(ticket.subtotal)) * 100 : 0,
      paidAt: ticket.closedAt?.toISOString() ?? null,
    }));
    if (query.search) {
      const lowered = query.search.toLowerCase();
      rows = rows.filter((row) => row.ticketName.toLowerCase().includes(lowered) || row.branchName.toLowerCase().includes(lowered));
    }
    rows = rows.slice(0, query.limit ?? 100);

    const currentDiscount = sumTicketDiscount(discountedCurrent);
    const previousDiscount = sumTicketDiscount(discountedPrevious);
    const currentSubtotal = discountedCurrent.reduce((sum, ticket) => sum + Number(ticket.subtotal), 0);
    const previousSubtotal = discountedPrevious.reduce((sum, ticket) => sum + Number(ticket.subtotal), 0);

    return {
      report: "discount-reports",
      title: "Indirim Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("discountTotal", "Toplam Iskonto", currentDiscount, previousDiscount),
        this.createCard("discountedTickets", "Indirimli Fis", discountedCurrent.length, discountedPrevious.length),
        this.createCard("avgDiscount", "Ort. Iskonto", discountedCurrent.length > 0 ? currentDiscount / discountedCurrent.length : 0, discountedPrevious.length > 0 ? previousDiscount / discountedPrevious.length : 0),
        this.createCard("discountRate", "Iskonto Orani", currentSubtotal > 0 ? (currentDiscount / currentSubtotal) * 100 : 0, previousSubtotal > 0 ? (previousDiscount / previousSubtotal) * 100 : 0),
      ],
      comparisonSummary: this.createComparisonSummary(currentDiscount, previousDiscount),
      chart: this.buildDiscountChart(discountedCurrent, discountedPrevious, query.groupBy ?? "day"),
      comparisonTable: this.buildDiscountBranchComparison(branches, discountedCurrent, discountedPrevious),
      tableColumns: [
        { key: "ticketName", label: "Adisyon" },
        { key: "branchName", label: "Sube" },
        { key: "subtotal", label: "Ara Toplam" },
        { key: "discountTotal", label: "Iskonto" },
        { key: "discountRate", label: "%" },
        { key: "grandTotal", label: "Net Tutar" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getProductReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });

    const [currentItems, previousItems] = await Promise.all([
      this.prisma.ticketItem.findMany({
        where: {
          ticket: {
            companyId: actor.tenantId,
            branchId: { in: branchIds },
            status: "PAID",
            closedAt: { gte: current.start, lte: current.end },
          },
        },
        include: { ticket: { include: { branch: true } } },
      }),
      this.prisma.ticketItem.findMany({
        where: {
          ticket: {
            companyId: actor.tenantId,
            branchId: { in: branchIds },
            status: "PAID",
            closedAt: { gte: previous.start, lte: previous.end },
          },
        },
        include: { ticket: { include: { branch: true } } },
      }),
    ]);

    const currentMap = this.aggregateProductRows(currentItems);
    const previousMap = this.aggregateProductRows(previousItems);
    let rows = [...currentMap.values()].map((row) => {
      const previousRow = previousMap.get(row.productName);
      return {
        ...row,
        previousRevenue: previousRow?.revenue ?? 0,
        deltaRevenue: row.revenue - (previousRow?.revenue ?? 0),
      };
    });

    if (query.search) {
      const search = query.search.toLowerCase();
      rows = rows.filter((row) => row.productName.toLowerCase().includes(search) || row.branchNames.toLowerCase().includes(search));
    }

    rows = this.sortRows(rows, query.sortBy ?? "revenue", query.sortDirection ?? "desc").slice(0, query.limit ?? 100);

    const currentRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const previousRevenue = [...previousMap.values()].reduce((sum, row) => sum + row.revenue, 0);
    const currentQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const previousQuantity = [...previousMap.values()].reduce((sum, row) => sum + row.quantity, 0);

    return {
      report: "product-reports",
      title: "Urun Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("revenue", "Urun Cirosu", currentRevenue, previousRevenue),
        this.createCard("quantity", "Satis Miktari", currentQuantity, previousQuantity),
        this.createCard("activeProducts", "Aktif Urun", currentMap.size, previousMap.size),
        this.createCard("averagePrice", "Ort. Birim Fiyat", currentQuantity > 0 ? currentRevenue / currentQuantity : 0, previousQuantity > 0 ? previousRevenue / previousQuantity : 0),
      ],
      comparisonSummary: this.createComparisonSummary(currentRevenue, previousRevenue),
      chart: {
        groupBy: "product",
        currentLabel: `${this.formatShortDate(current.start)} - ${this.formatShortDate(current.end)}`,
        previousLabel: `${this.formatShortDate(previous.start)} - ${this.formatShortDate(previous.end)}`,
        points: rows.slice(0, 12).map((row) => ({
          label: row.productName,
          current: row.revenue,
          previous: row.previousRevenue,
        })),
      },
      comparisonTable: this.buildBranchProductComparison(branches, currentItems, previousItems),
      tableColumns: [
        { key: "productName", label: "Urun" },
        { key: "branchNames", label: "Subeler" },
        { key: "quantity", label: "Miktar" },
        { key: "revenue", label: "Ciro" },
        { key: "averagePrice", label: "Ort. Fiyat" },
        { key: "deltaRevenue", label: "Delta" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getProfitabilityReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });
    const [currentItems, previousItems] = await Promise.all([
      this.prisma.ticketItem.findMany({
        where: {
          ticket: { companyId: actor.tenantId, branchId: { in: branchIds }, status: "PAID", closedAt: { gte: current.start, lte: current.end } },
        },
        include: {
          ticket: { include: { branch: true } },
          product: {
            include: {
              recipe: {
                include: {
                  items: {
                    include: {
                      inventoryItem: {
                        include: {
                          stockEntries: { orderBy: { createdAt: "desc" }, take: 1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.ticketItem.findMany({
        where: {
          ticket: { companyId: actor.tenantId, branchId: { in: branchIds }, status: "PAID", closedAt: { gte: previous.start, lte: previous.end } },
        },
        include: {
          ticket: { include: { branch: true } },
          product: {
            include: {
              recipe: {
                include: {
                  items: {
                    include: {
                      inventoryItem: {
                        include: {
                          stockEntries: { orderBy: { createdAt: "desc" }, take: 1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const currentRows = this.aggregateProfitabilityRows(currentItems);
    const previousRows = this.aggregateProfitabilityRows(previousItems);
    let rows = [...currentRows.values()].map((row) => {
      const previousRow = previousRows.get(row.productName);
      return {
        ...row,
        previousProfit: previousRow?.grossProfit ?? 0,
        deltaProfit: row.grossProfit - (previousRow?.grossProfit ?? 0),
      };
    });
    if (query.search) {
      const lowered = query.search.toLowerCase();
      rows = rows.filter((row) => row.productName.toLowerCase().includes(lowered) || row.branchNames.toLowerCase().includes(lowered));
    }
    rows = this.sortRows(rows, query.sortBy ?? "grossProfit", query.sortDirection ?? "desc").slice(0, query.limit ?? 100);

    const currentRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const currentCost = rows.reduce((sum, row) => sum + row.cost, 0);
    const previousProfit = [...previousRows.values()].reduce((sum, row) => sum + row.grossProfit, 0);

    return {
      report: "profitability-reports",
      title: "Maliyet & Karlilik Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("grossRevenue", "Brut Satis", currentRevenue, [...previousRows.values()].reduce((sum, row) => sum + row.revenue, 0)),
        this.createCard("theoreticalCost", "Teorik Maliyet", currentCost, [...previousRows.values()].reduce((sum, row) => sum + row.cost, 0)),
        this.createCard("grossProfit", "Brut Kar", currentRevenue - currentCost, previousProfit),
        this.createCard("marginRate", "Karlilik %", currentRevenue > 0 ? ((currentRevenue - currentCost) / currentRevenue) * 100 : 0, 0),
      ],
      comparisonSummary: this.createComparisonSummary(currentRevenue - currentCost, previousProfit),
      chart: {
        groupBy: query.groupBy ?? "month",
        currentLabel: "Brut kar",
        previousLabel: "Karsilastirma",
        points: rows.slice(0, 12).map((row) => ({ label: row.productName, current: row.grossProfit, previous: row.previousProfit })),
      },
      comparisonTable: this.buildProfitabilityBranchComparison(branches, currentItems),
      tableColumns: [
        { key: "productName", label: "Urun" },
        { key: "branchNames", label: "Subeler" },
        { key: "quantity", label: "Miktar" },
        { key: "revenue", label: "Brut Satis" },
        { key: "cost", label: "Teorik Maliyet" },
        { key: "grossProfit", label: "Brut Kar" },
        { key: "marginRate", label: "Kar %" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getStockReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });

    const [items, currentEntries, previousEntries] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { warehouse: { branchId: { in: branchIds } } },
        include: {
          warehouse: { include: { branch: true } },
          unit: true,
          stockAlerts: true,
          stockEntries: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      this.prisma.stockEntry.findMany({
        where: { warehouse: { branchId: { in: branchIds } }, createdAt: { gte: current.start, lte: current.end } },
        include: { warehouse: { include: { branch: true } }, inventoryItem: true },
      }),
      this.prisma.stockEntry.findMany({
        where: { warehouse: { branchId: { in: branchIds } }, createdAt: { gte: previous.start, lte: previous.end } },
        include: { warehouse: { include: { branch: true } }, inventoryItem: true },
      }),
    ]);

    const filteredItems = items.filter((item) => {
      if (!query.search) return true;
      const search = query.search.toLowerCase();
      return item.name.toLowerCase().includes(search) || (item.sku ?? "").toLowerCase().includes(search) || item.warehouse.name.toLowerCase().includes(search);
    });

    const currentMovement = currentEntries.reduce((sum, entry) => sum + Math.abs(Number(entry.quantity)), 0);
    const previousMovement = previousEntries.reduce((sum, entry) => sum + Math.abs(Number(entry.quantity)), 0);
    const currentWaste = currentEntries.filter((entry) => entry.entryType === "waste").reduce((sum, entry) => sum + Number(entry.quantity), 0);
    const previousWaste = previousEntries.filter((entry) => entry.entryType === "waste").reduce((sum, entry) => sum + Number(entry.quantity), 0);
    const lowStockCount = filteredItems.filter((item) => Number(item.currentStock) <= Number(item.minimumLevel)).length;

    return {
      report: "stock-reports",
      title: "Stok Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("stockVolume", "Toplam Stok", filteredItems.reduce((sum, item) => sum + Number(item.currentStock), 0), 0),
        this.createCard("lowStock", "Kritik Urun", lowStockCount, 0),
        this.createCard("movement", "Hareket Hacmi", currentMovement, previousMovement),
        this.createCard("waste", "Atik Miktari", currentWaste, previousWaste),
      ],
      comparisonSummary: this.createComparisonSummary(currentMovement, previousMovement),
      chart: this.buildEntryChart(currentEntries, previousEntries, query.groupBy ?? "day"),
      comparisonTable: this.buildWarehouseStockComparison(branches, filteredItems),
      tableColumns: [
        { key: "name", label: "Urun" },
        { key: "branchName", label: "Sube" },
        { key: "warehouseName", label: "Depo" },
        { key: "currentStock", label: "Stok" },
        { key: "minimumLevel", label: "Min." },
        { key: "alertStatus", label: "Uyari" },
      ],
      table: filteredItems.slice(0, query.limit ?? 100).map((item) => ({
        id: item.id,
        name: item.name,
        branchName: item.warehouse.branch.name,
        warehouseName: item.warehouse.name,
        currentStock: Number(item.currentStock),
        minimumLevel: Number(item.minimumLevel),
        alertStatus: Number(item.currentStock) <= Number(item.minimumLevel) ? "kritik" : "normal",
        lastMovementAt: item.stockEntries[0]?.createdAt.toISOString() ?? null,
      })),
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getConsumptionReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });
    const [currentEntries, previousEntries] = await Promise.all([
      this.prisma.stockEntry.findMany({
        where: { warehouse: { branchId: { in: branchIds } }, entryType: { in: ["sale", "sale_reversal"] }, createdAt: { gte: current.start, lte: current.end } },
        include: { warehouse: { include: { branch: true } }, inventoryItem: { include: { unit: true } } },
      }),
      this.prisma.stockEntry.findMany({
        where: { warehouse: { branchId: { in: branchIds } }, entryType: { in: ["sale", "sale_reversal"] }, createdAt: { gte: previous.start, lte: previous.end } },
        include: { warehouse: { include: { branch: true } }, inventoryItem: { include: { unit: true } } },
      }),
    ]);

    const currentRows = this.aggregateConsumptionRows(currentEntries);
    const previousRows = this.aggregateConsumptionRows(previousEntries);
    let rows = [...currentRows.values()].map((row) => {
      const previousRow = previousRows.get(row.itemName);
      return {
        ...row,
        previousQuantity: previousRow?.quantity ?? 0,
        deltaQuantity: row.quantity - (previousRow?.quantity ?? 0),
      };
    });
    if (query.search) {
      const lowered = query.search.toLowerCase();
      rows = rows.filter((row) => row.itemName.toLowerCase().includes(lowered) || row.branchNames.toLowerCase().includes(lowered));
    }
    rows = this.sortRows(rows, query.sortBy ?? "cost", query.sortDirection ?? "desc").slice(0, query.limit ?? 100);

    return {
      report: "consumption-reports",
      title: "Hammadde Tuketim Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("consumedQuantity", "Tuketilen Miktar", rows.reduce((sum, row) => sum + row.quantity, 0), [...previousRows.values()].reduce((sum, row) => sum + row.quantity, 0)),
        this.createCard("consumedCost", "Tuketim Maliyeti", rows.reduce((sum, row) => sum + row.cost, 0), [...previousRows.values()].reduce((sum, row) => sum + row.cost, 0)),
        this.createCard("itemCount", "Tuketilen Hammadde", rows.length, previousRows.size),
        this.createCard("movementCount", "Hareket Sayisi", rows.reduce((sum, row) => sum + row.movementCount, 0), [...previousRows.values()].reduce((sum, row) => sum + row.movementCount, 0)),
      ],
      comparisonSummary: this.createComparisonSummary(rows.reduce((sum, row) => sum + row.cost, 0), [...previousRows.values()].reduce((sum, row) => sum + row.cost, 0)),
      chart: this.buildConsumptionChart(currentEntries, previousEntries, query.groupBy ?? "day"),
      comparisonTable: this.buildConsumptionBranchComparison(branches, currentEntries, previousEntries),
      tableColumns: [
        { key: "itemName", label: "Hammadde" },
        { key: "branchNames", label: "Subeler" },
        { key: "quantity", label: "Miktar" },
        { key: "unit", label: "Birim" },
        { key: "cost", label: "Maliyet" },
        { key: "movementCount", label: "Hareket" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getFinanceReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });

    const [currentPayments, previousPayments, currentExpenses, previousExpenses, currentPayroll, previousPayroll, currentOther, previousOther, currentInvoices, previousInvoices, currentLedger, activeFixedCosts] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: "COMPLETED", paidAt: { gte: current.start, lte: current.end }, ticket: { branchId: { in: branchIds } } },
        include: { ticket: { include: { branch: true } }, account: true },
      }),
      this.prisma.payment.findMany({
        where: { status: "COMPLETED", paidAt: { gte: previous.start, lte: previous.end }, ticket: { branchId: { in: branchIds } } },
        include: { ticket: { include: { branch: true } }, account: true },
      }),
      this.prisma.expense.findMany({ where: { branchId: { in: branchIds }, expenseType: "fixed_cost", expenseDate: { gte: current.start, lte: current.end } }, include: { branch: true, account: true } }),
      this.prisma.expense.findMany({ where: { branchId: { in: branchIds }, expenseType: "fixed_cost", expenseDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, account: true } }),
      this.prisma.payrollPayment.findMany({ where: { branchId: { in: branchIds }, movementType: "PAYMENT", deletedAt: null, paymentDate: { gte: current.start, lte: current.end } }, include: { branch: true, account: true, employeeProfile: { include: { user: true } } } }),
      this.prisma.payrollPayment.findMany({ where: { branchId: { in: branchIds }, movementType: "PAYMENT", deletedAt: null, paymentDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, account: true, employeeProfile: { include: { user: true } } } }),
      this.prisma.otherPayment.findMany({ where: { branchId: { in: branchIds }, paymentDate: { gte: current.start, lte: current.end } }, include: { branch: true, account: true } }),
      this.prisma.otherPayment.findMany({ where: { branchId: { in: branchIds }, paymentDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, account: true } }),
      this.prisma.invoice.findMany({ where: { branchId: { in: branchIds }, issueDate: { gte: current.start, lte: current.end } }, include: { branch: true, supplier: true, account: true } }),
      this.prisma.invoice.findMany({ where: { branchId: { in: branchIds }, issueDate: { gte: previous.start, lte: previous.end } }, include: { branch: true, supplier: true, account: true } }),
      this.prisma.ledgerEntry.findMany({
        where: { branchId: { in: branchIds }, entryDate: { gte: current.start, lte: current.end } },
        include: { account: true, branch: true },
      }),
      this.prisma.expense.findMany({
        where: {
          branchId: { in: branchIds },
          expenseType: "fixed_cost",
          isActive: true,
          OR: [{ endDate: null }, { endDate: { gte: current.start } }],
        },
      }),
    ]);

    const [currentRefunds, previousRefunds] = await Promise.all([
      this.prisma.refundRequest.findMany({ where: { companyId: actor.tenantId, branchId: { in: branchIds }, status: "completed", resolvedAt: { gte: current.start, lte: current.end } } }),
      this.prisma.refundRequest.findMany({ where: { companyId: actor.tenantId, branchId: { in: branchIds }, status: "completed", resolvedAt: { gte: previous.start, lte: previous.end } } }),
    ]);
    const currentCollections = [...aggregatePaymentMethods(currentPayments).values()].reduce((sum, item) => sum + item.amount, 0);
    const previousCollections = [...aggregatePaymentMethods(previousPayments).values()].reduce((sum, item) => sum + item.amount, 0);
    const currentRefundAmount = sumRefundAmount(currentRefunds);
    const previousRefundAmount = sumRefundAmount(previousRefunds);
    const currentOutflow = roundCurrency([...currentExpenses, ...currentPayroll, ...currentOther].reduce((sum, item) => sum + Number(item.amount), 0) + currentRefundAmount);
    const previousOutflow = roundCurrency([...previousExpenses, ...previousPayroll, ...previousOther].reduce((sum, item) => sum + Number(item.amount), 0) + previousRefundAmount);
    const currentInvoiceVolume = currentInvoices.reduce((sum, item) => sum + Number(item.grandTotal), 0);
    const previousInvoiceVolume = previousInvoices.reduce((sum, item) => sum + Number(item.grandTotal), 0);
    const currentFixedCosts = currentExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const previousFixedCosts = previousExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const monthlyCommitment = activeFixedCosts.reduce((sum, item) => sum + this.calculateMonthlyCommitment(Number(item.amount), item.recurrenceType), 0);

    return {
      report: "finance-reports",
      title: "Finans Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("collections", "Tahsilat", currentCollections, previousCollections),
        this.createCard("outflow", "Toplam Gider", currentOutflow, previousOutflow),
        this.createCard("net", "Net Akis", currentCollections - currentOutflow, previousCollections - previousOutflow),
        this.createCard("refunds", "Iade", currentRefundAmount, previousRefundAmount),
        this.createCard("invoice", "Fatura Hacmi", currentInvoiceVolume, previousInvoiceVolume),
        this.createCard("fixed-costs", "Sabit Maliyet", currentFixedCosts, previousFixedCosts),
        this.createCard("fixed-cost-commitment", "Aylik Sabit Yuku", monthlyCommitment, monthlyCommitment),
      ],
      comparisonSummary: this.createComparisonSummary(currentCollections - currentOutflow, previousCollections - previousOutflow),
      chart: this.buildFinanceChart(currentPayments, currentExpenses, currentPayroll, currentOther, previousPayments, previousExpenses, previousPayroll, previousOther, query.groupBy ?? "day"),
      comparisonTable: this.buildFinanceBranchComparison(branches, currentPayments, currentExpenses, currentPayroll, currentOther),
      tableColumns: [
        { key: "accountName", label: "Hesap" },
        { key: "branchName", label: "Sube" },
        { key: "debit", label: "Borclu" },
        { key: "credit", label: "Alacakli" },
        { key: "balance", label: "Bakiye" },
      ],
      table: this.buildLedgerSummaryRows(currentLedger).slice(0, query.limit ?? 100),
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getEmployeeReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });

    const [currentShifts, previousShifts, rawGoals, tasks] = await Promise.all([
      this.prisma.shift.findMany({
        where: { branchId: { in: branchIds }, scheduledStartAt: { gte: current.start, lte: current.end } },
        include: { branch: true, employeeProfile: { include: { user: true } } },
      }),
      this.prisma.shift.findMany({
        where: { branchId: { in: branchIds }, scheduledStartAt: { gte: previous.start, lte: previous.end } },
        include: { branch: true, employeeProfile: { include: { user: true } } },
      }),
      this.prisma.goal.findMany({
        where: { employeeProfile: { branchId: { in: branchIds } }, startsAt: { lte: current.end }, endsAt: { gte: current.start } },
        include: { employeeProfile: { include: { user: true, branch: true } } },
      }),
      this.prisma.task.findMany({
        where: { user: { companyId: actor.tenantId }, OR: [{ dueAt: { gte: current.start, lte: current.end } }, { dueAt: null }] },
        include: { user: true },
      }),
    ]);
    const currentGoals = await this.goalProgressService.syncGoalSet(rawGoals.map((goal) => goal.id));

    const currentLate = currentShifts.reduce((sum, shift) => sum + shift.lateMinutes, 0);
    const previousLate = previousShifts.reduce((sum, shift) => sum + shift.lateMinutes, 0);
    const currentOvertime = currentShifts.reduce((sum, shift) => sum + shift.overtimeMinutes, 0);
    const previousOvertime = previousShifts.reduce((sum, shift) => sum + shift.overtimeMinutes, 0);

    const table = this.buildEmployeeSummaryRows(currentShifts, currentGoals, tasks, query.search).slice(0, query.limit ?? 100);

    return {
      report: "employee-reports",
      title: "Calisan Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("shiftCount", "Mesai Kaydi", currentShifts.length, previousShifts.length),
        this.createCard("lateMinutes", "Gec Kalma", currentLate, previousLate),
        this.createCard("overtime", "Fazla Mesai", currentOvertime, previousOvertime),
        this.createCard("activeGoals", "Aktif Hedef", currentGoals.length, 0),
      ],
      comparisonSummary: this.createComparisonSummary(currentShifts.length, previousShifts.length),
      chart: this.buildEmployeeShiftChart(currentShifts, previousShifts, query.groupBy ?? "day"),
      comparisonTable: this.buildEmployeeBranchComparison(branches, currentShifts, previousShifts),
      tableColumns: [
        { key: "employeeName", label: "Personel" },
        { key: "branchName", label: "Sube" },
        { key: "shiftCount", label: "Mesai" },
        { key: "lateShiftCount", label: "Gec Giris" },
        { key: "lateMinutes", label: "Gec" },
        { key: "overtimeMinutes", label: "Fazla Mesai" },
        { key: "goalProgress", label: "Hedef %" },
      ],
      table,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getShiftReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });

    const [currentShifts, previousShifts] = await Promise.all([
      this.prisma.shift.findMany({
        where: { branchId: { in: branchIds }, scheduledStartAt: { gte: current.start, lte: current.end } },
        include: { branch: true, employeeProfile: { include: { user: true } } },
      }),
      this.prisma.shift.findMany({
        where: { branchId: { in: branchIds }, scheduledStartAt: { gte: previous.start, lte: previous.end } },
        include: { branch: true, employeeProfile: { include: { user: true } } },
      }),
    ]);

    let rows = currentShifts.map((shift) => ({
      id: shift.id,
      employeeName: shift.employeeProfile.user?.fullName ?? shift.employeeProfile.employeeCode,
      branchName: shift.branch.name,
      scheduledStartAt: shift.scheduledStartAt.toISOString(),
      scheduledEndAt: shift.scheduledEndAt.toISOString(),
      lateMinutes: shift.lateMinutes,
      overtimeMinutes: shift.overtimeMinutes,
      totalBreakMinutes: shift.totalBreakMinutes,
      approvalStatus: shift.approvalStatus,
    }));
    if (query.search) {
      const lowered = query.search.toLowerCase();
      rows = rows.filter((row) => row.employeeName.toLowerCase().includes(lowered) || row.branchName.toLowerCase().includes(lowered));
    }
    rows = rows.slice(0, query.limit ?? 100);

    return {
      report: "shift-reports",
      title: "Mesai Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("shiftCount", "Mesai Sayisi", currentShifts.length, previousShifts.length),
        this.createCard("lateEntries", "Gec Giris", currentShifts.filter((shift) => shift.lateMinutes > 0).length, previousShifts.filter((shift) => shift.lateMinutes > 0).length),
        this.createCard("lateMinutes", "Toplam Gecikme", currentShifts.reduce((sum, shift) => sum + shift.lateMinutes, 0), previousShifts.reduce((sum, shift) => sum + shift.lateMinutes, 0)),
        this.createCard("overtime", "Fazla Mesai", currentShifts.reduce((sum, shift) => sum + shift.overtimeMinutes, 0), previousShifts.reduce((sum, shift) => sum + shift.overtimeMinutes, 0)),
      ],
      comparisonSummary: this.createComparisonSummary(currentShifts.length, previousShifts.length),
      chart: this.buildEmployeeShiftChart(currentShifts, previousShifts, query.groupBy ?? "day"),
      comparisonTable: this.buildEmployeeBranchComparison(branches, currentShifts, previousShifts),
      tableColumns: [
        { key: "employeeName", label: "Personel" },
        { key: "branchName", label: "Sube" },
        { key: "scheduledStartAt", label: "Baslangic" },
        { key: "scheduledEndAt", label: "Bitis" },
        { key: "lateMinutes", label: "Gecikme" },
        { key: "overtimeMinutes", label: "Fazla Mesai" },
        { key: "approvalStatus", label: "Onay" },
      ],
      table: rows,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    };
  }

  private async getGoalBonusReport(query: ReportQueryDto, actor: AuthenticatedUser) {
    const { current, previous } = this.resolveReportRanges(query);
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, orderBy: { name: "asc" } });

    const [currentGoals, previousGoals, currentBonuses] = await Promise.all([
      this.goalProgressService.getGoalsForRange(branchIds, current),
      this.goalProgressService.getGoalsForRange(branchIds, previous),
      this.prisma.goalBonus.findMany({
        where: {
          branchId: { in: branchIds },
          createdAt: { gte: current.start, lte: current.end },
        },
        include: {
          goal: { include: { branch: true, employeeProfile: { include: { user: true } } } },
          branch: true,
          employeeProfile: { include: { user: true } },
        },
      }),
    ]);

    const currentCompleted = currentGoals.filter((goal) => goal.status === "completed");
    const previousCompleted = previousGoals.filter((goal) => goal.status === "completed");
    const currentBonusAmount = currentBonuses.reduce((sum, bonus) => sum + Number(bonus.calculatedAmount), 0);
    const pendingBonusCount = currentBonuses.filter((bonus) => bonus.status === "pending_approval").length;
    const approvedBonusAmount = currentBonuses
      .filter((bonus) => bonus.status === "approved" || bonus.status === "posted")
      .reduce((sum, bonus) => sum + Number(bonus.calculatedAmount), 0);

    const table = currentGoals
      .map((goal) => {
        const overview = this.goalProgressService.toOverview(goal);
        return {
          id: goal.id,
          title: goal.title,
          branchName: goal.branch.name,
          ownerName: goal.employeeProfile?.user?.fullName ?? goal.employeeProfile?.employeeCode ?? "Genel isletme",
          goalType: overview.goalTypeLabel,
          goalScope: overview.goalScopeLabel,
          targetValue: overview.targetValue,
          currentValue: overview.currentValue,
          progressRate: overview.progressRate,
          statusLabel: overview.statusLabel,
          bonusAmount: overview.bonusAmount,
          bonusStatus: goal.bonus?.status ?? "-",
          endsAt: goal.endsAt.toISOString(),
        };
      })
      .filter((row) => {
        if (!query.search) return true;
        const lowered = query.search.toLowerCase();
        return (
          row.title.toLowerCase().includes(lowered) ||
          row.branchName.toLowerCase().includes(lowered) ||
          row.ownerName.toLowerCase().includes(lowered) ||
          row.goalType.toLowerCase().includes(lowered)
        );
      })
      .slice(0, query.limit ?? 100);

    return {
      report: "goal-bonus-reports",
      title: "Hedef & Prim Raporlari",
      filters: this.buildFiltersPayload(query, current, previous),
      cards: [
        this.createCard("goalCount", "Aktif / Donem Hedefi", currentGoals.length, previousGoals.length),
        this.createCard("completedGoals", "Tamamlanan Hedef", currentCompleted.length, previousCompleted.length),
        this.createCard("bonusAmount", "Olusan Prim", currentBonusAmount, 0),
        this.createCard("pendingBonusCount", "Onay Bekleyen Prim", pendingBonusCount, 0),
      ],
      comparisonSummary: this.createComparisonSummary(currentCompleted.length, previousCompleted.length),
      chart: this.buildGoalBonusChart(currentGoals, previousGoals, query.groupBy ?? "day"),
      comparisonTable: this.buildGoalBonusBranchComparison(branches, currentGoals, currentBonuses),
      tableColumns: [
        { key: "title", label: "Hedef" },
        { key: "branchName", label: "Sube" },
        { key: "ownerName", label: "Sorumlu" },
        { key: "goalType", label: "Tip" },
        { key: "goalScope", label: "Kapsam" },
        { key: "targetValue", label: "Hedef" },
        { key: "currentValue", label: "Mevcut" },
        { key: "progressRate", label: "%" },
        { key: "statusLabel", label: "Durum" },
        { key: "bonusAmount", label: "Prim" },
        { key: "bonusStatus", label: "Prim Durumu" },
      ],
      table,
      branchOptions: branches.map((branch) => ({ id: branch.id, name: branch.name })),
      approvedBonusAmount,
    };
  }

  private resolveDateRange(dateFrom?: string, dateTo?: string) {
    const end = dateTo ? new Date(dateTo) : new Date();
    const start = dateFrom ? new Date(dateFrom) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private resolveReportRanges(query: ReportQueryDto) {
    const current = this.resolveDateRange(query.dateFrom, query.dateTo);
    if (query.compareFrom || query.compareTo) {
      return {
        current,
        previous: this.resolveDateRange(query.compareFrom, query.compareTo),
      };
    }

    const diff = current.end.getTime() - current.start.getTime();
    const previousEnd = new Date(current.start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - diff);
    previousStart.setHours(0, 0, 0, 0);
    previousEnd.setHours(23, 59, 59, 999);
    return { current, previous: { start: previousStart, end: previousEnd } };
  }

  private async resolveBranchIds(actor: AuthenticatedUser, branchId?: string) {
    if (!branchId) {
      return actor.branchIds;
    }

    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Istenen sube icin rapor yetkisi bulunamadi.");
    }

    return [branchId];
  }

  private async fetchPaidTickets(companyId: string, branchIds: string[], start: Date, end: Date) {
    return this.prisma.ticket.findMany({
      where: {
        companyId,
        branchId: { in: branchIds },
        status: "PAID",
        closedAt: { gte: start, lte: end },
      },
      include: {
        branch: true,
        customer: true,
        payments: true,
      },
      orderBy: { closedAt: "asc" },
    });
  }

  private async fetchCompletedPayments(branchIds: string[], start: Date, end: Date) {
    return this.prisma.payment.findMany({
      where: {
        status: "COMPLETED",
        paidAt: { gte: start, lte: end },
        ticket: { branchId: { in: branchIds } },
      },
      include: {
        ticket: { include: { branch: true } },
        account: true,
      },
      orderBy: { paidAt: "asc" },
    });
  }

  private buildFiltersPayload(query: ReportQueryDto, current: { start: Date; end: Date }, previous: { start: Date; end: Date }) {
    return {
      branchId: query.branchId ?? null,
      dateFrom: current.start.toISOString(),
      dateTo: current.end.toISOString(),
      compareFrom: previous.start.toISOString(),
      compareTo: previous.end.toISOString(),
      search: query.search ?? "",
      sortBy: query.sortBy ?? "",
      sortDirection: query.sortDirection ?? "desc",
      groupBy: query.groupBy ?? "day",
    };
  }

  private aggregatePaymentMethodRows(payments: any[]) {
    const map = new Map<string, { method: string; methodLabel: string; amount: number; count: number; averageAmount: number }>();
    for (const payment of payments) {
      const key = payment.method;
      const current = map.get(key) ?? {
        method: key,
        methodLabel: this.formatPaymentMethod(key),
        amount: 0,
        count: 0,
        averageAmount: 0,
      };
      current.amount += Number(payment.amount);
      current.count += 1;
      current.averageAmount = current.count > 0 ? current.amount / current.count : 0;
      map.set(key, current);
    }
    return map;
  }

  private buildExpenseDetailRows(expenses: any[], payroll: any[], other: any[], search?: string) {
    let rows = [
      ...expenses.map((item) => ({
        id: item.id,
        title: item.title,
        branchName: item.branch.name,
        category: item.category,
        expenseTypeLabel: item.expenseType === "fixed_cost" ? "Sabit Gider" : "Gider",
        amount: Number(item.amount),
        date: item.expenseDate.toISOString(),
      })),
      ...payroll.map((item) => ({
        id: item.id,
        title: item.employeeProfile.user?.fullName ?? item.employeeProfile.employeeCode,
        branchName: item.branch.name,
        category: "maas",
        expenseTypeLabel: "Personel",
        amount: Number(item.amount),
        date: item.paymentDate.toISOString(),
      })),
      ...other.map((item) => ({
        id: item.id,
        title: item.title,
        branchName: item.branch.name,
        category: item.category ?? "diger",
        expenseTypeLabel: "Diger",
        amount: Number(item.amount),
        date: item.paymentDate.toISOString(),
      })),
    ];
    if (search) {
      const lowered = search.toLowerCase();
      rows = rows.filter((row) => row.title.toLowerCase().includes(lowered) || row.branchName.toLowerCase().includes(lowered) || row.category.toLowerCase().includes(lowered));
    }
    return rows.sort((left, right) => (left.date < right.date ? 1 : -1));
  }

  private createCard(key: string, label: string, current: number, previous: number) {
    const deltaValue = current - previous;
    const deltaRate = previous === 0 ? (current > 0 ? 100 : 0) : (deltaValue / previous) * 100;
    return {
      key,
      label,
      value: current,
      previousValue: previous,
      deltaValue,
      deltaRate,
    };
  }

  private createComparisonSummary(currentValue: number, previousValue: number) {
    const deltaValue = currentValue - previousValue;
    const deltaRate = previousValue === 0 ? (currentValue > 0 ? 100 : 0) : (deltaValue / previousValue) * 100;
    return {
      currentValue,
      previousValue,
      deltaValue,
      deltaRate,
      tone: deltaValue >= 0 ? "success" : "danger",
    };
  }

  private buildTicketChart(currentTickets: any[], previousTickets: any[], groupBy: "day" | "week" | "month" | "year") {
    const currentMap = this.aggregateTicketBuckets(currentTickets, groupBy);
    const previousMap = this.aggregateTicketBuckets(previousTickets, groupBy);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Secili donem",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private aggregateTicketBuckets(tickets: any[], groupBy: "day" | "week" | "month" | "year") {
    const map = new Map<string, { label: string; value: number }>();
    for (const ticket of tickets) {
      const date = ticket.closedAt ?? ticket.openedAt;
      const key = this.createBucketKey(date, groupBy);
      const current = map.get(key) ?? { label: this.createBucketLabel(date, groupBy), value: 0 };
      current.value += Number(ticket.grandTotal);
      map.set(key, current);
    }
    return map;
  }

  private buildBranchTicketComparison(branches: Array<{ id: string; name: string }>, currentTickets: any[], previousTickets: any[]) {
    return branches.map((branch) => {
      const currentRows = currentTickets.filter((ticket) => ticket.branchId === branch.id);
      const previousRows = previousTickets.filter((ticket) => ticket.branchId === branch.id);
      const currentRevenue = currentRows.reduce((sum, ticket) => sum + Number(ticket.grandTotal), 0);
      const previousRevenue = previousRows.reduce((sum, ticket) => sum + Number(ticket.grandTotal), 0);
      return {
        label: branch.name,
        currentValue: currentRevenue,
        previousValue: previousRevenue,
        deltaValue: currentRevenue - previousRevenue,
        ticketCount: currentRows.length,
      };
    });
  }

  private buildBranchPaymentComparison(branches: Array<{ id: string; name: string }>, currentPayments: any[], previousPayments: any[]) {
    return branches.map((branch) => {
      const currentRows = currentPayments.filter((payment) => payment.ticket.branchId === branch.id);
      const previousRows = previousPayments.filter((payment) => payment.ticket.branchId === branch.id);
      return {
        label: branch.name,
        currentValue: currentRows.reduce((sum, payment) => sum + Number(payment.amount), 0),
        previousValue: previousRows.reduce((sum, payment) => sum + Number(payment.amount), 0),
        deltaValue: currentRows.reduce((sum, payment) => sum + Number(payment.amount), 0) - previousRows.reduce((sum, payment) => sum + Number(payment.amount), 0),
        ticketCount: currentRows.length,
      };
    });
  }

  private aggregateProductRows(items: any[]) {
    const map = new Map<string, { id: string; productName: string; branchNames: string; quantity: number; revenue: number; taxTotal: number; averagePrice: number }>();
    for (const item of items) {
      const key = item.productName;
      const current = map.get(key) ?? {
        id: item.id,
        productName: item.productName,
        branchNames: "",
        quantity: 0,
        revenue: 0,
        taxTotal: 0,
        averagePrice: 0,
      };
      current.quantity += Number(item.quantity);
      current.revenue += Number(item.lineTotal);
      current.taxTotal += Number(item.taxTotal);
      current.branchNames = [...new Set([...current.branchNames.split(", ").filter(Boolean), item.ticket.branch.name])].join(", ");
      current.averagePrice = current.quantity > 0 ? current.revenue / current.quantity : 0;
      map.set(key, current);
    }
    return map;
  }

  private buildBranchProductComparison(branches: Array<{ id: string; name: string }>, currentItems: any[], previousItems: any[]) {
    return branches.map((branch) => {
      const currentRows = currentItems.filter((item) => item.ticket.branchId === branch.id);
      const previousRows = previousItems.filter((item) => item.ticket.branchId === branch.id);
      return {
        label: branch.name,
        currentValue: currentRows.reduce((sum, item) => sum + Number(item.lineTotal), 0),
        previousValue: previousRows.reduce((sum, item) => sum + Number(item.lineTotal), 0),
        deltaValue: currentRows.reduce((sum, item) => sum + Number(item.lineTotal), 0) - previousRows.reduce((sum, item) => sum + Number(item.lineTotal), 0),
        ticketCount: currentRows.reduce((sum, item) => sum + Number(item.quantity), 0),
      };
    });
  }

  private aggregateProfitabilityRows(items: any[]) {
    const map = new Map<string, { id: string; productName: string; branchNames: string; quantity: number; revenue: number; cost: number; grossProfit: number; marginRate: number }>();
    for (const item of items) {
      const key = item.productName;
      const current = map.get(key) ?? {
        id: item.id,
        productName: item.productName,
        branchNames: "",
        quantity: 0,
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        marginRate: 0,
      };
      const theoreticalUnitCost = this.calculateRecipeTheoreticalUnitCost(item.product?.recipe?.items ?? []);
      const quantity = Number(item.quantity);
      current.quantity += quantity;
      current.revenue += Number(item.lineTotal);
      current.cost += theoreticalUnitCost * quantity;
      current.grossProfit = current.revenue - current.cost;
      current.marginRate = current.revenue > 0 ? (current.grossProfit / current.revenue) * 100 : 0;
      current.branchNames = [...new Set([...current.branchNames.split(", ").filter(Boolean), item.ticket.branch.name])].join(", ");
      map.set(key, current);
    }
    return map;
  }

  private calculateRecipeTheoreticalUnitCost(recipeItems: any[]) {
    return recipeItems.reduce((sum: number, item: any) => {
      const quantity = Number(item.quantity ?? 0);
      const unitCost = Number(item.inventoryItem?.stockEntries?.[0]?.unitCost ?? 0);
      return sum + quantity * unitCost;
    }, 0);
  }

  private buildProfitabilityBranchComparison(branches: Array<{ id: string; name: string }>, items: any[]) {
    return branches.map((branch) => {
      const branchItems = items.filter((item) => item.ticket.branchId === branch.id);
      const revenue = branchItems.reduce((sum, item) => sum + Number(item.lineTotal), 0);
      const cost = branchItems.reduce((sum, item) => sum + this.calculateRecipeTheoreticalUnitCost(item.product?.recipe?.items ?? []) * Number(item.quantity), 0);
      return {
        label: branch.name,
        currentValue: revenue,
        previousValue: cost,
        deltaValue: revenue - cost,
        ticketCount: branchItems.reduce((sum, item) => sum + Number(item.quantity), 0),
      };
    });
  }

  private buildEntryChart(currentEntries: any[], previousEntries: any[], groupBy: "day" | "week" | "month" | "year") {
    const createMap = (entries: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      for (const entry of entries) {
        const key = this.createBucketKey(entry.createdAt, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(entry.createdAt, groupBy), value: 0 };
        current.value += Math.abs(Number(entry.quantity));
        map.set(key, current);
      }
      return map;
    };
    const currentMap = createMap(currentEntries);
    const previousMap = createMap(previousEntries);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Secili donem",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildConsumptionChart(currentEntries: any[], previousEntries: any[], groupBy: "day" | "week" | "month" | "year") {
    const createMap = (entries: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      for (const entry of entries) {
        const key = this.createBucketKey(entry.createdAt, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(entry.createdAt, groupBy), value: 0 };
        current.value += Math.abs(this.computeStockEffect(entry.entryType, Number(entry.quantity)));
        map.set(key, current);
      }
      return map;
    };
    const currentMap = createMap(currentEntries);
    const previousMap = createMap(previousEntries);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Tuketim",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildWarehouseStockComparison(branches: Array<{ id: string; name: string }>, items: any[]) {
    return branches.map((branch) => {
      const scoped = items.filter((item) => item.warehouse.branchId === branch.id);
      return {
        label: branch.name,
        currentValue: scoped.reduce((sum, item) => sum + Number(item.currentStock), 0),
        previousValue: scoped.reduce((sum, item) => sum + Number(item.minimumLevel), 0),
        deltaValue: scoped.filter((item) => Number(item.currentStock) <= Number(item.minimumLevel)).length,
        ticketCount: scoped.length,
      };
    });
  }

  private buildExpenseChart(currentExpenses: any[], currentPayroll: any[], currentOther: any[], previousExpenses: any[], previousPayroll: any[], previousOther: any[], groupBy: "day" | "week" | "month" | "year") {
    const makeMap = (expenses: any[], payroll: any[], other: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      const apply = (date: Date, amount: number) => {
        const key = this.createBucketKey(date, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(date, groupBy), value: 0 };
        current.value += amount;
        map.set(key, current);
      };
      for (const item of expenses) apply(item.expenseDate, Number(item.amount));
      for (const item of payroll) apply(item.paymentDate, Number(item.amount));
      for (const item of other) apply(item.paymentDate, Number(item.amount));
      return map;
    };
    const currentMap = makeMap(currentExpenses, currentPayroll, currentOther);
    const previousMap = makeMap(previousExpenses, previousPayroll, previousOther);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Gider",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildExpenseBranchComparison(branches: Array<{ id: string; name: string }>, currentExpenses: any[], currentPayroll: any[], currentOther: any[], previousExpenses: any[], previousPayroll: any[], previousOther: any[]) {
    return branches.map((branch) => {
      const currentValue =
        currentExpenses.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0) +
        currentPayroll.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0) +
        currentOther.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0);
      const previousValue =
        previousExpenses.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0) +
        previousPayroll.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0) +
        previousOther.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0);
      return {
        label: branch.name,
        currentValue,
        previousValue,
        deltaValue: currentValue - previousValue,
        ticketCount: currentExpenses.filter((item) => item.branchId === branch.id).length + currentPayroll.filter((item) => item.branchId === branch.id).length + currentOther.filter((item) => item.branchId === branch.id).length,
      };
    });
  }

  private buildCashClosureChart(currentClosures: any[], previousClosures: any[], groupBy: "day" | "week" | "month" | "year") {
    const createMap = (closures: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      for (const closure of closures) {
        const key = this.createBucketKey(closure.closureDate, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(closure.closureDate, groupBy), value: 0 };
        current.value += Number(closure.varianceAmount);
        map.set(key, current);
      }
      return map;
    };
    const currentMap = createMap(currentClosures);
    const previousMap = createMap(previousClosures);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Kasa farki",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildCashClosureBranchComparison(branches: Array<{ id: string; name: string }>, currentClosures: any[], previousClosures: any[]) {
    return branches.map((branch) => {
      const currentRows = currentClosures.filter((item) => item.branchId === branch.id);
      const previousRows = previousClosures.filter((item) => item.branchId === branch.id);
      return {
        label: branch.name,
        currentValue: currentRows.reduce((sum, item) => sum + Number(item.varianceAmount), 0),
        previousValue: previousRows.reduce((sum, item) => sum + Number(item.varianceAmount), 0),
        deltaValue:
          currentRows.reduce((sum, item) => sum + Number(item.varianceAmount), 0) - previousRows.reduce((sum, item) => sum + Number(item.varianceAmount), 0),
        ticketCount: currentRows.length,
      };
    });
  }

  private buildDiscountChart(currentTickets: any[], previousTickets: any[], groupBy: "day" | "week" | "month" | "year") {
    const createMap = (tickets: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      for (const ticket of tickets) {
        const date = ticket.closedAt ?? ticket.openedAt;
        const key = this.createBucketKey(date, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(date, groupBy), value: 0 };
        current.value += Number(ticket.discountTotal);
        map.set(key, current);
      }
      return map;
    };
    const currentMap = createMap(currentTickets);
    const previousMap = createMap(previousTickets);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Iskonto",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildDiscountBranchComparison(branches: Array<{ id: string; name: string }>, currentTickets: any[], previousTickets: any[]) {
    return branches.map((branch) => {
      const currentRows = currentTickets.filter((ticket) => ticket.branchId === branch.id);
      const previousRows = previousTickets.filter((ticket) => ticket.branchId === branch.id);
      return {
        label: branch.name,
        currentValue: currentRows.reduce((sum, ticket) => sum + Number(ticket.discountTotal), 0),
        previousValue: previousRows.reduce((sum, ticket) => sum + Number(ticket.discountTotal), 0),
        deltaValue:
          currentRows.reduce((sum, ticket) => sum + Number(ticket.discountTotal), 0) -
          previousRows.reduce((sum, ticket) => sum + Number(ticket.discountTotal), 0),
        ticketCount: currentRows.length,
      };
    });
  }

  private buildFinanceChart(
    currentPayments: any[],
    currentExpenses: any[],
    currentPayroll: any[],
    currentOther: any[],
    previousPayments: any[],
    previousExpenses: any[],
    previousPayroll: any[],
    previousOther: any[],
    groupBy: "day" | "week" | "month" | "year",
  ) {
    const makeNetMap = (payments: any[], expenses: any[], payroll: any[], other: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      const apply = (date: Date, amount: number) => {
        const key = this.createBucketKey(date, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(date, groupBy), value: 0 };
        current.value += amount;
        map.set(key, current);
      };
      for (const item of payments) apply(item.paidAt ?? new Date(), Number(item.amount));
      for (const item of expenses) apply(item.expenseDate, -Number(item.amount));
      for (const item of payroll) apply(item.paymentDate, -Number(item.amount));
      for (const item of other) apply(item.paymentDate, -Number(item.amount));
      return map;
    };
    const currentMap = makeNetMap(currentPayments, currentExpenses, currentPayroll, currentOther);
    const previousMap = makeNetMap(previousPayments, previousExpenses, previousPayroll, previousOther);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Net akis",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildFinanceBranchComparison(branches: Array<{ id: string; name: string }>, payments: any[], expenses: any[], payroll: any[], other: any[]) {
    return branches.map((branch) => {
      const collection = payments.filter((item) => item.ticket.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0);
      const expense = expenses.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0);
      const payrollAmount = payroll.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0);
      const otherAmount = other.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0);
      const outflow = expense + payrollAmount + otherAmount;
      return {
        label: branch.name,
        currentValue: collection,
        previousValue: outflow,
        deltaValue: collection - outflow,
        ticketCount: 0,
      };
    });
  }

  private calculateMonthlyCommitment(amount: number, recurrenceType: string) {
    const multiplierMap: Record<string, number> = {
      once: 0,
      daily: 30,
      weekly: 4.33,
      monthly: 1,
      quarterly: 1 / 3,
      yearly: 1 / 12,
    };
    return Math.round((amount * (multiplierMap[recurrenceType] ?? 0) + Number.EPSILON) * 100) / 100;
  }

  private buildLedgerSummaryRows(entries: any[]) {
    const map = new Map<string, { id: string; accountName: string; branchName: string; debit: number; credit: number; balance: number }>();
    for (const entry of entries) {
      const key = `${entry.accountId}:${entry.branchId}`;
      const current = map.get(key) ?? {
        id: key,
        accountName: entry.account.name,
        branchName: entry.branch.name,
        debit: 0,
        credit: 0,
        balance: 0,
      };
      current.debit += Number(entry.debit);
      current.credit += Number(entry.credit);
      current.balance = current.debit - current.credit;
      map.set(key, current);
    }
    return [...map.values()].sort((left, right) => right.balance - left.balance);
  }

  private buildEmployeeSummaryRows(currentShifts: any[], goals: any[], tasks: any[], search?: string) {
    const map = new Map<string, { id: string; employeeName: string; branchName: string; shiftCount: number; lateShiftCount: number; lateMinutes: number; overtimeMinutes: number; goalProgress: number; taskCount: number }>();
    for (const shift of currentShifts) {
      const employeeName = shift.employeeProfile.user?.fullName ?? shift.employeeProfile.employeeCode;
      const key = shift.employeeProfileId;
      const current = map.get(key) ?? {
        id: key,
        employeeName,
        branchName: shift.branch.name,
        shiftCount: 0,
        lateShiftCount: 0,
        lateMinutes: 0,
        overtimeMinutes: 0,
        goalProgress: 0,
        taskCount: tasks.filter((task) => task.userId === shift.employeeProfile.userId).length,
      };
      current.shiftCount += 1;
      current.lateShiftCount += shift.lateMinutes > 0 ? 1 : 0;
      current.lateMinutes += shift.lateMinutes;
      current.overtimeMinutes += shift.overtimeMinutes;
      map.set(key, current);
    }

    for (const goal of goals) {
      const current = map.get(goal.employeeProfileId);
      const ratio = Number(goal.targetValue) > 0 ? (Number(goal.currentValue) / Number(goal.targetValue)) * 100 : 0;
      if (current) {
        current.goalProgress = Math.round((current.goalProgress + ratio) / (current.goalProgress > 0 ? 2 : 1));
      } else {
        map.set(goal.employeeProfileId, {
          id: goal.employeeProfileId,
          employeeName: goal.employeeProfile.user?.fullName ?? goal.employeeProfile.employeeCode,
          branchName: goal.employeeProfile.branch.name,
          shiftCount: 0,
          lateShiftCount: 0,
          lateMinutes: 0,
          overtimeMinutes: 0,
          goalProgress: Math.round(ratio),
          taskCount: tasks.filter((task) => task.userId === goal.employeeProfile.userId).length,
        });
      }
    }

    let rows = [...map.values()];
    if (search) {
      const lowered = search.toLowerCase();
      rows = rows.filter((row) => row.employeeName.toLowerCase().includes(lowered) || row.branchName.toLowerCase().includes(lowered));
    }
    return rows.sort((left, right) => right.shiftCount - left.shiftCount);
  }

  private buildEmployeeShiftChart(currentShifts: any[], previousShifts: any[], groupBy: "day" | "week" | "month" | "year") {
    const createMap = (rows: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      for (const shift of rows) {
        const key = this.createBucketKey(shift.scheduledStartAt, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(shift.scheduledStartAt, groupBy), value: 0 };
        current.value += 1;
        map.set(key, current);
      }
      return map;
    };
    const currentMap = createMap(currentShifts);
    const previousMap = createMap(previousShifts);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Mesai sayisi",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildEmployeeBranchComparison(branches: Array<{ id: string; name: string }>, currentShifts: any[], previousShifts: any[]) {
    return branches.map((branch) => {
      const currentRows = currentShifts.filter((shift) => shift.branchId === branch.id);
      const previousRows = previousShifts.filter((shift) => shift.branchId === branch.id);
      const currentLate = currentRows.reduce((sum, shift) => sum + shift.lateMinutes, 0);
      const previousLate = previousRows.reduce((sum, shift) => sum + shift.lateMinutes, 0);
      return {
        label: branch.name,
        currentValue: currentRows.length,
        previousValue: previousRows.length,
        deltaValue: currentLate - previousLate,
        ticketCount: currentRows.reduce((sum, shift) => sum + shift.overtimeMinutes, 0),
      };
    });
  }

  private buildGoalBonusChart(currentGoals: any[], previousGoals: any[], groupBy: "day" | "week" | "month" | "year") {
    const createMap = (rows: any[]) => {
      const map = new Map<string, { label: string; value: number }>();
      for (const goal of rows) {
        const date = goal.completedAt ?? goal.endsAt;
        const key = this.createBucketKey(date, groupBy);
        const current = map.get(key) ?? { label: this.createBucketLabel(date, groupBy), value: 0 };
        current.value += goal.status === "completed" ? 1 : 0;
        map.set(key, current);
      }
      return map;
    };

    const currentMap = createMap(currentGoals);
    const previousMap = createMap(previousGoals);
    const keys = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
    return {
      groupBy,
      currentLabel: "Tamamlanan hedef",
      previousLabel: "Karsilastirma",
      points: keys.map((key) => ({
        label: currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? key,
        current: currentMap.get(key)?.value ?? 0,
        previous: previousMap.get(key)?.value ?? 0,
      })),
    };
  }

  private buildGoalBonusBranchComparison(branches: Array<{ id: string; name: string }>, goals: any[], bonuses: any[]) {
    return branches.map((branch) => {
      const branchGoals = goals.filter((goal) => goal.branchId === branch.id);
      const branchBonuses = bonuses.filter((bonus) => bonus.branchId === branch.id);
      return {
        label: branch.name,
        currentValue: branchGoals.filter((goal) => goal.status === "completed").length,
        previousValue: branchGoals.length,
        deltaValue: branchBonuses.reduce((sum, bonus) => sum + Number(bonus.calculatedAmount), 0),
        ticketCount: branchBonuses.filter((bonus) => bonus.status === "pending_approval").length,
      };
    });
  }

  private aggregateConsumptionRows(entries: any[]) {
    const map = new Map<string, { id: string; itemName: string; branchNames: string; quantity: number; cost: number; movementCount: number; unit: string }>();
    for (const entry of entries) {
      const effect = this.computeStockEffect(entry.entryType, Number(entry.quantity));
      const quantity = Math.abs(effect);
      const key = entry.inventoryItem.name;
      const current = map.get(key) ?? {
        id: entry.inventoryItem.id,
        itemName: entry.inventoryItem.name,
        branchNames: "",
        quantity: 0,
        cost: 0,
        movementCount: 0,
        unit: entry.inventoryItem.unit.symbol,
      };
      current.quantity += quantity;
      current.cost += quantity * Number(entry.unitCost ?? 0);
      current.movementCount += 1;
      current.branchNames = [...new Set([...current.branchNames.split(", ").filter(Boolean), entry.warehouse.branch.name])].join(", ");
      map.set(key, current);
    }
    return map;
  }

  private buildConsumptionBranchComparison(branches: Array<{ id: string; name: string }>, currentEntries: any[], previousEntries: any[]) {
    return branches.map((branch) => {
      const currentRows = currentEntries.filter((entry) => entry.warehouse.branchId === branch.id);
      const previousRows = previousEntries.filter((entry) => entry.warehouse.branchId === branch.id);
      return {
        label: branch.name,
        currentValue: currentRows.reduce((sum, entry) => sum + Math.abs(this.computeStockEffect(entry.entryType, Number(entry.quantity))), 0),
        previousValue: previousRows.reduce((sum, entry) => sum + Math.abs(this.computeStockEffect(entry.entryType, Number(entry.quantity))), 0),
        deltaValue:
          currentRows.reduce((sum, entry) => sum + Number(entry.unitCost ?? 0) * Math.abs(this.computeStockEffect(entry.entryType, Number(entry.quantity))), 0) -
          previousRows.reduce((sum, entry) => sum + Number(entry.unitCost ?? 0) * Math.abs(this.computeStockEffect(entry.entryType, Number(entry.quantity))), 0),
        ticketCount: currentRows.length,
      };
    });
  }

  private sortRows<T extends Record<string, unknown>>(rows: T[], sortBy: string, sortDirection: "asc" | "desc") {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const leftValue = left[sortBy] as number | string;
      const rightValue = right[sortBy] as number | string;
      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return 0;
    });
  }

  private formatShortDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private getValueByPath(item: Record<string, unknown>, path: string) {
    return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), item);
  }

  private createBucketKey(date: Date, groupBy: "day" | "week" | "month" | "year") {
    if (groupBy === "year") {
      return `${date.getFullYear()}`;
    }
    if (groupBy === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    if (groupBy === "week") {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      return startOfWeek.toISOString().slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
  }

  private createBucketLabel(date: Date, groupBy: "day" | "week" | "month" | "year") {
    if (groupBy === "year") {
      return `${date.getFullYear()}`;
    }
    if (groupBy === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    if (groupBy === "week") {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return `Hafta ${startOfWeek.toISOString().slice(5, 10)}`;
    }

    return date.toISOString().slice(5, 10);
  }

  private computeStockEffect(entryType: string, quantity: number) {
    const outbound = new Set(["sale", "waste", "adjustment_out", "transfer_out"]);
    const inbound = new Set(["purchase", "adjustment_in", "transfer_in", "sale_reversal"]);
    if (outbound.has(entryType)) return -quantity;
    if (inbound.has(entryType)) return quantity;
    return quantity;
  }

  private formatPaymentMethod(method: string) {
    switch (method) {
      case "CASH":
        return "Nakit";
      case "CREDIT_CARD":
        return "Kredi Karti";
      case "MEAL_CARD":
        return "Yemek Karti";
      case "GIFT_CARD":
        return "Hediye Kart";
      case "BANK_TRANSFER":
        return "Havale / EFT";
      default:
        return "Diger";
    }
  }
}
