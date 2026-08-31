import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, Prisma } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { CloseRegisterDto } from "./dto/close-register.dto";
import { CreatePosExpenseDto } from "./dto/create-pos-expense.dto";
import { OpenRegisterDto } from "./dto/open-register.dto";
import { PosGateway } from "./pos.gateway";

type PosActor = {
  tenantId: string;
  userId: string;
  branchIds: string[];
  terminalId?: string | null;
  permissions?: string[];
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
};

type PaymentSplitInput = {
  method: PaymentMethod | "CASH" | "CREDIT_CARD" | "MEAL_CARD" | "GIFT_CARD" | "BANK_TRANSFER" | "OTHER";
  amount: number;
};

@Injectable()
export class PosRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly posGateway: PosGateway,
  ) {}

  async openRegister(dto: OpenRegisterDto, actor: PosActor) {
    const branchId = this.resolveBranchId(actor, dto.branchId);
    const terminalId = await this.resolveTerminalId(branchId, dto.terminalId ?? actor.terminalId ?? null);
    const openingCash = this.roundCurrency(dto.openingCash);
    const created = await this.prisma.$transaction(async (tx) => {
      const scopeWhere = this.buildOpenScopeWhere(branchId, actor.userId, terminalId);
      const existing = await tx.registerClosing.findFirst({
        where: {
          ...scopeWhere,
          isOpen: true,
        },
      });

      if (existing) {
        throw new BadRequestException("Bu kasa/terminal icin acik bir session zaten var.");
      }

      return tx.registerClosing.create({
        data: {
          branchId,
          userId: actor.userId,
          terminalId,
          openingCash,
          paymentBreakdown: {
            create: {
              cash: 0,
              card: 0,
              mobile: 0,
            },
          },
        },
        include: {
          paymentBreakdown: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId,
      userId: actor.userId,
      module: "register",
      action: "register.open",
      entityType: "register_closing",
      entityId: created.id,
      payload: {
        terminalId,
        openingCash,
      },
      oldValues: null,
      newValues: this.serializeClosing(created),
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? terminalId ?? null,
    });

    const payload = {
      action: "open",
      branchId,
      terminalId,
      closingId: created.id,
      summary: {
        openingCash,
        isOpen: true,
      },
    };
    this.posGateway.emitToBranch(branchId, "register.updated", payload);
    this.posGateway.emitToBranch(branchId, "pos.register.updated", payload);

    return this.serializeClosing(created);
  }

  async closeRegister(dto: CloseRegisterDto, actor: PosActor) {
    const branchId = this.resolveBranchId(actor, dto.branchId);
    const terminalId = await this.resolveTerminalId(branchId, dto.terminalId ?? actor.terminalId ?? null);
    const countedCash = this.roundCurrency(dto.countedCash);

    const result = await this.prisma.$transaction(async (tx) => {
      const closing = await this.getActiveClosingOrThrow(tx, branchId, actor.userId, terminalId);
      const transactions = await tx.registerTransaction.findMany({
        where: { closingId: closing.id },
        orderBy: { createdAt: "asc" },
      });

      const expectedCash = this.computeExpectedCash(closing.openingCash, transactions);
      const difference = this.roundCurrency(countedCash - expectedCash);

      await tx.cashDenomination.deleteMany({
        where: { closingId: closing.id },
      });

      if (dto.denominations?.length) {
        await tx.cashDenomination.createMany({
          data: dto.denominations.map((item) => {
            const denomination = this.roundCurrency(item.denomination);
            const quantity = Math.max(0, Math.trunc(item.quantity));
            return {
              closingId: closing.id,
              denomination,
              quantity,
              total: this.roundCurrency(denomination * quantity),
            };
          }),
        });
      }

      const closeResult = await tx.registerClosing.updateMany({
        where: { id: closing.id, isOpen: true },
        data: {
          expectedCash,
          countedCash,
          difference,
          isOpen: false,
          closedAt: new Date(),
        },
      });
      if (closeResult.count !== 1) {
        throw new BadRequestException("Kasa kapanisi eszamanli olarak tamamlanmis. Listeyi yenileyin.");
      }

      const updated = await tx.registerClosing.findUniqueOrThrow({
        where: { id: closing.id },
        include: {
          paymentBreakdown: true,
          denominations: true,
          transactions: true,
        },
      });

      return {
        closing: updated,
        previousClosing: closing,
        summary: {
          openingCash: Number(closing.openingCash),
          expectedCash,
          countedCash,
          difference,
          paymentBreakdown: updated.paymentBreakdown
            ? {
                cash: Number(updated.paymentBreakdown.cash),
                card: Number(updated.paymentBreakdown.card),
                mobile: Number(updated.paymentBreakdown.mobile),
              }
            : { cash: 0, card: 0, mobile: 0 },
          transactionCount: transactions.length,
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId,
      userId: actor.userId,
      module: "register",
      action: "register.close",
      entityType: "register_closing",
      entityId: result.closing.id,
      payload: result.summary,
      oldValues: this.serializeClosing(result.previousClosing),
      newValues: {
        ...this.serializeClosing(result.closing),
        summary: result.summary,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? terminalId ?? null,
    });

    const payload = {
      action: "close",
      branchId,
      terminalId,
      closingId: result.closing.id,
      summary: result.summary,
    };
    this.posGateway.emitToBranch(branchId, "register.updated", payload);
    this.posGateway.emitToBranch(branchId, "pos.register.updated", payload);
    this.posGateway.emitToBranch(branchId, "cash.closure.created", {
      branchId,
      closureId: result.closing.id,
      varianceAmount: result.summary.difference,
      countedCash: result.summary.countedCash,
      expectedCash: result.summary.expectedCash,
    });

    return {
      ...this.serializeClosing(result.closing),
      summary: result.summary,
    };
  }

  async createExpense(dto: CreatePosExpenseDto, actor: PosActor) {
    const branchId = this.resolveBranchId(actor, dto.branchId);
    const terminalId = await this.resolveTerminalId(branchId, dto.terminalId ?? actor.terminalId ?? null);
    const amount = this.roundCurrency(dto.amount);
    const paymentType = this.normalizeRegisterPaymentType(dto.paymentType);
    const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();
    const description = dto.description.trim();
    const title = dto.title.trim();

    if (!description) {
      throw new BadRequestException("Gider aciklamasi bos olamaz.");
    }
    if (!title) {
      throw new BadRequestException("Gider basligi bos olamaz.");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Gider tutari sifirdan buyuk olmali.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const activeClosing = await this.getActiveClosingOrThrow(tx, branchId, actor.userId, terminalId);

      const expense = await tx.expense.create({
        data: {
          branchId,
          userId: actor.userId,
          title,
          description,
          category: dto.category,
          amount,
          expenseType: "pos_expense",
          recurrenceType: "once",
          note: dto.note ?? null,
          expenseDate,
        },
      });

      const registerTransaction = await tx.registerTransaction.create({
        data: {
          branchId,
          closingId: activeClosing?.id ?? null,
          userId: actor.userId,
          type: "expense",
          amount,
          paymentType,
        },
      });

      return {
        expense,
        registerTransaction,
        closingId: activeClosing?.id ?? null,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId,
      userId: actor.userId,
      module: "expenses",
      action: "expense.create",
      entityType: "expense",
      entityId: result.expense.id,
      payload: {
        amount,
        category: dto.category,
        paymentType,
        closingId: result.closingId,
      },
      oldValues: null,
      newValues: {
        expenseId: result.expense.id,
        title,
        description,
        amount,
        category: dto.category,
        paymentType,
        closingId: result.closingId,
        registerTransactionId: result.registerTransaction.id,
        expenseDate,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? terminalId ?? null,
    });

    return result;
  }

  async recordSalePaymentsWithinTransaction(
    tx: Prisma.TransactionClient,
    input: {
      actor: PosActor;
      branchId: string;
      terminalId?: string | null;
      orderId: string;
      splits: PaymentSplitInput[];
    },
  ) {
    const terminalId = input.terminalId ?? input.actor.terminalId ?? null;
    const activeClosing = await this.getActiveClosingOrThrow(tx, input.branchId, input.actor.userId, terminalId);

    const createdTransactions = [];
    const totals = { cash: 0, card: 0, mobile: 0 };

    for (const split of input.splits) {
      const amount = this.roundCurrency(split.amount);
      const paymentType = this.mapPaymentMethodToRegisterType(split.method as PaymentMethod);

      const row = await tx.registerTransaction.create({
        data: {
          branchId: input.branchId,
          closingId: activeClosing?.id ?? null,
          userId: input.actor.userId,
          type: "sale",
          amount,
          paymentType,
          orderId: input.orderId,
        },
      });
      createdTransactions.push(row);
      totals[paymentType] += amount;
    }

    await this.adjustPaymentBreakdown(tx, activeClosing?.id ?? null, totals);

    return {
      closingId: activeClosing?.id ?? null,
      totals,
      transactions: createdTransactions,
    };
  }

  async recordRefundWithinTransaction(
    tx: Prisma.TransactionClient,
    input: {
      actor: PosActor;
      branchId: string;
      terminalId?: string | null;
      orderId: string;
      amount: number;
      method: PaymentMethod;
    },
  ) {
    const terminalId = input.terminalId ?? input.actor.terminalId ?? null;
    const activeClosing = await this.getActiveClosingOrThrow(tx, input.branchId, input.actor.userId, terminalId);
    const paymentType = this.mapPaymentMethodToRegisterType(input.method);
    const amount = this.roundCurrency(input.amount);

    const transaction = await tx.registerTransaction.create({
      data: {
        branchId: input.branchId,
        closingId: activeClosing.id,
        userId: input.actor.userId,
        type: "refund",
        amount,
        paymentType,
        orderId: input.orderId,
      },
    });

    await this.adjustPaymentBreakdown(tx, activeClosing.id, {
      cash: paymentType === "cash" ? -amount : 0,
      card: paymentType === "card" ? -amount : 0,
      mobile: paymentType === "mobile" ? -amount : 0,
    });

    return {
      closingId: activeClosing.id,
      transaction,
      totals: {
        cash: paymentType === "cash" ? amount : 0,
        card: paymentType === "card" ? amount : 0,
        mobile: paymentType === "mobile" ? amount : 0,
      },
    };
  }

  private async getActiveClosingOrThrow(
    tx: Prisma.TransactionClient,
    branchId: string,
    userId: string,
    terminalId?: string | null,
  ) {
    if (terminalId) {
      const closing = await this.findActiveClosing(tx, branchId, userId, terminalId);
      if (!closing) {
        throw new NotFoundException("Kapatilacak aktif kasa session bulunamadi.");
      }
      return closing;
    }

    const closing = await this.resolveActiveRegisterWithoutTerminal(tx, branchId, userId);
    if (!closing) {
      throw new NotFoundException("Kapatilacak aktif kasa session bulunamadi.");
    }
    return closing;
  }

  async ensureActiveRegisterSession(branchId: string, actor: PosActor, terminalId?: string | null) {
    const resolvedBranchId = this.resolveBranchId(actor, branchId);
    const requestedTerminalId = terminalId ?? actor.terminalId ?? null;

    if (requestedTerminalId) {
      const resolvedTerminalId = await this.resolveTerminalId(resolvedBranchId, requestedTerminalId);
      const closing = await this.findActiveClosing(this.prisma, resolvedBranchId, actor.userId, resolvedTerminalId);
      if (!closing) {
        throw new BadRequestException("Kapali kasada islem yapilamaz. Once kasa acilisi yapin.");
      }
      return closing;
    }

    const closing = await this.resolveActiveRegisterWithoutTerminal(this.prisma, resolvedBranchId, actor.userId);
    if (!closing) {
      throw new BadRequestException("Kapali kasada islem yapilamaz. Once kasa acilisi yapin.");
    }
    return closing;
  }

  private async resolveActiveRegisterWithoutTerminal(
    tx: Prisma.TransactionClient,
    branchId: string,
    userId: string,
  ) {
    const userScoped = await tx.registerClosing.findFirst({
      where: {
        branchId,
        userId,
        terminalId: null,
        isOpen: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (userScoped) {
      return userScoped;
    }

    const userTerminalSessions = await tx.registerClosing.findMany({
      where: {
        branchId,
        userId,
        terminalId: { not: null },
        isOpen: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (userTerminalSessions.length === 1) {
      return userTerminalSessions[0];
    }
    if (userTerminalSessions.length > 1) {
      throw new BadRequestException("Birden fazla acik kasa session bulundu. Terminal secimi gerekli.");
    }

    const branchSessions = await tx.registerClosing.findMany({
      where: {
        branchId,
        isOpen: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (branchSessions.length === 1) {
      return branchSessions[0];
    }
    if (branchSessions.length > 1) {
      throw new BadRequestException("Terminal secimi gerekli. Aktif kasa icin terminalId gonderin.");
    }

    return null;
  }

  private async findActiveClosing(
    tx: Prisma.TransactionClient,
    branchId: string,
    userId: string,
    terminalId?: string | null,
  ) {
    return tx.registerClosing.findFirst({
      where: {
        ...this.buildOpenScopeWhere(branchId, userId, terminalId),
        isOpen: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async adjustPaymentBreakdown(
    tx: Prisma.TransactionClient,
    closingId: string | null,
    deltas: { cash: number; card: number; mobile: number },
  ) {
    if (!closingId) {
      return;
    }

    await tx.paymentBreakdown.upsert({
      where: { closingId },
      update: {
        cash: { increment: this.roundCurrency(deltas.cash) },
        card: { increment: this.roundCurrency(deltas.card) },
        mobile: { increment: this.roundCurrency(deltas.mobile) },
      },
      create: {
        closingId,
        cash: this.roundCurrency(deltas.cash),
        card: this.roundCurrency(deltas.card),
        mobile: this.roundCurrency(deltas.mobile),
      },
    });
  }

  private buildOpenScopeWhere(branchId: string, userId: string, terminalId?: string | null) {
    return terminalId
      ? {
          branchId,
          terminalId,
        }
      : {
          branchId,
          userId,
          terminalId: null,
        };
  }

  private resolveBranchId(actor: PosActor, branchId?: string) {
    const resolved = branchId ?? actor.branchIds[0];
    if (!resolved) {
      throw new BadRequestException("Sube secimi gerekli.");
    }
    if (!actor.branchIds.includes(resolved)) {
      throw new BadRequestException("Bu sube icin yetkiniz yok.");
    }
    return resolved;
  }

  private async resolveTerminalId(branchId: string, terminalId?: string | null) {
    if (!terminalId) {
      return null;
    }
    const terminal = await this.prisma.terminal.findFirst({
      where: { id: terminalId, branchId },
      select: { id: true },
    });
    if (!terminal) {
      throw new BadRequestException("Gecersiz terminal secimi.");
    }
    return terminal.id;
  }

  private computeExpectedCash(openingCash: Prisma.Decimal | number, transactions: Array<{ type: string; paymentType: string; amount: Prisma.Decimal | number }>) {
    const running = transactions.reduce((sum, row) => {
      if (row.paymentType !== "cash") {
        return sum;
      }
      const amount = Number(row.amount);
      if (row.type === "sale") {
        return sum + amount;
      }
      if (row.type === "refund" || row.type === "expense") {
        return sum - amount;
      }
      return sum;
    }, Number(openingCash));

    return this.roundCurrency(running);
  }

  private normalizeRegisterPaymentType(value?: string) {
    const normalized = (value ?? "cash").trim().toLowerCase();
    if (normalized === "cash" || normalized === "card" || normalized === "mobile") {
      return normalized as "cash" | "card" | "mobile";
    }
    throw new BadRequestException("paymentType sadece cash, card veya mobile olabilir.");
  }

  private mapPaymentMethodToRegisterType(method: PaymentMethod) {
    switch (method) {
      case "CASH":
        return "cash" as const;
      case "BANK_TRANSFER":
      case "OTHER":
        return "mobile" as const;
      case "CREDIT_CARD":
      case "MEAL_CARD":
      case "GIFT_CARD":
      default:
        return "card" as const;
    }
  }

  private roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private serializeClosing(closing: {
    id: string;
    branchId: string;
    userId: string;
    terminalId: string | null;
    openingCash: Prisma.Decimal | number;
    expectedCash?: Prisma.Decimal | number | null;
    countedCash?: Prisma.Decimal | number | null;
    difference?: Prisma.Decimal | number | null;
    isOpen: boolean;
    createdAt: Date;
    closedAt?: Date | null;
    paymentBreakdown?: { cash: Prisma.Decimal | number; card: Prisma.Decimal | number; mobile: Prisma.Decimal | number } | null;
    denominations?: Array<{ denomination: Prisma.Decimal | number; quantity: number; total: Prisma.Decimal | number }>;
  }) {
    return {
      id: closing.id,
      branchId: closing.branchId,
      userId: closing.userId,
      terminalId: closing.terminalId,
      openingCash: Number(closing.openingCash),
      expectedCash: closing.expectedCash == null ? null : Number(closing.expectedCash),
      countedCash: closing.countedCash == null ? null : Number(closing.countedCash),
      difference: closing.difference == null ? null : Number(closing.difference),
      isOpen: closing.isOpen,
      createdAt: closing.createdAt,
      closedAt: closing.closedAt ?? null,
      paymentBreakdown: closing.paymentBreakdown
        ? {
            cash: Number(closing.paymentBreakdown.cash),
            card: Number(closing.paymentBreakdown.card),
            mobile: Number(closing.paymentBreakdown.mobile),
          }
        : null,
      denominations: closing.denominations?.map((item) => ({
        denomination: Number(item.denomination),
        quantity: item.quantity,
        total: Number(item.total),
      })),
    };
  }
}
