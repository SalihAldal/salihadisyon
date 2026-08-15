import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { execFile } from "child_process";
import { writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { PaymentMethod, Prisma } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { InventoryConsumptionService } from "../inventory/inventory-consumption.service";
import { PosGateway } from "./pos.gateway";
import { PosIntegrationsService } from "../pos-integrations/pos-integrations.service";
import { AddTicketNoteDto } from "./dto/add-ticket-note.dto";
import { AddTicketItemDto } from "./dto/add-ticket-item.dto";
import { ApprovalRequestDto } from "./dto/approval-request.dto";
import { CollectPaymentDto } from "./dto/collect-payment.dto";
import { CloseRegisterDto } from "./dto/close-register.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreatePosExpenseDto } from "./dto/create-pos-expense.dto";
import { DrawerOpenDto } from "./dto/drawer-open.dto";
import { MergeTicketDto } from "./dto/merge-ticket.dto";
import { OpenRegisterDto } from "./dto/open-register.dto";
import { PrinterDispatchDto } from "./dto/printer-dispatch.dto";
import { RefundTicketDto } from "./dto/refund-ticket.dto";
import { SplitTicketDto } from "./dto/split-ticket.dto";
import { TransferTicketDto } from "./dto/transfer-ticket.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { UpdateTicketItemDto } from "./dto/update-ticket-item.dto";
import { ApplyTicketDiscountDto } from "./dto/apply-ticket-discount.dto";
import { PosAdminService } from "./pos-admin.service";
import { PosRegisterService } from "./pos-register.service";
import { PosReportsService } from "./pos-reports.service";

type PosActor = {
  tenantId: string;
  userId: string;
  branchIds: string[];
  role?: string;
  terminalId?: string | null;
  permissions?: string[];
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
};

const execFileAsync = promisify(execFile);

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryConsumptionService: InventoryConsumptionService,
    private readonly posGateway: PosGateway,
    private readonly posIntegrationsService: PosIntegrationsService,
    private readonly posAdminService: PosAdminService,
    private readonly posRegisterService: PosRegisterService,
    private readonly posReportsService: PosReportsService,
  ) {}

  async openRegister(dto: OpenRegisterDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Kasa acilis");
    return this.posRegisterService.openRegister(dto, actor);
  }

  async closeRegister(dto: CloseRegisterDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Kasa kapanis");
    return this.posRegisterService.closeRegister(dto, actor);
  }

  async createExpense(dto: CreatePosExpenseDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Gider islemi");
    return this.posRegisterService.createExpense(dto, actor);
  }

  async listTickets(
    actor: PosActor,
    query?: { branchId?: string; status?: string; channel?: string; search?: string; includeHistory?: string },
  ) {
    const branchId = query?.branchId ?? actor.branchIds[0];
    if (branchId) {
      this.ensureBranchAccess(actor, branchId);
    }
    const includeHistory = query?.includeHistory === "true";
    const statusList = query?.status?.split(",").map((item) => item.trim()).filter(Boolean);

    const where: Record<string, unknown> = {
      companyId: actor.tenantId,
      branchId: branchId ? branchId : { in: actor.branchIds },
    };

    if (statusList?.length) {
      where.status = { in: statusList };
    } else if (!includeHistory) {
      where.status = { in: ["OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING"] };
    }

    if (query?.channel) {
      where.channel = query.channel;
    }

    if (query?.search) {
      where.OR = [
        { ticketName: { contains: query.search, mode: "insensitive" } },
        { customer: { fullName: { contains: query.search, mode: "insensitive" } } },
        { table: { name: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const tickets = await this.prisma.ticket.findMany({
      where,
      include: {
        customer: true,
        table: true,
        items: true,
        payments: true,
      },
      orderBy: [{ openedAt: "desc" }],
      take: includeHistory ? 100 : 40,
    });

    const history = includeHistory
      ? []
      : await this.prisma.ticket.findMany({
          where: {
            companyId: actor.tenantId,
            branchId: branchId ? branchId : { in: actor.branchIds },
            status: { in: ["PAID", "CANCELLED", "VOIDED"] },
          },
          include: {
            customer: true,
            table: true,
            items: true,
            payments: true,
          },
          orderBy: { closedAt: "desc" },
          take: 20,
        });

    return {
      items: tickets.map((ticket) => this.serializeTicket(ticket)),
      history: history.map((ticket) => this.serializeTicket(ticket)),
      summary: {
        openCount: tickets.filter((ticket) => ["OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING"].includes(ticket.status)).length,
        paidCount: [...tickets, ...history].filter((ticket) => ticket.status === "PAID").length,
        deliveryCount: tickets.filter((ticket) => ticket.channel === "DELIVERY").length,
        takeawayCount: tickets.filter((ticket) => ticket.channel === "TAKEAWAY").length,
      },
      filters: ["status", "branch", "table", "customer", "channel"],
      branchId,
    };
  }

  async getTicketDetail(ticketId: string, actor: PosActor) {
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    return this.serializeTicket(ticket);
  }

  async getCatalog(actor: PosActor, branchId?: string) {
    return this.posAdminService.getBootstrapConfig(actor, { branchId });
  }

  async getPosConfig(actor: PosActor, branchId?: string, terminalId?: string) {
    return this.posAdminService.getBootstrapConfig(actor, { branchId, terminalId });
  }

  async getTerminalConnectionStatus(actor: PosActor, branchId?: string, terminalId?: string) {
    return this.posAdminService.getTerminalConnectionDiagnostics(actor, { branchId, terminalId });
  }

  async listAdminPaymentMethods(actor: PosActor, query?: { branchId?: string; includeInactive?: string }) {
    return this.posAdminService.listAdminPaymentMethods(actor, query);
  }

  async listAdminDevices(actor: PosActor, query?: { branchId?: string; includeInactive?: string }) {
    return this.posAdminService.listAdminDevices(actor, query);
  }

  async getPosReportSummary(actor: PosActor, query?: { branchId?: string; dateFrom?: string; dateTo?: string }) {
    return this.posReportsService.getSummary(actor, query);
  }

  async exportPosReportSummary(actor: PosActor, query?: { branchId?: string; dateFrom?: string; dateTo?: string }) {
    return this.posReportsService.exportSummary(actor, query);
  }

  async getTables(actor: PosActor, branchId?: string) {
    const resolvedBranchId = branchId ?? actor.branchIds[0];
    if (!resolvedBranchId) {
      throw new BadRequestException("Masa listesi icin sube secimi gerekli.");
    }
    this.ensureBranchAccess(actor, resolvedBranchId);
    const areas = await this.prisma.tableArea.findMany({
      where: { branchId: resolvedBranchId },
      include: {
        tables: {
          include: {
            tickets: {
              where: { status: { in: ["OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING"] } },
              include: { items: true, payments: true },
              orderBy: { openedAt: "desc" },
              take: 1,
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return {
      branchId: resolvedBranchId,
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        tables: area.tables.map((table) => ({
          id: table.id,
          code: table.code,
          name: table.name,
          status: table.status,
          capacity: table.capacity,
          colorHex: table.colorHex,
          activeTicketId: table.activeTicketId,
          activeTicket: table.tickets[0] ? this.serializeTicket(table.tickets[0]) : null,
        })),
      })),
    };
  }

  async getPendingOrders(actor: PosActor, branchId?: string) {
    const resolvedBranchId = branchId ?? actor.branchIds[0];
    if (!resolvedBranchId) {
      throw new BadRequestException("Bekleyen siparisler icin sube secimi gerekli.");
    }
    this.ensureBranchAccess(actor, resolvedBranchId);
    const orders = await this.prisma.pendingOrder.findMany({
      where: { companyId: actor.tenantId, branchId: resolvedBranchId },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return {
      items: orders.map((order) => ({
        id: order.id,
        channel: order.sourceChannel,
        status: order.status,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        sourceRef: order.sourceRef,
        createdAt: order.createdAt.toISOString(),
        acceptedTicketId: order.acceptedTicketId,
      })),
    };
  }

  async createTicket(dto: CreateTicketDto, actor: PosActor) {
    const resolvedBranchId = dto.branchId ?? actor.branchIds[0];
    if (!resolvedBranchId) {
      throw new BadRequestException("Ticket acmak icin sube secimi gerekli.");
    }
    this.ensureBranchAccess(actor, resolvedBranchId);
    if (dto.tableId) {
      await this.ensureTableAccess(dto.tableId, actor, resolvedBranchId);
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        companyId: actor.tenantId,
        branchId: resolvedBranchId,
        createdByUserId: actor.userId,
        customerId: dto.customerId ?? null,
        tableId: dto.tableId ?? null,
        channel: dto.channel,
        ticketName: dto.ticketName ?? null,
        coverCount: dto.coverCount,
        status: "OPEN",
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        grandTotal: 0,
      },
    });

    if (dto.tableId) {
      await this.prisma.diningTable.update({
        where: { id: dto.tableId },
        data: {
          status: "OCCUPIED",
          activeTicketId: ticket.id,
        },
      });
      await this.broadcastTableStatus(dto.tableId);
    }

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: resolvedBranchId,
      userId: actor.userId,
      module: "pos",
      action: "ticket.create",
      entityType: "ticket",
      entityId: ticket.id,
      payload: dto,
    });

    await this.broadcastTicketUpdate(ticket.id);
    return this.getTicketDetail(ticket.id, actor);
  }

  async updateTicket(ticketId: string, dto: UpdateTicketDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Adisyon guncelleme");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);
    const nextTableId = dto.tableId === undefined ? ticket.tableId : dto.tableId;
    if (nextTableId) {
      await this.ensureTableAccess(nextTableId, actor, ticket.branchId);
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        customerId: dto.customerId === undefined ? undefined : dto.customerId,
        ticketName: dto.ticketName === undefined ? undefined : dto.ticketName,
        coverCount: dto.coverCount ?? undefined,
        tableId: dto.tableId === undefined ? undefined : dto.tableId,
        channel: dto.channel ?? undefined,
        status: dto.status ?? undefined,
        closedAt: dto.status && ["PAID", "CANCELLED", "VOIDED"].includes(dto.status) ? new Date() : undefined,
      },
    });

    if (ticket.tableId && ticket.tableId !== nextTableId) {
      await this.releaseTable(ticket.tableId);
    }

    if (nextTableId) {
      await this.prisma.diningTable.update({
        where: { id: nextTableId },
        data: { status: "OCCUPIED", activeTicketId: ticketId },
      });
      await this.broadcastTableStatus(nextTableId);
    }

    await this.createTicketEvent(ticketId, "ticket_updated", dto);
    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
  }

  async addItem(ticketId: string, dto: AddTicketItemDto, actor: PosActor) {
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);

    return this.prisma.$transaction(async (tx) => {
      const pricedLine = await this.resolveLinePricing(tx, ticket.branchId, dto.productId, dto.variantIds, dto.modifierOptionIds, dto.requiredChoiceOptionIds);

      const item = await tx.ticketItem.create({
        data: {
          ticketId,
          productId: pricedLine.productId,
          productName: pricedLine.productName,
          quantity: dto.quantity,
          unitPrice: pricedLine.unitPrice,
          lineTotal: pricedLine.unitPrice * dto.quantity,
          notes: dto.note ?? null,
          modifiersJson: pricedLine.modifiersJson,
        },
      });

      await this.recalculateTicketTotals(tx, ticketId);
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "item_added",
          payload: { itemId: item.id, quantity: dto.quantity, modifiersJson: pricedLine.modifiersJson },
        },
      });

      const ticketTable = ticket.tableId
        ? await tx.diningTable.findUnique({
            where: { id: ticket.tableId },
            select: { id: true, name: true, code: true },
          })
        : null;

      await this.auditLogService.create({
        companyId: actor.tenantId,
        branchId: ticket.branchId,
        userId: actor.userId,
        module: "pos",
        action: "ticket.item.add",
        entityType: "ticket_item",
        entityId: item.id,
        payload: {
          ...dto,
          ticketId,
          tableId: ticket.tableId ?? null,
          tableName: ticketTable?.name ?? null,
          tableCode: ticketTable?.code ?? null,
          enteredAt: new Date().toISOString(),
        },
      });

      return this.getTicketDetail(ticketId, actor);
    });
  }

  async updateItem(ticketId: string, itemId: string, dto: UpdateTicketItemDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Urun duzenleme");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);
    const item = await this.prisma.ticketItem.findUnique({ where: { id: itemId } });
    if (!item || item.ticketId !== ticketId) {
      throw new NotFoundException("Adisyon satiri bulunamadi.");
    }

    return this.prisma.$transaction(async (tx) => {
      const currentModifiers = (item.modifiersJson ?? {}) as Record<string, unknown>;
      const variantIds = dto.variantIds ?? ((currentModifiers.variantIds as string[]) ?? []);
      const modifierOptionIds = dto.modifierOptionIds ?? ((currentModifiers.modifierOptionIds as string[]) ?? []);
      const requiredChoiceOptionIds = dto.requiredChoiceOptionIds ?? ((currentModifiers.requiredChoiceOptionIds as string[]) ?? []);
      const pricedLine = await this.resolveLinePricing(
        tx,
        ticket.branchId,
        item.productId ?? "",
        variantIds,
        modifierOptionIds,
        requiredChoiceOptionIds,
      );
      const quantity = dto.quantity ?? Number(item.quantity);

      await tx.ticketItem.update({
        where: { id: itemId },
        data: {
          quantity,
          unitPrice: pricedLine.unitPrice,
          lineTotal: pricedLine.unitPrice * quantity,
          notes: dto.note ?? item.notes,
          modifiersJson: pricedLine.modifiersJson,
          productName: pricedLine.productName,
        },
      });
      await this.recalculateTicketTotals(tx, ticketId);
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "item_updated",
          payload: { itemId, quantity },
        },
      });
      return this.getTicketDetail(ticketId, actor);
    });
  }

  async removeItem(ticketId: string, itemId: string, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Urun silme");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);
    const item = await this.prisma.ticketItem.findUnique({ where: { id: itemId } });
    if (!item || item.ticketId !== ticketId) {
      throw new NotFoundException("Adisyon satiri bulunamadi.");
    }
    const ticketTable = ticket.table
      ? {
          tableId: ticket.table.id ?? null,
          tableName: ticket.table.name ?? null,
          tableCode: ticket.table.code ?? null,
        }
      : { tableId: ticket.tableId ?? null, tableName: null, tableCode: null };

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketItem.delete({ where: { id: itemId } });
      await tx.ticketDiscount.deleteMany({ where: { ticketId, ticketItemId: itemId } });
      await this.recalculateTicketTotals(tx, ticketId);
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "item_removed",
          payload: { itemId },
        },
      });

      await this.auditLogService.create({
        executor: tx,
        companyId: actor.tenantId,
        branchId: ticket.branchId,
        userId: actor.userId,
        module: "pos",
        action: "ticket.item.cancel",
        entityType: "ticket_item",
        entityId: itemId,
        payload: {
          ticketId,
          ...ticketTable,
          productId: item.productId ?? null,
          productName: item.productName,
          quantity: Number(item.quantity),
          reason: "manual_remove",
          removedAt: new Date().toISOString(),
        },
      });
    });

    await this.posGateway.emitToTicket(ticketId, "ticket.item.cancelled", { ticketId, itemId });
    await this.posGateway.emitToTicket(ticketId, "pos.ticket.item.cancelled", { ticketId, itemId });
    await this.broadcastTicketUpdate(ticketId);
    return { success: true };
  }

  async addNote(ticketId: string, dto: AddTicketNoteDto, actor: PosActor) {
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);
    const note = await this.prisma.ticketNote.create({
      data: {
        companyId: actor.tenantId,
        branchId: ticket.branchId,
        ticketId,
        ticketItemId: dto.ticketItemId ?? null,
        noteType: dto.noteType ?? "free_text",
        content: dto.content,
        createdByUserId: actor.userId,
      },
    });

    await this.createTicketEvent(ticketId, "note_added", note);
    await this.broadcastTicketUpdate(ticketId);
    return note;
  }

  async applyDiscount(ticketId: string, dto: ApplyTicketDiscountDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Indirim islemi");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);

    const discount = await this.prisma.ticketDiscount.create({
      data: {
        companyId: actor.tenantId,
        branchId: ticket.branchId,
        ticketId,
        ticketItemId: dto.ticketItemId ?? null,
        discountType: dto.discountType,
        label: dto.label,
        amount: dto.amount,
        approvalRequired: dto.approvalRequired ?? false,
        approvedByUserId: dto.approvalRequired ? null : actor.userId,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      if (dto.ticketItemId) {
        const discounts = await tx.ticketDiscount.findMany({ where: { ticketId, ticketItemId: dto.ticketItemId } });
        const itemDiscountTotal = discounts.reduce((sum, row) => sum + Number(row.amount), 0);
        await tx.ticketItem.update({
          where: { id: dto.ticketItemId },
          data: { discountTotal: itemDiscountTotal },
        });
      }
      await this.recalculateTicketTotals(tx, ticketId);
    });

    await this.createTicketEvent(ticketId, "discount_applied", discount);
    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
  }

  async collectPayment(dto: CollectPaymentDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Odeme alma");
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: dto.ticketId },
      include: { payments: true, table: true },
    });

    if (!ticket || ticket.companyId !== actor.tenantId) {
      throw new NotFoundException("Odeme alinacak adisyon bulunamadi.");
    }

    this.ensureBranchAccess(actor, ticket.branchId);
    this.ensureTicketEditable(ticket);
    await this.posRegisterService.ensureActiveRegisterSession(ticket.branchId, actor, dto.terminalId ?? actor.terminalId ?? null);

    const normalizedSplits = dto.splits.map((split) => ({
      ...split,
      amount: this.roundCurrency(split.amount),
    }));
    const currentPaid = this.roundCurrency(ticket.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
    const incomingAmount = this.roundCurrency(normalizedSplits.reduce((sum, payment) => sum + payment.amount, 0));
    const nextPaid = this.roundCurrency(currentPaid + incomingAmount);
    const grandTotal = this.roundCurrency(Number(ticket.grandTotal));

    if (!normalizedSplits.length) {
      throw new BadRequestException("En az bir odeme parcasi gonderilmeli.");
    }

    if (normalizedSplits.some((split) => !Number.isFinite(split.amount) || split.amount <= 0)) {
      throw new BadRequestException("Her odeme parcasi sifirdan buyuk olmali.");
    }

    if (incomingAmount <= 0) {
      throw new BadRequestException("Odeme tutari sifirdan buyuk olmalidir.");
    }

    if (nextPaid > grandTotal + 0.01) {
      throw new BadRequestException("Fazla odeme tespit edildi.");
    }

    const willBeFullyPaid = nextPaid >= grandTotal - 0.01;
    if (willBeFullyPaid) {
      await this.inventoryConsumptionService.validateTicketSaleAvailability(dto.ticketId, actor);
    }

    const cardMethods = new Set(["CREDIT_CARD", "MEAL_CARD", "GIFT_CARD"]);
    for (const split of normalizedSplits) {
      if (!cardMethods.has(split.method)) {
        continue;
      }
      const posResponse = await this.posIntegrationsService.startSale(
        {
          branchId: ticket.branchId,
          terminalId: dto.terminalId ?? actor.terminalId ?? undefined,
          ticketId: dto.ticketId,
          amount: split.amount,
          currency: "TRY",
          meta: {
            paymentMethod: split.method,
            referenceNumber: split.referenceNumber ?? null,
          },
        },
        {
          tenantId: actor.tenantId,
          userId: actor.userId,
          role: "pos_operator",
          branchIds: actor.branchIds,
          permissions: ["payment.manage"],
          terminalId: dto.terminalId ?? actor.terminalId ?? null,
        },
      );
      if (!posResponse.success) {
        throw new BadRequestException(posResponse.message || "POS odeme islemi basarisiz.");
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const liveTicket = await tx.ticket.findUnique({
        where: { id: dto.ticketId },
        include: { payments: true, table: true },
      });

      if (!liveTicket || liveTicket.companyId !== actor.tenantId) {
        throw new NotFoundException("Odeme alinacak adisyon bulunamadi.");
      }

      this.ensureBranchAccess(actor, liveTicket.branchId);
      this.ensureTicketEditable(liveTicket);

      const liveGrandTotal = this.roundCurrency(Number(liveTicket.grandTotal));
      const liveCurrentPaid = this.roundCurrency(liveTicket.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
      const paymentAuditBefore = {
        ticketId: liveTicket.id,
        status: liveTicket.status,
        grandTotal: liveGrandTotal,
        paidTotal: liveCurrentPaid,
        remainingAmount: this.roundCurrency(Math.max(liveGrandTotal - liveCurrentPaid, 0)),
        paymentCount: liveTicket.payments.length,
      };
      if (liveCurrentPaid >= liveGrandTotal - 0.01) {
        throw new BadRequestException("Bu adisyon zaten kapatildi.");
      }

      const liveIncomingAmount = this.roundCurrency(normalizedSplits.reduce((sum, payment) => sum + payment.amount, 0));
      const liveNextPaid = this.roundCurrency(liveCurrentPaid + liveIncomingAmount);
      if (liveNextPaid > liveGrandTotal + 0.01) {
        throw new BadRequestException("Fazla odeme tespit edildi.");
      }

      const paymentRows = [];

      for (const split of normalizedSplits) {
        const payment = await tx.payment.create({
          data: {
            ticketId: dto.ticketId,
            method: split.method,
            status: "COMPLETED",
            amount: split.amount,
            referenceNumber: split.referenceNumber ?? null,
            paidAt: new Date(),
          },
        });
        paymentRows.push(payment);
      }

      const refreshedPayments = await tx.payment.findMany({ where: { ticketId: dto.ticketId } });
      const totalPaid = this.roundCurrency(refreshedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0));
      const isFullyPaid = totalPaid >= liveGrandTotal;

      const updatedTicket = await tx.ticket.update({
        where: { id: dto.ticketId },
        data: {
          status: isFullyPaid ? "PAID" : "PAYMENT_PENDING",
          closedAt: isFullyPaid ? new Date() : null,
        },
      });
      if (isFullyPaid && liveTicket.tableId) {
        await this.releaseTableWithinTransaction(tx, liveTicket.tableId);
      }
      const stockConsumption = isFullyPaid
        ? await this.inventoryConsumptionService.applySaleConsumptionWithinTransaction(tx, dto.ticketId, actor)
        : { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };
      const registerSummary = await this.posRegisterService.recordSalePaymentsWithinTransaction(tx, {
        actor,
        branchId: ticket.branchId,
        terminalId: dto.terminalId ?? actor.terminalId ?? null,
        orderId: dto.ticketId,
        splits: normalizedSplits,
      });

      await tx.ticketEvent.create({
        data: {
          ticketId: dto.ticketId,
          type: "payment_completed",
          payload: {
            totalPaid,
            methods: normalizedSplits.map((split) => split.method),
          },
        },
      });

      const paymentPayload = {
        ticketId: dto.ticketId,
        amount: incomingAmount,
        totalPaid,
        status: updatedTicket.status,
      };
      this.posGateway.emitToTicket(dto.ticketId, "payment.completed", paymentPayload);
      this.posGateway.emitToTicket(dto.ticketId, "pos.payment.completed", paymentPayload);
      this.posGateway.emitToBranch(ticket.branchId, "payment.completed", paymentPayload);
      this.posGateway.emitToBranch(ticket.branchId, "pos.payment.completed", paymentPayload);

      return {
        payments: paymentRows,
        ticket: updatedTicket,
        totalPaid,
        remainingAmount: this.roundCurrency(Math.max(liveGrandTotal - totalPaid, 0)),
        stockConsumption,
        registerSummary,
        auditBefore: paymentAuditBefore,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: ticket.branchId,
      userId: actor.userId,
      module: "payments",
      action: "payment.collect",
      entityType: "ticket",
      entityId: dto.ticketId,
      payload: {
        splits: normalizedSplits,
        totalPaid: result.totalPaid,
        stockConsumption: result.stockConsumption,
        registerSummary: result.registerSummary,
      },
      oldValues: result.auditBefore,
      newValues: {
        ticketId: result.ticket.id,
        status: result.ticket.status,
        grandTotal: Number(result.ticket.grandTotal ?? 0),
        paidTotal: result.totalPaid,
        remainingAmount: result.remainingAmount,
        paymentCount: result.payments.length + result.auditBefore.paymentCount,
        payments: result.payments.map((payment) => ({
          id: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
          status: payment.status,
          referenceNumber: payment.referenceNumber,
        })),
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });

    await this.broadcastTicketUpdate(dto.ticketId);
    return result;
  }

  async splitTicket(ticketId: string, dto: SplitTicketDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Adisyon bolme");
    const source = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(source);
    const result = await this.prisma.$transaction(async (tx) => {
      const sourceItems = await tx.ticketItem.findMany({ where: { ticketId } });
      const target = await tx.ticket.create({
        data: {
          companyId: source.companyId,
          branchId: source.branchId,
          customerId: source.customerId,
          channel: (dto.targetChannel as any) ?? source.channel,
          ticketName: dto.ticketName ?? `${source.ticketName ?? "Adisyon"} / Bolum`,
          coverCount: source.coverCount,
          status: "OPEN",
        },
      });

      for (const line of dto.items) {
        const item = sourceItems.find((candidate) => candidate.id === line.itemId);
        if (!item) {
          throw new NotFoundException("Bolunecek satir bulunamadi.");
        }
        if (Number(item.quantity) < line.quantity) {
          throw new BadRequestException("Bolunecek miktar mevcut miktardan buyuk olamaz.");
        }

        await tx.ticketItem.create({
          data: {
            ticketId: target.id,
            productId: item.productId,
            productName: item.productName,
            quantity: line.quantity,
            unitPrice: item.unitPrice,
            discountTotal: 0,
            taxTotal: 0,
            lineTotal: Number(item.unitPrice) * line.quantity,
            notes: item.notes,
            modifiersJson: (item.modifiersJson ?? undefined) as any,
          },
        });

        const remainingQty = Number(item.quantity) - line.quantity;
        if (remainingQty <= 0) {
          await tx.ticketItem.delete({ where: { id: item.id } });
        } else {
          await tx.ticketItem.update({
            where: { id: item.id },
            data: {
              quantity: remainingQty,
              lineTotal: Number(item.unitPrice) * remainingQty,
            },
          });
        }
      }

      await this.recalculateTicketTotals(tx, ticketId);
      await this.recalculateTicketTotals(tx, target.id);
      return target;
    });

    await this.createTicketEvent(ticketId, "ticket_split", dto);
    await this.broadcastTicketUpdate(ticketId);
    await this.broadcastTicketUpdate(result.id);
    return {
      source: await this.getTicketDetail(ticketId, actor),
      target: await this.getTicketDetail(result.id, actor),
    };
  }

  async mergeTickets(dto: MergeTicketDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Adisyon birlestirme");
    const source = await this.getTicketOrThrow(dto.sourceTicketId, actor);
    const target = await this.getTicketOrThrow(dto.targetTicketId, actor);
    this.ensureTicketEditable(source);
    this.ensureTicketEditable(target);
    if (source.branchId !== target.branchId) {
      throw new BadRequestException("Sadece ayni subedeki adisyonlar birlestirilebilir.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketItem.updateMany({
        where: { ticketId: source.id },
        data: { ticketId: target.id },
      });
      await tx.ticket.update({
        where: { id: source.id },
        data: {
          status: "CANCELLED",
          closedAt: new Date(),
          tableId: null,
          ticketName: `${source.ticketName ?? source.id} / Birlesik`,
        },
      });
      await this.recalculateTicketTotals(tx, source.id);
      await this.recalculateTicketTotals(tx, target.id);
    });

    if (source.tableId && source.tableId !== target.tableId) {
      await this.releaseTable(source.tableId);
    }

    await this.createTicketEvent(target.id, "ticket_merged", dto);
    await this.broadcastTicketUpdate(source.id);
    await this.broadcastTicketUpdate(target.id);
    return {
      source: await this.getTicketDetail(source.id, actor),
      target: await this.getTicketDetail(target.id, actor),
    };
  }

  async transferTicket(ticketId: string, dto: TransferTicketDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Masa tasima");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);
    if (!dto.tableId) {
      throw new BadRequestException("Yeni masa secimi zorunlu.");
    }
    await this.ensureTableAccess(dto.tableId, actor, ticket.branchId);

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { tableId: dto.tableId },
    });

    if (ticket.tableId) {
      await this.releaseTable(ticket.tableId);
    }

    await this.prisma.diningTable.update({
      where: { id: dto.tableId },
      data: {
        status: "OCCUPIED",
        activeTicketId: ticketId,
      },
    });

    await this.createTicketEvent(ticketId, "ticket_transferred", dto);
    await this.broadcastTableStatus(dto.tableId);
    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
  }

  async voidTicket(ticketId: string, dto: { reason?: string }, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Adisyon iptal");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    const voidResult = await this.prisma.$transaction(async (tx) => {
      const liveTicket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: { payments: true, table: true },
      });
      if (!liveTicket || liveTicket.companyId !== actor.tenantId) {
        throw new NotFoundException("Adisyon bulunamadi.");
      }
      this.ensureBranchAccess(actor, liveTicket.branchId);
      if (liveTicket.status === "VOIDED") {
        throw new BadRequestException("Bu adisyon zaten iptal edildi.");
      }

      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: "VOIDED",
          closedAt: new Date(),
        },
      });

      const stockReversal =
        liveTicket.status === "PAID"
          ? await this.inventoryConsumptionService.reverseSaleConsumptionWithinTransaction(tx, ticketId, actor, "void", dto.reason ?? null)
          : { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };

      if (liveTicket.tableId) {
        await this.releaseTableWithinTransaction(tx, liveTicket.tableId);
      }

      return { updatedTicket, stockReversal };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.createTicketEvent(ticketId, "ticket_voided", { reason: dto.reason ?? null });
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: ticket.branchId,
      userId: actor.userId,
      module: "pos",
      action: "ticket.void",
      entityType: "ticket",
      entityId: ticketId,
      payload: {
        stockReversal: voidResult.stockReversal,
        reason: dto.reason ?? null,
      },
      oldValues: {
        status: ticket.status,
        grandTotal: Number(ticket.grandTotal ?? 0),
        closedAt: ticket.closedAt ?? null,
      },
      newValues: {
        status: voidResult.updatedTicket.status,
        grandTotal: Number(voidResult.updatedTicket.grandTotal ?? 0),
        closedAt: voidResult.updatedTicket.closedAt ?? null,
        reason: dto.reason ?? null,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });
    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
  }

  async requestRefund(ticketId: string, dto: RefundTicketDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Iade islemi");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureBranchAccess(actor, ticket.branchId);
    await this.posRegisterService.ensureActiveRegisterSession(ticket.branchId, actor, dto.terminalId ?? actor.terminalId ?? null);
    const requestedAmount = this.roundCurrency(Number(dto.amount));
    const isFullRefundRequest = requestedAmount >= this.roundCurrency(Number(ticket.grandTotal ?? 0)) - 0.01;
    const posRefund = await this.posIntegrationsService.startRefund(
      {
        branchId: ticket.branchId,
        terminalId: dto.terminalId ?? actor.terminalId ?? undefined,
        ticketId,
        amount: requestedAmount,
        currency: "TRY",
        meta: {
          paymentId: dto.paymentId ?? null,
          reason: dto.reason,
        },
      },
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        role: "pos_operator",
        branchIds: actor.branchIds,
        permissions: ["payment.manage"],
        terminalId: dto.terminalId ?? actor.terminalId ?? null,
      },
    );
    if (!posRefund.success) {
      throw new BadRequestException(posRefund.message || "POS iade islemi basarisiz.");
    }

    const refundResult = await this.prisma.$transaction(async (tx) => {
      const liveTicket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: { payments: true, table: true },
      });
      if (!liveTicket || liveTicket.companyId !== actor.tenantId) {
        throw new NotFoundException("Iade alinacak adisyon bulunamadi.");
      }
      this.ensureBranchAccess(actor, liveTicket.branchId);
      if (liveTicket.status !== "PAID") {
        throw new BadRequestException("Sadece odemesi tamamlanan adisyon icin iade islemi yapilabilir.");
      }

      const completedPayments = liveTicket.payments.filter((payment) => payment.status === "COMPLETED");
      const selectedPayment = dto.paymentId ? completedPayments.find((payment) => payment.id === dto.paymentId) : completedPayments[0];
      if (dto.paymentId && !selectedPayment) {
        throw new BadRequestException("Iade alinacak odeme kaydi bulunamadi.");
      }

      const recentDuplicate = await tx.refundRequest.findFirst({
        where: {
          ticketId,
          paymentId: dto.paymentId ?? null,
          amount: requestedAmount,
          reason: dto.reason,
          requestedByUserId: actor.userId,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recentDuplicate) {
        throw new BadRequestException("Ayni iade islemi zaten kaydedildi.");
      }

      const alreadyRefundedAmount = this.roundCurrency(
        (
          await tx.refundRequest.findMany({
            where: {
              ticketId,
              status: { in: ["requested", "completed"] },
            },
            select: { amount: true },
          })
        ).reduce((sum, refund) => sum + Number(refund.amount), 0),
      );
      const grandTotal = this.roundCurrency(Number(liveTicket.grandTotal ?? 0));
      if (alreadyRefundedAmount + requestedAmount > grandTotal + 0.01) {
        throw new BadRequestException("Iade tutari adisyon toplamindan buyuk olamaz.");
      }

      const refund = await tx.refundRequest.create({
        data: {
          companyId: actor.tenantId,
          branchId: liveTicket.branchId,
          ticketId,
          paymentId: dto.paymentId ?? null,
          reason: dto.reason,
          amount: requestedAmount,
          status: "completed",
          requestedByUserId: actor.userId,
          approvedByUserId: actor.userId,
          resolvedAt: new Date(),
        },
      });

      const registerSummary = await this.posRegisterService.recordRefundWithinTransaction(tx, {
        actor,
        branchId: liveTicket.branchId,
        terminalId: dto.terminalId ?? actor.terminalId ?? null,
        orderId: ticketId,
        amount: requestedAmount,
        method: (selectedPayment?.method ?? "CASH") as PaymentMethod,
      });

      const stockReversal = isFullRefundRequest
        ? await this.inventoryConsumptionService.reverseSaleConsumptionWithinTransaction(tx, ticketId, actor, "refund", dto.reason)
        : { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };

      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "refund_requested",
          payload: {
            refundRequestId: refund.id,
            amount: requestedAmount,
            isFullRefundRequest,
          },
        },
      });

      return {
        refund,
        registerSummary,
        stockReversal,
        auditBefore: {
          ticketId: liveTicket.id,
          status: liveTicket.status,
          grandTotal,
          alreadyRefundedAmount,
          paymentId: selectedPayment?.id ?? null,
          paymentMethod: selectedPayment?.method ?? "CASH",
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: ticket.branchId,
      userId: actor.userId,
      module: "payments",
      action: "ticket.refund",
      entityType: "refund_request",
      entityId: refundResult.refund.id,
      payload: {
        ticketId,
        requestedAmount,
        isFullRefundRequest,
        stockReversal: refundResult.stockReversal,
        registerSummary: refundResult.registerSummary,
      },
      oldValues: refundResult.auditBefore,
      newValues: {
        refundRequestId: refundResult.refund.id,
        ticketId,
        status: refundResult.refund.status,
        amount: Number(refundResult.refund.amount),
        reason: refundResult.refund.reason,
        refundedAmountAfter: this.roundCurrency(refundResult.auditBefore.alreadyRefundedAmount + requestedAmount),
        resolvedAt: refundResult.refund.resolvedAt,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });

    this.posGateway.emitToBranch(ticket.branchId, "refund.requested", {
      ticketId,
      refundRequestId: refundResult.refund.id,
      requestedByUserId: actor.userId,
      amount: requestedAmount,
    });
    await this.broadcastTicketUpdate(ticketId);
    return refundResult.refund;
  }

  async createApprovalRequest(dto: ApprovalRequestDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Onay talebi");
    const branchId = actor.branchIds[0];
    if (!branchId) {
      throw new BadRequestException("Onay istegi icin sube baglami gerekli.");
    }
    this.ensureBranchAccess(actor, branchId);
    const approval = await this.prisma.approvalRequest.create({
      data: {
        companyId: actor.tenantId,
        branchId,
        module: "pos",
        action: dto.action,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId ?? null,
        requestedByUserId: actor.userId,
        reason: dto.reason ?? null,
      },
    });

    this.posGateway.emitToBranch(branchId, "approval.required", {
      approvalRequestId: approval.id,
      action: approval.action,
      requestedByUserId: actor.userId,
      ticketId: dto.referenceType === "ticket" ? dto.referenceId : null,
    });
    return approval;
  }

  async dispatchPrinter(dto: PrinterDispatchDto, actor: PosActor) {
    if (this.isWaiterRole(actor) && dto.documentType !== "kitchen") {
      this.ensureWaiterCanRun(actor, "Yazdirma islemi");
    }
    const printer = await this.ensurePrinterAccess(dto.printerId, actor);
    if (!printer) {
      throw new NotFoundException("Yazici bulunamadi.");
    }
    if (!printer.connectionUri?.trim()) {
      const failedJob = await this.prisma.printerJob.create({
        data: {
          companyId: actor.tenantId,
          branchId: printer.branchId,
          printerId: printer.id,
          ticketId: dto.ticketId ?? null,
          jobType: dto.documentType,
          payload: {
            content: dto.content ?? null,
            requestedByUserId: actor.userId,
            reason: "missing_connection_uri",
          },
          status: "failed",
          requestedByUserId: actor.userId,
          completedAt: new Date(),
        },
      });
      throw new BadRequestException(`Yazici baglanti ayari eksik: ${printer.name}`);
    }

    const job = await this.prisma.printerJob.create({
      data: {
        companyId: actor.tenantId,
        branchId: printer.branchId,
        printerId: printer.id,
        ticketId: dto.ticketId ?? null,
        jobType: dto.documentType,
        payload: {
          content: dto.content ?? null,
          requestedByUserId: actor.userId,
        },
        status: "queued",
        requestedByUserId: actor.userId,
      },
    });

    if (dto.ticketId) {
      try {
        await this.createTicketEvent(dto.ticketId, "print_dispatched", {
          printerId: dto.printerId,
          documentType: dto.documentType,
          printerJobId: job.id,
        });
      } catch {
        // TicketEvent kaydi basarisiz olsa bile fiziksel yazdirma devam etmeli.
      }
    }

    try {
      if (dto.documentType === "receipt" && dto.content?.trim()) {
        const forcedPrinterName = process.env.POS_WINDOWS_PRINTER_NAME?.trim();
        const targetPrinterName = forcedPrinterName || printer.name;
        await this.sendReceiptToWindowsPrinter(targetPrinterName, dto.content);
      }
      this.posGateway.emitToBranch(printer.branchId, "pos.print.dispatched", {
        printerId: printer.id,
        printerJobId: job.id,
        ticketId: dto.ticketId ?? null,
        documentType: dto.documentType,
        requestedByUserId: actor.userId,
      });
      await this.prisma.printerJob.update({
        where: { id: job.id },
        data: {
          status: "sent",
          completedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.printerJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          payload: {
            content: dto.content ?? null,
            requestedByUserId: actor.userId,
            error: error instanceof Error ? error.message : "printer_dispatch_failed",
          } as Prisma.InputJsonValue,
        },
      });
      throw new BadRequestException("Yazdirma komutu gonderilemedi.");
    }

    return {
      success: true,
      jobId: job.id,
      printerId: printer.id,
      documentType: dto.documentType,
      queuedAt: new Date().toISOString(),
    };
  }

  private async sendReceiptToWindowsPrinter(printerName: string, content: string) {
    if (process.platform !== "win32") {
      return;
    }
    const tempFile = join(tmpdir(), `adisyon-receipt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.txt`);
    const rawHelperScriptPath = join(tmpdir(), `adisyon-raw-print-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.ps1`);
    // Termal yazicilar satir sonu ve sayfa sonu karakterine daha duyarli calisir.
    const normalizedContent = `${content.replace(/\r?\n/g, "\r\n")}\r\n\r\n\r\n\f`;
    await writeFile(tempFile, normalizedContent, "ascii");
    const rawHelperScript = `
param(
  [string]$PrinterName,
  [string]$ReceiptPath
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    try {
      var di = new DOCINFOA { pDocName = "Adisyon Fis", pDataType = "RAW" };
      if (!StartDocPrinter(hPrinter, 1, di)) return false;
      try {
        if (!StartPagePrinter(hPrinter)) return false;
        try {
          int written;
          return WritePrinter(hPrinter, bytes, bytes.Length, out written) && written == bytes.Length;
        } finally {
          EndPagePrinter(hPrinter);
        }
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@

$payload = [System.IO.File]::ReadAllBytes($ReceiptPath)
$init = [byte[]](0x1B,0x40)
$feed = [byte[]](0x0A,0x0A,0x0A)
$cut = [byte[]](0x1D,0x56,0x41,0x00)
$totalLength = $init.Length + $payload.Length + $feed.Length + $cut.Length
$all = New-Object byte[] $totalLength
[System.Buffer]::BlockCopy($init, 0, $all, 0, $init.Length)
[System.Buffer]::BlockCopy($payload, 0, $all, $init.Length, $payload.Length)
[System.Buffer]::BlockCopy($feed, 0, $all, $init.Length + $payload.Length, $feed.Length)
[System.Buffer]::BlockCopy($cut, 0, $all, $init.Length + $payload.Length + $feed.Length, $cut.Length)

if (-not [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $all)) {
  throw "RAW print failed."
}
`.trim();
    await writeFile(rawHelperScriptPath, rawHelperScript, "utf8");
    try {
      try {
        await execFileAsync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            rawHelperScriptPath,
            "-PrinterName",
            printerName,
            "-ReceiptPath",
            tempFile,
          ],
          { windowsHide: true },
        );
      } catch {
        try {
          await execFileAsync(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `$raw = Get-Content -LiteralPath '${tempFile.replace(/'/g, "''")}' -Raw; $raw | Out-Printer -Name '${printerName.replace(/'/g, "''")}'`,
            ],
            { windowsHide: true },
          );
        } catch {
          await execFileAsync("cmd.exe", ["/c", "print", `/D:${printerName}`, tempFile], { windowsHide: true });
        }
      }
    } finally {
      await rm(tempFile, { force: true });
      await rm(rawHelperScriptPath, { force: true });
    }
  }

  async testPrinter(dto: PrinterDispatchDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Yazici test islemi");
    const content =
      dto.content?.trim() ||
      `TEST CIKTISI\nTarih: ${new Date().toLocaleString("tr-TR")}\nTerminal: ${actor.terminalId ?? "-"}\nKullanici: ${actor.userId}`;
    return this.dispatchPrinter(
      {
        ...dto,
        ticketId: dto.ticketId ?? undefined,
        content,
      },
      actor,
    );
  }

  async openDrawer(dto: DrawerOpenDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Cekmece acma");
    const terminalId = dto.terminalId ?? actor.terminalId ?? null;
    if (!terminalId) {
      throw new BadRequestException("Cekmece acmak icin terminal gerekli.");
    }
    await this.ensureTerminalAccess(terminalId, actor);

    this.posGateway.emitToTerminal(terminalId, "pos.drawer.open", {
      terminalId,
      requestedByUserId: actor.userId,
      reason: dto.reason ?? null,
    });

    return {
      success: true,
      terminalId,
      openedAt: new Date().toISOString(),
    };
  }

  private async getTicketOrThrow(ticketId: string, actor: PosActor) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        customer: true,
        table: true,
        items: true,
        payments: true,
      },
    });
    if (!ticket || ticket.companyId !== actor.tenantId || !actor.branchIds.includes(ticket.branchId)) {
      throw new NotFoundException("Adisyon bulunamadi.");
    }
    return ticket;
  }

  private ensureTicketEditable(ticket: { status: string }) {
    if (["PAID", "CANCELLED", "VOIDED"].includes(ticket.status)) {
      throw new BadRequestException("Kapali adisyon uzerinde islem yapilamaz.");
    }
  }

  private ensureWaiterCanRun(actor: PosActor, operation: string) {
    if (this.isWaiterRole(actor)) {
      throw new ForbiddenException(`${operation} garson kullanicisi icin kapali.`);
    }
  }

  private isWaiterRole(actor: PosActor) {
    const role = String(actor.role ?? "").toLowerCase();
    return role.includes("waiter") || role.includes("garson");
  }

  private roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private ensureBranchAccess(actor: PosActor, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new BadRequestException("Bu sube icin yetkin yok.");
    }
  }

  private async ensureTableAccess(tableId: string, actor: PosActor, expectedBranchId?: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { id: tableId } });
    if (!table) {
      throw new NotFoundException("Masa bulunamadi.");
    }
    this.ensureBranchAccess(actor, table.branchId);
    if (expectedBranchId && table.branchId !== expectedBranchId) {
      throw new BadRequestException("Secilen masa farkli subeye ait.");
    }
    return table;
  }

  private async ensurePrinterAccess(printerId: string, actor: PosActor) {
    const printer = await this.prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer) {
      throw new NotFoundException("Yazici bulunamadi.");
    }
    this.ensureBranchAccess(actor, printer.branchId);
    return printer;
  }

  private async ensureTerminalAccess(terminalId: string, actor: PosActor) {
    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!terminal) {
      throw new NotFoundException("Terminal bulunamadi.");
    }
    this.ensureBranchAccess(actor, terminal.branchId);
    return terminal;
  }

  private async resolveLinePricing(
    tx: any,
    branchId: string,
    productId: string,
    variantIds?: string[],
    modifierOptionIds?: string[],
    requiredChoiceOptionIds?: string[],
  ) {
    const product = await tx.menuProduct.findUnique({
      where: { id: productId },
      include: { branchPrices: true, variants: true },
    });
    if (!product) {
      throw new NotFoundException("Urun bulunamadi.");
    }
    if (!product.isActive || !product.isVisible) {
      throw new BadRequestException("Secilen urun artik satisa uygun degil.");
    }

    const branchPrice = product.branchPrices.find((item: any) => item.branchId === branchId);
    let unitPrice = Number(branchPrice?.price ?? product.basePrice);
    if (!Number.isFinite(unitPrice)) {
      throw new BadRequestException("Secilen urunun gecerli satis fiyati bulunamadi.");
    }

    const selectedVariants = product.variants.filter((variant: any) => (variantIds ?? []).includes(variant.id));
    unitPrice += selectedVariants.reduce((sum: number, variant: any) => sum + Number(variant.priceDiff), 0);

    const [modifierOptions, requiredOptions] = await Promise.all([
      modifierOptionIds?.length ? tx.modifierOption.findMany({ where: { id: { in: modifierOptionIds } } }) : [],
      requiredChoiceOptionIds?.length ? tx.requiredChoiceOption.findMany({ where: { id: { in: requiredChoiceOptionIds } } }) : [],
    ]);

    unitPrice += modifierOptions.reduce((sum: number, option: any) => sum + Number(option.priceDiff), 0);
    unitPrice += requiredOptions.reduce((sum: number, option: any) => sum + Number(option.priceDiff), 0);
    if (!Number.isFinite(unitPrice)) {
      throw new BadRequestException("Secilen urunun guncel satis fiyati hesaplanamadi.");
    }

    return {
      productId: product.id,
      productName:
        selectedVariants.length > 0
          ? `${product.name} / ${selectedVariants.map((variant: any) => variant.name).join(", ")}`
          : product.name,
      unitPrice,
      modifiersJson: {
        variantIds: variantIds ?? [],
        modifierOptionIds: modifierOptionIds ?? [],
        requiredChoiceOptionIds: requiredChoiceOptionIds ?? [],
      },
    };
  }

  private async recalculateTicketTotals(tx: any, ticketId: string) {
    const [items, ticketDiscounts] = await Promise.all([
      tx.ticketItem.findMany({ where: { ticketId } }),
      tx.ticketDiscount.findMany({ where: { ticketId } }),
    ]);

    const discountMap = new Map<string, number>();
    let ticketLevelDiscount = 0;
    for (const discount of ticketDiscounts) {
      if (discount.ticketItemId) {
        discountMap.set(discount.ticketItemId, (discountMap.get(discount.ticketItemId) ?? 0) + Number(discount.amount));
      } else {
        ticketLevelDiscount += Number(discount.amount);
      }
    }

    for (const item of items) {
      const itemDiscountTotal = discountMap.get(item.id) ?? 0;
      if (Number(item.discountTotal) !== itemDiscountTotal) {
        await tx.ticketItem.update({
          where: { id: item.id },
          data: { discountTotal: itemDiscountTotal },
        });
      }
    }

    const subtotal = items.reduce((sum: number, row: any) => sum + Number(row.lineTotal), 0);
    const itemDiscountTotal = Array.from(discountMap.values()).reduce((sum, value) => sum + value, 0);
    const discountTotal = itemDiscountTotal + ticketLevelDiscount;
    const taxTotal = items.reduce((sum: number, row: any) => sum + Number(row.taxTotal ?? 0), 0);
    const grandTotal = Math.max(subtotal - discountTotal + taxTotal, 0);

    return tx.ticket.update({
      where: { id: ticketId },
      data: {
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
      },
    });
  }

  private async releaseTable(tableId: string) {
    await this.prisma.diningTable.update({
      where: { id: tableId },
      data: {
        status: "AVAILABLE",
        activeTicketId: null,
      },
    });
    await this.broadcastTableStatus(tableId);
  }

  private async releaseTableWithinTransaction(tx: Prisma.TransactionClient, tableId: string) {
    await tx.diningTable.update({
      where: { id: tableId },
      data: {
        status: "AVAILABLE",
        activeTicketId: null,
      },
    });
  }

  private async createTicketEvent(ticketId: string, type: string, payload: unknown) {
    try {
      await this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return;
      }
      throw error;
    }
  }

  private async broadcastTableStatus(tableId: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { id: tableId } });
    if (!table) return;
    const payload = {
      branchId: table.branchId,
      tableId: table.id,
      status: table.status,
      activeTicketId: table.activeTicketId,
    };
    this.posGateway.emitToBranch(table.branchId, "table.status.changed", payload);
    this.posGateway.emitToBranch(table.branchId, "pos.table.status.changed", payload);
  }

  private async broadcastTicketUpdate(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        customer: true,
        table: true,
        items: true,
        payments: true,
      },
    });
    if (!ticket) return;

    const payload = {
      ticketId,
      status: ticket.status,
      items: ticket.items.map((item) => this.serializeTicketItem(item)),
      totals: {
        subtotal: Number(ticket.subtotal),
        discountTotal: Number(ticket.discountTotal),
        taxTotal: Number(ticket.taxTotal),
        grandTotal: Number(ticket.grandTotal),
      },
      tableId: ticket.tableId,
    };

    this.posGateway.emitToBranch(ticket.branchId, "ticket.updated", payload);
    this.posGateway.emitToTicket(ticketId, "ticket.updated", payload);
    this.posGateway.emitToBranch(ticket.branchId, "pos.ticket.updated", payload);
    this.posGateway.emitToTicket(ticketId, "pos.ticket.updated", payload);
  }

  private serializeTicket(ticket: any) {
    const totalPaid = (ticket.payments ?? []).reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
    return {
      id: ticket.id,
      branchId: ticket.branchId,
      channel: ticket.channel,
      status: ticket.status,
      ticketName: ticket.ticketName,
      coverCount: ticket.coverCount,
      openedAt: ticket.openedAt?.toISOString?.() ?? ticket.openedAt,
      closedAt: ticket.closedAt?.toISOString?.() ?? ticket.closedAt,
      tableId: ticket.tableId,
      tableName: ticket.table?.name ?? null,
      customerId: ticket.customerId,
      customerName: ticket.customer?.businessName ?? ticket.customer?.fullName ?? null,
      customerPhone: ticket.customer?.phone ?? null,
      subtotal: Number(ticket.subtotal),
      discountTotal: Number(ticket.discountTotal),
      taxTotal: Number(ticket.taxTotal),
      grandTotal: Number(ticket.grandTotal),
      paidTotal: totalPaid,
      remainingAmount: Math.max(Number(ticket.grandTotal) - totalPaid, 0),
      items: (ticket.items ?? []).map((item: any) => this.serializeTicketItem(item)),
      payments: (ticket.payments ?? []).map((payment: any) => ({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: Number(payment.amount),
        referenceNumber: payment.referenceNumber,
        paidAt: payment.paidAt?.toISOString?.() ?? payment.paidAt,
      })),
    };
  }

  private serializeTicketItem(item: any) {
    return {
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountTotal: Number(item.discountTotal),
      taxTotal: Number(item.taxTotal),
      lineTotal: Number(item.lineTotal),
      notes: item.notes,
      modifiersJson: item.modifiersJson,
    };
  }
}
