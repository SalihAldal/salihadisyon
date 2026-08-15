import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { aggregatePaymentMethods, roundCurrency, sumTicketDiscount, sumTicketRevenue } from "../../common/reporting/accounting.utils";
import { toCsv } from "../../common/utils/csv";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { GoalProgressService } from "../staff/goal-progress.service";
import { DashboardExportDto } from "./dto/dashboard-export.dto";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalProgressService: GoalProgressService,
  ) {}

  async getOverview(query: DashboardQueryDto, actor: AuthenticatedUser) {
    const range = this.resolveDateRange(query.dateFrom, query.dateTo);
    const todayRange = this.resolveTodayRange();
    const branchIds = await this.resolveBranchIds(actor, query.branchId);
    const widgetVisibility = this.resolveWidgetVisibility(actor);
    const canManageStaff = actor.permissions.includes("staff.manage") || actor.role === "super_admin";

    const [
      branchRecords,
      paidTickets,
      todoTasks,
      pendingTasks,
      shifts,
      stockAlerts,
      activeCampaigns,
      pendingCashClosures,
      employeeProfiles,
      activeFixedCosts,
      notifications,
      activeGoals,
      todayRevenueAgg,
      todayExpenseAgg,
      todayPayrollAgg,
      todayOtherAgg,
      topProducts,
      lowStockIngredients,
      recentStockMovements,
      lateShifts,
    ] =
      await Promise.all([
        this.prisma.branch.findMany({
          where: { id: { in: branchIds } },
          orderBy: { name: "asc" },
        }),
        this.prisma.ticket.findMany({
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
            payments: true,
          },
          orderBy: { closedAt: "asc" },
        }),
        this.prisma.task.findMany({
          where: {
            branchId: { in: branchIds },
            userId: actor.userId,
            OR: [{ dueAt: { gte: todayRange.start, lte: todayRange.end } }, { dueAt: null }],
            status: { not: "done" },
          },
          include: {
            branch: true,
            user: true,
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: 6,
        }),
        this.prisma.task.findMany({
          where: {
            branchId: { in: branchIds },
            ...(canManageStaff ? {} : { userId: actor.userId }),
            status: { not: "done" },
          },
          include: {
            branch: true,
            user: true,
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: 6,
        }),
        widgetVisibility.staff
          ? this.prisma.shift.findMany({
              where: {
                branchId: { in: branchIds },
                scheduledStartAt: {
                  gte: range.start,
                  lte: range.end,
                },
              },
              include: {
                branch: true,
                employeeProfile: {
                  include: {
                    user: true,
                  },
                },
              },
              orderBy: { scheduledStartAt: "asc" },
              take: 8,
            })
          : Promise.resolve([]),
        widgetVisibility.inventory
          ? this.prisma.stockAlert.findMany({
              where: {
                branchId: { in: branchIds },
                status: "open",
              },
              include: {
                branch: true,
                inventoryItem: true,
              },
              orderBy: { createdAt: "desc" },
              take: 6,
            })
          : Promise.resolve([]),
        this.prisma.campaign.findMany({
          where: {
            branchId: { in: branchIds },
            startsAt: { lte: range.end },
            OR: [{ endsAt: null }, { endsAt: { gte: range.start } }],
          },
          include: {
            branch: true,
          },
          orderBy: { startsAt: "desc" },
          take: 6,
        }),
        this.prisma.cashClosure.findMany({
          where: {
            branchId: { in: branchIds },
            closureDate: {
              gte: range.start,
              lte: range.end,
            },
          },
          include: {
            branch: true,
          },
          orderBy: { closureDate: "desc" },
          take: 6,
        }),
        widgetVisibility.staff
          ? this.prisma.employeeProfile.findMany({
              where: {
                branchId: { in: branchIds },
                isActive: true,
                birthDate: { not: null },
              },
              include: {
                branch: true,
                user: true,
              },
            })
          : Promise.resolve([]),
        widgetVisibility.finance
          ? this.prisma.expense.findMany({
              where: {
                branchId: { in: branchIds },
                expenseType: "fixed_cost",
                isActive: true,
                OR: [{ endDate: null }, { endDate: { gte: range.start } }],
              },
              include: {
                branch: true,
              },
              orderBy: { amount: "desc" },
              take: 6,
            })
          : Promise.resolve([]),
        this.prisma.notification.findMany({
          where: {
            OR: [{ userId: actor.userId }, { userId: null, branchId: { in: branchIds } }],
          },
          include: { branch: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
        widgetVisibility.goals
          ? this.prisma.goal.findMany({
              where: {
                branchId: { in: branchIds },
                startsAt: { lte: range.end },
                endsAt: { gte: range.start },
              },
              include: { employeeProfile: { include: { user: true, branch: true } } },
              orderBy: { endsAt: "asc" },
              take: 8,
            })
          : Promise.resolve([]),
        widgetVisibility.finance
          ? this.prisma.ticket.aggregate({
              _sum: { grandTotal: true },
              _count: { id: true },
              where: {
                companyId: actor.tenantId,
                branchId: { in: branchIds },
                status: "PAID",
                closedAt: { gte: todayRange.start, lte: todayRange.end },
              },
            })
          : Promise.resolve({ _sum: { grandTotal: 0 }, _count: { id: 0 } }),
        widgetVisibility.finance
          ? this.prisma.expense.aggregate({
              _sum: { amount: true },
              where: {
                branchId: { in: branchIds },
                expenseType: "fixed_cost",
                expenseDate: { gte: todayRange.start, lte: todayRange.end },
              },
            })
          : Promise.resolve({ _sum: { amount: 0 } }),
        widgetVisibility.finance
          ? this.prisma.payrollPayment.aggregate({
              _sum: { amount: true },
              where: {
                branchId: { in: branchIds },
                movementType: "PAYMENT",
                deletedAt: null,
                paymentDate: { gte: todayRange.start, lte: todayRange.end },
              },
            })
          : Promise.resolve({ _sum: { amount: 0 } }),
        widgetVisibility.finance
          ? this.prisma.otherPayment.aggregate({
              _sum: { amount: true },
              where: {
                branchId: { in: branchIds },
                paymentDate: { gte: todayRange.start, lte: todayRange.end },
              },
            })
          : Promise.resolve({ _sum: { amount: 0 } }),
        this.prisma.ticketItem.groupBy({
          by: ["productId", "productName"],
          where: {
            ticket: {
              companyId: actor.tenantId,
              branchId: { in: branchIds },
              status: "PAID",
              closedAt: { gte: range.start, lte: range.end },
            },
          },
          _sum: {
            quantity: true,
            lineTotal: true,
          },
          orderBy: {
            _sum: {
              lineTotal: "desc",
            },
          },
          take: 6,
        }),
        widgetVisibility.inventory
          ? this.prisma.inventoryItem.findMany({
              where: {
                warehouse: { branchId: { in: branchIds } },
                recipeItems: { some: {} },
                isActive: true,
              },
              include: {
                warehouse: { include: { branch: true } },
                unit: true,
              },
              orderBy: [{ currentStock: "asc" }, { minimumLevel: "asc" }],
              take: 6,
            })
          : Promise.resolve([]),
        widgetVisibility.inventory
          ? this.prisma.stockEntry.findMany({
              where: {
                warehouse: { branchId: { in: branchIds } },
              },
              include: {
                warehouse: { include: { branch: true } },
                inventoryItem: { include: { unit: true } },
              },
              orderBy: { createdAt: "desc" },
              take: 8,
            })
          : Promise.resolve([]),
        widgetVisibility.staff
          ? this.prisma.shift.findMany({
              where: {
                branchId: { in: branchIds },
                actualStartAt: { gte: todayRange.start, lte: todayRange.end },
                lateMinutes: { gt: 0 },
              },
              include: {
                branch: true,
                employeeProfile: { include: { user: true } },
              },
              orderBy: [{ lateMinutes: "desc" }, { actualStartAt: "asc" }],
              take: 6,
            })
          : Promise.resolve([]),
      ]);

    const branchNameMap = new Map(branchRecords.map((branch) => [branch.id, branch.name]));
    const fixedCostSnapshot = this.buildFixedCostSnapshot(activeFixedCosts);
    const summaryCards = this.buildSummaryCards(paidTickets, branchIds.length, fixedCostSnapshot);
    const trend = this.buildTrend(paidTickets, branchIds, branchNameMap, query.granularity ?? "day", range);
    const branchComparison = this.buildBranchComparison(paidTickets, branchNameMap);
    const paymentBreakdown = this.buildPaymentBreakdown(paidTickets);
    const statusFlow = this.buildStatusFlow({
      pendingCashClosures,
      stockAlerts,
      activeCampaigns,
      tasks: pendingTasks,
      shifts,
    });
    const birthdays = this.buildUpcomingBirthdays(employeeProfiles).slice(0, 6);
    const financeSnapshot = this.buildFinanceSnapshot(
      Number(todayRevenueAgg._sum.grandTotal ?? 0),
      Number(todayExpenseAgg._sum.amount ?? 0),
      Number(todayPayrollAgg._sum.amount ?? 0),
      Number(todayOtherAgg._sum.amount ?? 0),
      fixedCostSnapshot.monthlyCommitment,
      todayRevenueAgg._count.id,
    );
    const syncedGoals = widgetVisibility.goals ? await this.goalProgressService.syncGoalSet(activeGoals.map((goal) => goal.id)) : [];
    const goalProgress = syncedGoals.map((goal) => this.goalProgressService.toOverview(goal));
    const eligibleBonuses = goalProgress.filter((goal) => goal.progressRate >= 100).slice(0, 6);

    return {
      filters: {
        branchId: query.branchId ?? null,
        dateFrom: range.start.toISOString(),
        dateTo: range.end.toISOString(),
        granularity: query.granularity ?? "day",
      },
      widgetVisibility,
      cards: summaryCards,
      trend,
      paymentBreakdown,
      branchComparison,
      todoItems: todoTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt?.toISOString() ?? null,
        status: task.status,
        statusLabel: this.getTaskStatusMeta(task.status, task.dueAt).label,
        statusTone: this.getTaskStatusMeta(task.status, task.dueAt).tone,
        priority: task.priority,
        priorityLabel: this.formatTaskPriority(task.priority),
        assigneeName: task.user.fullName,
        branchName: task.branch.name,
      })),
      pendingTasks: pendingTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt?.toISOString() ?? null,
        status: task.status,
        statusLabel: this.getTaskStatusMeta(task.status, task.dueAt).label,
        statusTone: this.getTaskStatusMeta(task.status, task.dueAt).tone,
        priority: task.priority,
        priorityLabel: this.formatTaskPriority(task.priority),
        assigneeName: task.user.fullName,
        branchName: task.branch.name,
      })),
      notifications: notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        branchName: notification.branch.name,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
      })),
      goalProgress,
      eligibleBonuses,
      financeSnapshot,
      lateStaff: lateShifts.map((shift) => ({
        id: shift.id,
        employeeName: shift.employeeProfile.user?.fullName ?? shift.employeeProfile.employeeCode,
        branchName: shift.branch.name,
        lateMinutes: shift.lateMinutes,
        scheduledStartAt: shift.scheduledStartAt.toISOString(),
        actualStartAt: shift.actualStartAt?.toISOString() ?? null,
      })),
      topProducts: topProducts.map((item) => ({
        id: item.productId ?? item.productName,
        productName: item.productName,
        quantity: Number(item._sum.quantity ?? 0),
        revenue: Number(item._sum.lineTotal ?? 0),
      })),
      lowStockIngredients: lowStockIngredients.map((item) => ({
        id: item.id,
        itemName: item.name,
        branchName: item.warehouse.branch.name,
        warehouseName: item.warehouse.name,
        currentStock: Number(item.currentStock),
        minimumLevel: Number(item.minimumLevel),
        unit: item.unit.symbol,
      })),
      recentStockMovements: recentStockMovements.map((entry) => ({
        id: entry.id,
        itemName: entry.inventoryItem.name,
        branchName: entry.warehouse.branch.name,
        warehouseName: entry.warehouse.name,
        entryType: entry.entryType,
        quantityEffect: this.computeStockEffect(entry.entryType, Number(entry.quantity)),
        unit: entry.inventoryItem.unit.symbol,
        createdAt: entry.createdAt.toISOString(),
      })),
      dailyShifts: shifts.map((shift) => ({
        id: shift.id,
        branchName: shift.branch.name,
        employeeName: shift.employeeProfile.user?.fullName ?? shift.employeeProfile.title ?? shift.employeeProfile.employeeCode,
        department: shift.employeeProfile.department ?? "Operasyon",
        scheduledStartAt: shift.scheduledStartAt.toISOString(),
        scheduledEndAt: shift.scheduledEndAt.toISOString(),
        totalBreakMinutes: shift.totalBreakMinutes,
        statusLabel: shift.actualStartAt ? (shift.lateMinutes > shift.employeeProfile.lateToleranceMinutes ? "Gec" : "Normal") : "Bekleniyor",
        statusTone: shift.actualStartAt ? (shift.lateMinutes > shift.employeeProfile.lateToleranceMinutes ? "danger" : "success") : "warning",
      })),
      upcomingBirthdays: birthdays,
      statusFlow,
      fixedCostSnapshot,
      criticalStockAlerts: stockAlerts.map((alert) => ({
        id: alert.id,
        branchName: alert.branch.name,
        itemName: alert.inventoryItem.name,
        currentStock: Number(alert.inventoryItem.currentStock),
        threshold: Number(alert.threshold),
        createdAt: alert.createdAt.toISOString(),
      })),
      activeCampaigns: activeCampaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        branchName: campaign.branch.name,
        type: campaign.type,
        startsAt: campaign.startsAt.toISOString(),
        endsAt: campaign.endsAt?.toISOString() ?? null,
      })),
    };
  }

  async exportOverview(query: DashboardExportDto, actor: AuthenticatedUser) {
    const overview = await this.getOverview(
      {
        branchId: query.branchId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        granularity: "day",
      },
      actor,
    );

    const rows: Array<Array<string | number | null | undefined>> = [];

    for (const card of overview.cards) {
      rows.push(["card", card.label, card.value, card.meta, card.delta, card.tone]);
    }

    for (const point of overview.trend.points) {
      rows.push(["trend", point.label, point.revenue, point.ticketCount, null, null]);
    }

    for (const branch of overview.branchComparison) {
      rows.push(["branch", branch.branchName, branch.revenue, branch.ticketCount, branch.averageBasket, null]);
    }

    return toCsv(["section", "label", "value1", "value2", "value3", "tone"], rows);
  }

  private resolveDateRange(dateFrom?: string, dateTo?: string) {
    const end = dateTo ? new Date(dateTo) : new Date();
    const start = dateFrom ? new Date(dateFrom) : new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  private resolveTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private async resolveBranchIds(actor: AuthenticatedUser, requestedBranchId?: string) {
    if (!requestedBranchId) {
      return actor.branchIds;
    }

    if (!actor.branchIds.includes(requestedBranchId)) {
      throw new ForbiddenException("Istenen sube icin yetki bulunamadi.");
    }

    return [requestedBranchId];
  }

  private buildSummaryCards(
    paidTickets: Array<{ grandTotal: unknown; discountTotal: unknown; payments: Array<{ amount: unknown }> }>,
    activeBranchCount: number,
    fixedCostSnapshot: { monthlyCommitment: number; activeCount: number },
  ) {
    const revenue = sumTicketRevenue(paidTickets);
    const discounts = sumTicketDiscount(paidTickets);
    const ticketCount = paidTickets.length;
    const averageBasket = ticketCount > 0 ? roundCurrency(revenue / ticketCount) : 0;
    const collectedAmount = roundCurrency(
      paidTickets.reduce(
        (sum, ticket) => sum + ticket.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0),
        0,
      ),
    );

    return [
      {
        key: "revenue",
        label: "Secili Donem Ciro",
        value: revenue,
        meta: "Toplam tahsil edilen ciro",
        delta: collectedAmount - revenue,
        tone: revenue > 0 ? "success" : "warning",
      },
      {
        key: "ticket_count",
        label: "Odeme Alinan Adisyon",
        value: ticketCount,
        meta: "Donem icindeki kapatilan fis sayisi",
        delta: activeBranchCount,
        tone: "info",
      },
      {
        key: "average_basket",
        label: "Ortalama Sepet",
        value: averageBasket,
        meta: "Adisyon basi ortalama ciro",
        delta: discounts,
        tone: "warning",
      },
      {
        key: "active_branches",
        label: "Aktif Sube Sayisi",
        value: activeBranchCount,
        meta: "Filtreye dahil edilen sube adedi",
        delta: 0,
        tone: "info",
      },
      {
        key: "fixed_cost_commitment",
        label: "Aylik Sabit Gider",
        value: fixedCostSnapshot.monthlyCommitment,
        meta: "Aktif planlardan normalize edildi",
        delta: fixedCostSnapshot.activeCount,
        tone: fixedCostSnapshot.monthlyCommitment > 0 ? "warning" : "info",
      },
    ];
  }

  private resolveWidgetVisibility(actor: AuthenticatedUser) {
    const canViewInventory = actor.role === "super_admin" || actor.permissions.includes("inventory.view");
    const canViewAccounting = actor.role === "super_admin" || actor.permissions.includes("accounting.view");
    const canViewStaff = actor.role === "super_admin" || actor.permissions.includes("staff.view") || actor.permissions.includes("attendance.view");
    const canViewGoals = actor.role === "super_admin" || actor.permissions.includes("goal.manage") || actor.permissions.includes("staff.view");
    return {
      inventory: canViewInventory,
      finance: canViewAccounting,
      staff: canViewStaff,
      goals: canViewGoals,
      notifications: true,
    };
  }

  private buildFixedCostSnapshot(activeFixedCosts: Array<{ id: string; title: string; amount: unknown; recurrenceType: string; branch: { name: string } }>) {
    const monthlyCommitment = activeFixedCosts.reduce(
      (sum, item) => sum + this.calculateMonthlyCommitment(Number(item.amount), item.recurrenceType),
      0,
    );
    return {
      activeCount: activeFixedCosts.length,
      monthlyCommitment,
      items: activeFixedCosts.map((item) => ({
        id: item.id,
        title: item.title,
        branchName: item.branch.name,
        monthlyEstimate: this.calculateMonthlyCommitment(Number(item.amount), item.recurrenceType),
      })),
    };
  }

  private buildFinanceSnapshot(
    dailyRevenue: number,
    dailyFixedExpenses: number,
    dailyPayroll: number,
    dailyOther: number,
    monthlyCommitment: number,
    ticketCount: number,
  ) {
    const dailyExpense = dailyFixedExpenses + dailyPayroll + dailyOther;
    const dailyCommittedFixedBurn = monthlyCommitment / 30;
    const estimatedNet = dailyRevenue - dailyExpense - dailyCommittedFixedBurn;
    return {
      dailyRevenue,
      dailyExpense,
      estimatedNet,
      dailyTicketCount: ticketCount,
      dailyCommittedFixedBurn: this.roundCurrency(dailyCommittedFixedBurn),
    };
  }

  private buildGoalProgress(
    goals: Array<{
      id: string;
      title: string;
      targetValue: unknown;
      currentValue: unknown;
      endsAt: Date;
      employeeProfile: { user: { fullName: string } | null; employeeCode: string; branch: { name: string } };
    }>,
  ) {
    return goals.map((goal) => {
      const targetValue = Number(goal.targetValue);
      const currentValue = Number(goal.currentValue);
      const progressRate = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;
      return {
        id: goal.id,
        title: goal.title,
        employeeName: goal.employeeProfile.user?.fullName ?? goal.employeeProfile.employeeCode,
        branchName: goal.employeeProfile.branch.name,
        targetValue,
        currentValue,
        progressRate: this.roundCurrency(progressRate),
        endsAt: goal.endsAt.toISOString(),
        statusLabel: progressRate >= 100 ? "Prim Hak Etti" : progressRate >= 75 ? "Yaklasti" : "Takipte",
        statusTone: progressRate >= 100 ? "success" : progressRate >= 75 ? "warning" : "info",
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

  private buildTrend(
    paidTickets: Array<{ closedAt: Date | null; grandTotal: unknown; branchId: string }>,
    branchIds: string[],
    branchNameMap: Map<string, string>,
    granularity: "day" | "week" | "month",
    range: { start: Date; end: Date },
  ) {
    const bucketMap = new Map<string, { label: string; revenue: number; ticketCount: number }>();

    for (const ticket of paidTickets) {
      const ticketDate = ticket.closedAt ?? range.end;
      const bucketKey = this.createBucketKey(ticketDate, granularity);
      const label = this.createBucketLabel(ticketDate, granularity);
      const current = bucketMap.get(bucketKey) ?? { label, revenue: 0, ticketCount: 0 };

      current.revenue += Number(ticket.grandTotal);
      current.ticketCount += 1;
      bucketMap.set(bucketKey, current);
    }

    return {
      granularity,
      activeBranches: branchIds.map((branchId) => ({
        id: branchId,
        name: branchNameMap.get(branchId) ?? branchId,
      })),
      points: [...bucketMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, value]) => value),
    };
  }

  private buildBranchComparison(
    paidTickets: Array<{ branchId: string; grandTotal: unknown }>,
    branchNameMap: Map<string, string>,
  ) {
    const byBranch = new Map<string, { revenue: number; ticketCount: number }>();

    for (const ticket of paidTickets) {
      const current = byBranch.get(ticket.branchId) ?? { revenue: 0, ticketCount: 0 };
      current.revenue += Number(ticket.grandTotal);
      current.ticketCount += 1;
      byBranch.set(ticket.branchId, current);
    }

    return [...byBranch.entries()]
      .map(([branchId, value]) => ({
        branchId,
        branchName: branchNameMap.get(branchId) ?? branchId,
        revenue: value.revenue,
        ticketCount: value.ticketCount,
        averageBasket: value.ticketCount > 0 ? value.revenue / value.ticketCount : 0,
      }))
      .sort((left, right) => right.revenue - left.revenue);
  }

  private buildPaymentBreakdown(
    paidTickets: Array<{ payments: Array<{ method: string; amount: unknown }> }>,
  ) {
    const rows = [...aggregatePaymentMethods(paidTickets.flatMap((ticket) => ticket.payments)).values()];
    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    return rows
      .map((row) => ({
        method: row.method,
        amount: row.amount,
        ratio: total > 0 ? (row.amount / total) * 100 : 0,
      }))
      .sort((left, right) => right.amount - left.amount);
  }

  private buildStatusFlow(input: {
    pendingCashClosures: Array<{ branch: { name: string }; varianceAmount: unknown; closureDate: Date }>;
    stockAlerts: Array<{ branch: { name: string }; inventoryItem: { name: string } }>;
    activeCampaigns: Array<{ branch: { name: string }; name: string }>;
    tasks: Array<{ title: string; status: string; dueAt: Date | null }>;
    shifts: Array<{ branch: { name: string }; employeeProfile: { user: { fullName: string } | null; employeeCode: string } }>;
  }) {
    const items = [
      ...input.pendingCashClosures.slice(0, 2).map((closure) => ({
        title: "Kasa kapanisi bekliyor",
        meta: `${closure.branch.name} / fark ${Number(closure.varianceAmount).toFixed(2)}`,
        tone: Number(closure.varianceAmount) === 0 ? "info" : "warning",
      })),
      ...input.stockAlerts.slice(0, 2).map((alert) => ({
        title: "Kritik stok uyarisi",
        meta: `${alert.branch.name} / ${alert.inventoryItem.name}`,
        tone: "danger",
      })),
      ...input.activeCampaigns.slice(0, 1).map((campaign) => ({
        title: "Aktif kampanya izleniyor",
        meta: `${campaign.branch.name} / ${campaign.name}`,
        tone: "info",
      })),
      ...input.tasks.slice(0, 1).map((task) => ({
        title: "Bekleyen gorev",
        meta: task.title,
        tone: this.getTaskStatusMeta(task.status, task.dueAt).tone,
      })),
      ...input.shifts.slice(0, 1).map((shift) => ({
        title: "Planli mesai",
        meta: `${shift.branch.name} / ${shift.employeeProfile.user?.fullName ?? shift.employeeProfile.employeeCode}`,
        tone: "success",
      })),
    ];

    return items.slice(0, 6);
  }

  private computeStockEffect(entryType: string, quantity: number) {
    const outbound = new Set(["sale", "waste", "adjustment_out", "transfer_out"]);
    const inbound = new Set(["purchase", "adjustment_in", "transfer_in", "sale_reversal"]);
    if (outbound.has(entryType)) return -quantity;
    if (inbound.has(entryType)) return quantity;
    return quantity;
  }

  private formatTaskPriority(value?: string | null) {
    switch (value) {
      case "critical":
        return "Kritik";
      case "high":
        return "Yuksek";
      case "low":
        return "Dusuk";
      default:
        return "Orta";
    }
  }

  private getTaskStatusMeta(status?: string | null, dueAt?: Date | null) {
    const isOverdue = Boolean(dueAt && dueAt.getTime() < Date.now() && status !== "done");

    if (status === "done") {
      return { label: "Tamamlandi", tone: "success" as const };
    }
    if (isOverdue) {
      return { label: "Gecikti", tone: "danger" as const };
    }
    if (status === "in_progress") {
      return { label: "Yapiliyor", tone: "warning" as const };
    }
    return { label: "Bekliyor", tone: "info" as const };
  }

  private buildUpcomingBirthdays(
    employees: Array<{
      id: string;
      employeeCode: string;
      title: string | null;
      birthDate: Date | null;
      branch: { name: string };
      user: { fullName: string } | null;
    }>,
  ) {
    const now = new Date();

    return employees
      .filter((employee) => employee.birthDate)
      .map((employee) => {
        const birthDate = employee.birthDate as Date;
        const nextBirthday = new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate());
        if (nextBirthday < now) {
          nextBirthday.setFullYear(now.getFullYear() + 1);
        }

        const diffDays = Math.ceil((nextBirthday.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        return {
          id: employee.id,
          employeeName: employee.user?.fullName ?? employee.title ?? employee.employeeCode,
          branchName: employee.branch.name,
          daysLeft: diffDays,
          birthDate: birthDate.toISOString(),
        };
      })
      .sort((left, right) => left.daysLeft - right.daysLeft);
  }

  private createBucketKey(date: Date, granularity: "day" | "week" | "month") {
    if (granularity === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    if (granularity === "week") {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      return startOfWeek.toISOString().slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
  }

  private createBucketLabel(date: Date, granularity: "day" | "week" | "month") {
    if (granularity === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    if (granularity === "week") {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return `Hafta ${startOfWeek.toISOString().slice(5, 10)}`;
    }

    return date.toISOString().slice(5, 10);
  }

  private roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
