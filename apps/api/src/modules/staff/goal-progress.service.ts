import { Injectable } from "@nestjs/common";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";

const goalInclude = {
  branch: true,
  employeeProfile: { include: { user: true, branch: true } },
  product: true,
  category: true,
  bonus: true,
} satisfies Prisma.GoalInclude;

type GoalWithRelations = Prisma.GoalGetPayload<{
  include: typeof goalInclude;
}>;

@Injectable()
export class GoalProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async syncGoalProgress(goalId: string) {
    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findUnique({
        where: { id: goalId },
        include: goalInclude,
      });

      if (!goal) return null;
      return this.syncGoalWithinTransaction(tx, goal);
    });
  }

  async syncGoalSet(goalIds: string[]) {
    if (goalIds.length === 0) return [];
    const results = await Promise.all(goalIds.map((goalId) => this.syncGoalProgress(goalId)));
    return results.filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async getGoalsForRange(branchIds: string[], range: { start: Date; end: Date }) {
    const goals = await this.prisma.goal.findMany({
      where: {
        branchId: { in: branchIds },
        startsAt: { lte: range.end },
        endsAt: { gte: range.start },
      },
      include: goalInclude,
      orderBy: { endsAt: "asc" },
    });

    return this.syncGoalSet(goals.map((goal) => goal.id));
  }

  toOverview(goal: GoalWithRelations) {
    const targetValue = Number(goal.targetValue);
    const currentValue = Number(goal.currentValue);
    const progressRate = Number(goal.progressRate);
    const branchName = goal.branch.name;
    const employeeName = goal.employeeProfile?.user?.fullName ?? goal.employeeProfile?.employeeCode ?? "Genel isletme";

    return {
      id: goal.id,
      title: goal.title,
      employeeName,
      branchName,
      targetValue,
      currentValue,
      progressRate: this.round(progressRate),
      endsAt: goal.endsAt.toISOString(),
      statusLabel: this.formatStatusLabel(goal.status, progressRate),
      statusTone: this.formatStatusTone(goal.status, progressRate),
      goalTypeLabel: this.formatGoalType(goal.goalType),
      goalScopeLabel: goal.goalScope === "employee" ? "Personel" : "Genel",
      bonusAmount: goal.bonus ? Number(goal.bonus.calculatedAmount) : 0,
      bonusStatus: goal.bonus?.status ?? null,
    };
  }

  private async syncGoalWithinTransaction(tx: Prisma.TransactionClient, goal: GoalWithRelations) {
    const metrics = await this.computeMetrics(tx, goal);
    const progressRate = goal.targetValue.gt(0)
      ? (Number(metrics.currentValue) / Number(goal.targetValue)) * 100
      : 0;
    const isCompleted = progressRate >= 100;
    const now = new Date();
    const status = isCompleted ? "completed" : goal.endsAt < now ? "expired" : "active";
    const updated = await tx.goal.update({
      where: { id: goal.id },
      data: {
        currentValue: this.decimal(metrics.currentValue),
        bonusBaseValue: this.decimal(metrics.bonusBaseValue),
        progressRate: this.decimal(this.round(progressRate)),
        status,
        completedAt: isCompleted ? goal.completedAt ?? now : null,
        lastSyncedAt: now,
      },
      include: goalInclude,
    });

    await this.syncGoalBonus(tx, updated, metrics, isCompleted);

    return tx.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: goalInclude,
    });
  }

  private async syncGoalBonus(
    tx: Prisma.TransactionClient,
    goal: GoalWithRelations,
    metrics: { currentValue: number; bonusBaseValue: number; ticketCount: number },
    isCompleted: boolean,
  ) {
    if (!goal.bonusType || !goal.bonusValue) {
      return;
    }

    const calculatedAmount = this.calculateBonusAmount(goal, metrics.bonusBaseValue);
    const snapshot = {
      goalType: goal.goalType,
      goalScope: goal.goalScope,
      currentValue: metrics.currentValue,
      bonusBaseValue: metrics.bonusBaseValue,
      ticketCount: metrics.ticketCount,
      progressRate: Number(goal.progressRate),
    };

    if (!isCompleted) {
      if (goal.bonus && goal.bonus.status !== "posted") {
        await tx.goalBonus.update({
          where: { goalId: goal.id },
          data: {
            status: "revoked",
            sourceSnapshot: snapshot,
            notes: "Hedef tekrar esik altina dustu.",
          },
        });
      }
      return;
    }

    if (!goal.bonus) {
      const nextStatus = goal.bonusApprovalRequired ? "pending_approval" : goal.employeeProfileId ? "posted" : "approved";
      const payrollPayment =
        !goal.bonusApprovalRequired && goal.employeeProfileId
          ? await tx.payrollPayment.create({
              data: {
                branchId: goal.branchId,
                employeeProfileId: goal.employeeProfileId,
                amount: this.decimal(calculatedAmount),
                paymentDate: new Date(),
                movementType: "PAYMENT",
                transactionType: "goal_bonus",
                notes: `Hedef primi: ${goal.title}`,
              },
            })
          : null;

      await tx.goalBonus.create({
        data: {
          goalId: goal.id,
          branchId: goal.branchId,
          employeeProfileId: goal.employeeProfileId,
          bonusType: goal.bonusType,
          bonusValue: goal.bonusValue,
          calculatedAmount: this.decimal(calculatedAmount),
          approvalRequired: goal.bonusApprovalRequired,
          status: nextStatus,
          payrollPaymentId: payrollPayment?.id ?? null,
          approvedAt: goal.bonusApprovalRequired ? null : new Date(),
          postedAt: payrollPayment ? new Date() : null,
          notes: payrollPayment ? "Prim otomatik olarak maas odemesine yansitildi." : null,
          sourceSnapshot: snapshot,
        },
      });

      if (goal.employeeProfile?.userId) {
        await tx.notification.create({
          data: {
            branchId: goal.branchId,
            userId: goal.employeeProfile.userId,
            type: "SYSTEM",
            title: goal.bonusApprovalRequired ? "Prim onay bekliyor" : "Prim hak edildi",
            message: goal.bonusApprovalRequired
              ? `${goal.title} hedefi tamamlandi. Prim kaydi onay bekliyor.`
              : `${goal.title} hedefi tamamlandi ve prim kaydi olusturuldu.`,
            data: {
              goalId: goal.id,
              bonusAmount: calculatedAmount,
              bonusStatus: nextStatus,
            },
          },
        });
      }

      return;
    }

    if (goal.bonus.status !== "posted") {
      await tx.goalBonus.update({
        where: { goalId: goal.id },
        data: {
          calculatedAmount: this.decimal(calculatedAmount),
          sourceSnapshot: snapshot,
          status: goal.bonusApprovalRequired ? goal.bonus.status : goal.bonus.status === "revoked" ? "approved" : goal.bonus.status,
        },
      });
    }
  }

  private async computeMetrics(tx: Prisma.TransactionClient, goal: GoalWithRelations) {
    const ticketWhere: Prisma.TicketWhereInput = {
      branchId: goal.branchId,
      status: "PAID",
      closedAt: {
        gte: goal.startsAt,
        lte: goal.endsAt,
      },
      ...(goal.goalScope === "employee" && goal.employeeProfile?.userId ? { createdByUserId: goal.employeeProfile.userId } : {}),
    };

    if (goal.goalType === "product_quantity") {
      if (!goal.productId) {
        return { currentValue: 0, bonusBaseValue: 0, ticketCount: 0 };
      }
      const aggregate = await tx.ticketItem.aggregate({
        _sum: { quantity: true, lineTotal: true },
        where: {
          productId: goal.productId ?? undefined,
          ticket: ticketWhere,
        },
      });
      return {
        currentValue: Number(aggregate._sum.quantity ?? 0),
        bonusBaseValue: Number(aggregate._sum.lineTotal ?? 0),
        ticketCount: 0,
      };
    }

    if (goal.goalType === "category_quantity") {
      if (!goal.categoryId) {
        return { currentValue: 0, bonusBaseValue: 0, ticketCount: 0 };
      }
      const aggregate = await tx.ticketItem.aggregate({
        _sum: { quantity: true, lineTotal: true },
        where: {
          product: {
            categoryId: goal.categoryId ?? undefined,
          },
          ticket: ticketWhere,
        },
      });
      return {
        currentValue: Number(aggregate._sum.quantity ?? 0),
        bonusBaseValue: Number(aggregate._sum.lineTotal ?? 0),
        ticketCount: 0,
      };
    }

    if (goal.goalType === "payment_method_total") {
      if (!goal.paymentMethod) {
        return { currentValue: 0, bonusBaseValue: 0, ticketCount: 0 };
      }
      const aggregate = await tx.payment.aggregate({
        _sum: { amount: true },
        _count: { id: true },
        where: {
          method: goal.paymentMethod as PaymentMethod,
          status: "COMPLETED",
          paidAt: {
            gte: goal.startsAt,
            lte: goal.endsAt,
          },
          ticket: ticketWhere,
        },
      });
      const amount = Number(aggregate._sum.amount ?? 0);
      return {
        currentValue: amount,
        bonusBaseValue: amount,
        ticketCount: aggregate._count.id,
      };
    }

    if (goal.goalScope === "employee" && !goal.employeeProfile?.userId) {
      return { currentValue: 0, bonusBaseValue: 0, ticketCount: 0 };
    }

    const aggregate = await tx.ticket.aggregate({
      _sum: { grandTotal: true },
      _count: { id: true },
      where: ticketWhere,
    });
    const amount = Number(aggregate._sum.grandTotal ?? 0);
    return {
      currentValue: amount,
      bonusBaseValue: amount,
      ticketCount: aggregate._count.id,
    };
  }

  private calculateBonusAmount(goal: GoalWithRelations, bonusBaseValue: number) {
    if (goal.manualOverrideValue) {
      return Number(goal.manualOverrideValue);
    }

    if (goal.bonusType === "percentage") {
      return this.round((bonusBaseValue * Number(goal.bonusValue ?? 0)) / 100);
    }

    return this.round(Number(goal.bonusValue ?? 0));
  }

  private formatGoalType(value: string) {
    switch (value) {
      case "product_quantity":
        return "Urun Adedi";
      case "category_quantity":
        return "Kategori Adedi";
      case "payment_method_total":
        return "Odeme Tipi";
      default:
        return "Ciro";
    }
  }

  private formatStatusLabel(status: string, progressRate: number) {
    if (status === "completed") return "Prim Hak Etti";
    if (status === "expired") return "Suresi Doldu";
    return progressRate >= 75 ? "Yaklasti" : "Takipte";
  }

  private formatStatusTone(status: string, progressRate: number) {
    if (status === "completed") return "success" as const;
    if (status === "expired") return "danger" as const;
    return progressRate >= 75 ? "warning" as const : "info" as const;
  }

  private decimal(value: number) {
    return new Prisma.Decimal(this.round(value));
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
