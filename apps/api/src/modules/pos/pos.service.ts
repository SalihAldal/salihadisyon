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
import { SplitTicketByPersonDto } from "./dto/split-ticket-by-person.dto";
import {
  computeSplitLineParts,
  validatePersonAllocations,
  validateSplitLines,
  type SplitLineInput,
} from "./split-ticket.core";
import {
  calculateCompAmount,
  calculateDiscountAmount,
  canSelfApprove,
  isManagerRole,
  requiresManagerApproval,
  resolveDiscountBaseAmount,
  roundFinancial,
  validateMutationReason,
  type DiscountKind,
} from "./financial-mutation.core";
import { ApplyTicketDiscountDto } from "./dto/apply-ticket-discount.dto";
import { VoidTicketItemDto } from "./dto/void-ticket-item.dto";
import { ResolveApprovalDto } from "./dto/resolve-approval.dto";
import { TransferTicketDto } from "./dto/transfer-ticket.dto";
import { UpdateTicketDto } from "./dto/update-ticket.dto";
import { UpdateTicketItemDto } from "./dto/update-ticket-item.dto";
import { PosAdminService } from "./pos-admin.service";
import { PosRegisterService } from "./pos-register.service";
import { PosReportsService } from "./pos-reports.service";
import { PrintRoutingService } from "./print-routing.service";
import { buildPrinterTestContent, buildSlipContent } from "./print-template.service";
import { shouldSkipDuplicatePrint } from "./print-routing.core";
import { TicketPrintDispatchDto, PrinterBridgeAckDto, PrinterConnectionTestDto } from "./dto/print-routing.dto";
import { createConnection } from "net";

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
    private readonly printRoutingService: PrintRoutingService,
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
    const serialized = this.serializeTicket(ticket);
    const resolvedGroupId = ticket.splitGroupId ?? ticket.id;
    const siblings = await this.prisma.ticket.findMany({
      where: {
        companyId: actor.tenantId,
        branchId: ticket.branchId,
        OR: [{ splitGroupId: resolvedGroupId }, { id: resolvedGroupId }],
      },
        include: {
          customer: true,
          table: true,
          items: true,
          payments: true,
        },
        orderBy: { openedAt: "asc" },
    });
    serialized.splitAccounts = siblings.length > 1 ? siblings.map((row) => this.serializeTicket(row)) : [];
    return serialized;
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
    const dtoKeys = Object.entries(dto).filter(([, value]) => value !== undefined).map(([key]) => key);
    const coverCountOnly = dtoKeys.length === 1 && dtoKeys[0] === "coverCount";
    if (!coverCountOnly) {
      this.ensureWaiterCanRun(actor, "Adisyon guncelleme");
    }
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

  async requestBill(ticketId: string, actor: PosActor) {
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);

    if (ticket.billRequestedAt) {
      return this.getTicketDetail(ticketId, actor);
    }

    const now = new Date();
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        billRequestedAt: now,
        billRequestedByUserId: actor.userId,
      },
    });

    await this.createTicketEvent(ticketId, "bill_requested", {
      userId: actor.userId,
      requestedAt: now.toISOString(),
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: ticket.branchId,
      userId: actor.userId,
      module: "pos",
      action: "ticket.bill.request",
      entityType: "ticket",
      entityId: ticketId,
      payload: {
        tableId: ticket.tableId ?? null,
        requestedAt: now.toISOString(),
      },
    });

    const billPayload = {
      branchId: ticket.branchId,
      ticketId,
      tableId: ticket.tableId,
      billRequestedAt: now.toISOString(),
    };
    this.posGateway.emitToBranch(ticket.branchId, "pos.bill.requested", billPayload);
    this.posGateway.emitToBranch(ticket.branchId, "bill.requested", billPayload);

    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
  }

  async listTicketEvents(ticketId: string, actor: PosActor) {
    await this.getTicketOrThrow(ticketId, actor);
    const events = await this.prisma.ticketEvent.findMany({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      items: events.map((event) => ({
        id: event.id,
        type: event.type,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async addItem(ticketId: string, dto: AddTicketItemDto, actor: PosActor) {
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);

    await this.prisma.$transaction(async (tx) => {
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
          addedByUserId: actor.userId,
        },
      });

      await this.recalculateTicketTotals(tx, ticketId);
      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "item_added",
          payload: { itemId: item.id, quantity: dto.quantity, modifiersJson: pricedLine.modifiersJson, addedByUserId: actor.userId },
        },
      });

      const ticketTable = ticket.tableId
        ? await tx.diningTable.findUnique({
            where: { id: ticket.tableId },
            select: { id: true, name: true, code: true },
          })
        : null;

      await this.auditLogService.create({
        executor: tx,
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
    });

    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
  }

  async updateItem(ticketId: string, itemId: string, dto: UpdateTicketItemDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Urun duzenleme");
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);
    const item = await this.prisma.ticketItem.findUnique({ where: { id: itemId } });
    if (!item || item.ticketId !== ticketId) {
      throw new NotFoundException("Adisyon satiri bulunamadi.");
    }

    await this.prisma.$transaction(async (tx) => {
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
    });

    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
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

    let reason: string;
    try {
      reason = validateMutationReason(dto.reason);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Gecersiz gerekce.");
    }

    const discountKind: DiscountKind = dto.discountKind ?? "DISCOUNT";
    if (discountKind === "COMP" && !dto.ticketItemId) {
      throw new BadRequestException("Ikram yalnizca urun satiri bazinda uygulanabilir.");
    }

    const items = (ticket.items ?? []).map((item) => ({
      id: item.id,
      lineTotal: Number(item.lineTotal),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));

    let baseAmount: number;
    try {
      baseAmount = resolveDiscountBaseAmount({
        ticketItemId: dto.ticketItemId ?? null,
        items,
        ticketSubtotal: Number(ticket.subtotal),
        ticketGrandTotal: Number(ticket.grandTotal),
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Indirim taban tutari gecersiz.");
    }

    let amount: number;
    let percentage: number | null = null;
    try {
      if (discountKind === "COMP") {
        const item = items.find((row) => row.id === dto.ticketItemId);
        amount = calculateCompAmount(Number(item?.lineTotal ?? 0));
      } else {
        amount = calculateDiscountAmount({
          baseAmount,
          amount: dto.amount,
          percentage: dto.percentage,
          discountType: dto.discountType,
        });
        if (dto.percentage !== undefined && dto.percentage !== null) {
          percentage = Number(dto.percentage);
        }
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Indirim tutari gecersiz.");
    }

    const needsApproval = requiresManagerApproval({
      discountKind,
      actorRole: actor.role,
      approvalRequired: dto.approvalRequired,
    });
    const beforeGrandTotal = Number(ticket.grandTotal);

    const discount = await this.runSerializableTransaction(async (tx) => {
      let approvalRequestId: string | null = null;
      if (needsApproval) {
        const approval = await tx.approvalRequest.create({
          data: {
            companyId: actor.tenantId,
            branchId: ticket.branchId,
            module: "pos",
            action: discountKind === "COMP" ? "ticket.comp" : "ticket.discount",
            referenceType: "ticket",
            referenceId: ticketId,
            requestedByUserId: actor.userId,
            reason,
            payload: {
              ticketItemId: dto.ticketItemId ?? null,
              amount,
              discountKind,
              label: dto.label,
            } as Prisma.InputJsonValue,
          },
        });
        approvalRequestId = approval.id;
      }

      const created = await tx.ticketDiscount.create({
        data: {
          companyId: actor.tenantId,
          branchId: ticket.branchId,
          ticketId,
          ticketItemId: dto.ticketItemId ?? null,
          discountType: dto.discountType,
          discountKind,
          label: dto.label,
          amount,
          originalAmount: baseAmount,
          percentage: percentage ?? undefined,
          reason,
          approvalRequired: needsApproval,
          approvalRequestId,
          status: needsApproval ? "pending" : "applied",
          approvedByUserId: needsApproval ? null : actor.userId,
          createdByUserId: actor.userId,
        },
      });

      if (!needsApproval) {
        await this.syncItemDiscountTotals(tx, ticketId, dto.ticketItemId ?? null);
        await this.recalculateTicketTotals(tx, ticketId);
      }

      return created;
    });

    const afterDetail = needsApproval ? null : await this.getTicketOrThrow(ticketId, actor);
    const auditAction = discountKind === "COMP" ? "ticket.comp" : "ticket.discount";
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: ticket.branchId,
      userId: actor.userId,
      module: "pos",
      action: auditAction,
      entityType: "ticket_discount",
      entityId: discount.id,
      payload: {
        ticketId,
        ticketItemId: dto.ticketItemId ?? null,
        discountKind,
        label: dto.label,
        amount,
        originalAmount: baseAmount,
        percentage,
        reason,
        approvalRequired: needsApproval,
        approvalRequestId: discount.approvalRequestId,
        status: discount.status,
      },
      oldValues: { grandTotal: beforeGrandTotal },
      newValues: {
        grandTotal: afterDetail ? Number(afterDetail.grandTotal) : beforeGrandTotal,
        discountAmount: amount,
        status: discount.status,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });

    await this.createTicketEvent(ticketId, discountKind === "COMP" ? "comp_applied" : "discount_applied", {
      discountId: discount.id,
      amount,
      status: discount.status,
      reason,
    });

    if (needsApproval) {
      this.posGateway.emitToBranch(ticket.branchId, "approval.required", {
        approvalRequestId: discount.approvalRequestId,
        action: auditAction,
        requestedByUserId: actor.userId,
        ticketId,
      });
    } else {
      this.posGateway.emitToBranch(ticket.branchId, discountKind === "COMP" ? "ticket.comp" : "ticket.discount", {
        ticketId,
        discountId: discount.id,
        amount,
      });
      await this.broadcastTicketUpdate(ticketId);
    }

    return this.getTicketDetail(ticketId, actor);
  }

  async voidItem(ticketId: string, itemId: string, dto: VoidTicketItemDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Urun iptali");
    let reason: string;
    try {
      reason = validateMutationReason(dto.reason);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Gecersiz gerekce.");
    }

    const ticket = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketEditable(ticket);
    const item = (ticket.items ?? []).find((row) => row.id === itemId);
    if (!item) {
      throw new NotFoundException("Adisyon satiri bulunamadi.");
    }

    const voidQuantity = dto.quantity ?? Number(item.quantity);
    if (!Number.isFinite(voidQuantity) || voidQuantity <= 0) {
      throw new BadRequestException("Iptal miktari gecersiz.");
    }
    if (voidQuantity > Number(item.quantity) + 0.0001) {
      throw new BadRequestException("Iptal miktari mevcut miktardan buyuk olamaz.");
    }

    const beforeGrandTotal = Number(ticket.grandTotal);
    const originalAmount = Number(item.lineTotal);
    const ticketTable = ticket.table
      ? { tableId: ticket.table.id ?? null, tableName: ticket.table.name ?? null, tableCode: ticket.table.code ?? null }
      : { tableId: ticket.tableId ?? null, tableName: null, tableCode: null };

    await this.runSerializableTransaction(async (tx) => {
      const liveItem = await tx.ticketItem.findUnique({ where: { id: itemId } });
      if (!liveItem || liveItem.ticketId !== ticketId) {
        throw new NotFoundException("Adisyon satiri bulunamadi.");
      }
      const liveQty = Number(liveItem.quantity);
      if (voidQuantity > liveQty + 0.0001) {
        throw new BadRequestException("Iptal miktari mevcut miktardan buyuk olamaz.");
      }

      const sentEvents = await tx.ticketEvent.count({
        where: {
          ticketId,
          type: { in: ["print_dispatched", "sent_to_kitchen"] },
        },
      });
      const wasSent = sentEvents > 0;

      if (voidQuantity >= liveQty - 0.0001) {
        await tx.ticketItem.delete({ where: { id: itemId } });
        await tx.ticketDiscount.deleteMany({ where: { ticketId, ticketItemId: itemId } });
      } else {
        const remainingQty = roundFinancial(liveQty - voidQuantity);
        const unitPrice = Number(liveItem.unitPrice);
        await tx.ticketItem.update({
          where: { id: itemId },
          data: {
            quantity: remainingQty,
            lineTotal: roundFinancial(unitPrice * remainingQty),
          },
        });
      }

      await this.recalculateTicketTotals(tx, ticketId);
      const liveTicket = await tx.ticket.findUnique({ where: { id: ticketId }, include: { payments: true } });
      if (!liveTicket) {
        throw new NotFoundException("Adisyon bulunamadi.");
      }
      const paidTotal = this.roundCurrency((liveTicket.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0));
      const nextGrandTotal = this.roundCurrency(Number(liveTicket.grandTotal));
      if (paidTotal > nextGrandTotal + 0.01) {
        throw new BadRequestException("Odeme alinmis tutar yeni toplamin uzerinde. Once iade gerekir.");
      }

      await tx.ticketEvent.create({
        data: {
          ticketId,
          type: "item_voided",
          payload: {
            itemId,
            reason,
            quantity: voidQuantity,
            originalAmount,
            wasSent,
          },
        },
      });

      await this.auditLogService.create({
        executor: tx,
        companyId: actor.tenantId,
        branchId: ticket.branchId,
        userId: actor.userId,
        module: "pos",
        action: "ticket.item.void",
        entityType: "ticket_item",
        entityId: itemId,
        payload: {
          ticketId,
          ...ticketTable,
          productId: item.productId ?? null,
          productName: item.productName,
          quantity: voidQuantity,
          originalAmount,
          reason,
          wasSent,
          voidedAt: new Date().toISOString(),
        },
        oldValues: { grandTotal: beforeGrandTotal, itemQuantity: liveQty, itemLineTotal: originalAmount },
        newValues: { grandTotal: nextGrandTotal, voidQuantity, reason },
      });
    });

    this.posGateway.emitToTicket(ticketId, "ticket.item.voided", { ticketId, itemId, reason });
    this.posGateway.emitToTicket(ticketId, "pos.ticket.item.voided", { ticketId, itemId, reason });
    await this.broadcastTicketUpdate(ticketId);
    return this.getTicketDetail(ticketId, actor);
  }

  async approveApprovalRequest(approvalId: string, dto: ResolveApprovalDto, actor: PosActor) {
    if (!isManagerRole(actor.role)) {
      throw new ForbiddenException("Onay yetkiniz yok.");
    }

    const resolved = await this.runSerializableTransaction(async (tx) => {
      const approval = await tx.approvalRequest.findUnique({ where: { id: approvalId } });
      if (!approval || approval.companyId !== actor.tenantId) {
        throw new NotFoundException("Onay talebi bulunamadi.");
      }
      this.ensureBranchAccess(actor, approval.branchId);
      if (approval.status !== "pending") {
        throw new BadRequestException("Onay talebi zaten sonuclandi.");
      }
      if (canSelfApprove(actor.userId, approval.requestedByUserId)) {
        throw new ForbiddenException("Kendi isleminizi onaylayamazsiniz.");
      }

      const updatedApproval = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: {
          status: "approved",
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          payload: {
            ...((approval.payload as Record<string, unknown> | null) ?? {}),
            approvalNote: dto.note ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      const discount = await tx.ticketDiscount.findFirst({ where: { approvalRequestId: approvalId } });
      if (discount) {
        await tx.ticketDiscount.update({
          where: { id: discount.id },
          data: { status: "applied", approvedByUserId: actor.userId },
        });
        await this.syncItemDiscountTotals(tx, discount.ticketId, discount.ticketItemId);
        await this.recalculateTicketTotals(tx, discount.ticketId);
      }

      return { approval: updatedApproval, discount };
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: resolved.approval.branchId,
      userId: actor.userId,
      module: "pos",
      action: "approval.approve",
      entityType: "approval_request",
      entityId: approvalId,
      payload: {
        referenceType: resolved.approval.referenceType,
        referenceId: resolved.approval.referenceId,
        note: dto.note ?? null,
        discountId: resolved.discount?.id ?? null,
      },
    });

    if (resolved.discount) {
      await this.broadcastTicketUpdate(resolved.discount.ticketId);
    }

    this.posGateway.emitToBranch(resolved.approval.branchId, "approval.resolved", {
      approvalRequestId: approvalId,
      status: "approved",
    });

    return resolved.approval;
  }

  async rejectApprovalRequest(approvalId: string, dto: ResolveApprovalDto, actor: PosActor) {
    if (!isManagerRole(actor.role)) {
      throw new ForbiddenException("Onay yetkiniz yok.");
    }

    const resolved = await this.runSerializableTransaction(async (tx) => {
      const approval = await tx.approvalRequest.findUnique({ where: { id: approvalId } });
      if (!approval || approval.companyId !== actor.tenantId) {
        throw new NotFoundException("Onay talebi bulunamadi.");
      }
      this.ensureBranchAccess(actor, approval.branchId);
      if (approval.status !== "pending") {
        throw new BadRequestException("Onay talebi zaten sonuclandi.");
      }
      if (canSelfApprove(actor.userId, approval.requestedByUserId)) {
        throw new ForbiddenException("Kendi isleminizi reddedemezsiniz.");
      }

      const updatedApproval = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: {
          status: "rejected",
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          payload: {
            ...((approval.payload as Record<string, unknown> | null) ?? {}),
            rejectionNote: dto.note ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.ticketDiscount.updateMany({
        where: { approvalRequestId: approvalId, status: "pending" },
        data: { status: "rejected" },
      });

      return updatedApproval;
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: resolved.branchId,
      userId: actor.userId,
      module: "pos",
      action: "approval.reject",
      entityType: "approval_request",
      entityId: approvalId,
      payload: { note: dto.note ?? null },
    });

    this.posGateway.emitToBranch(resolved.branchId, "approval.resolved", {
      approvalRequestId: approvalId,
      status: "rejected",
    });

    return resolved;
  }

  private async syncItemDiscountTotals(tx: Prisma.TransactionClient, ticketId: string, ticketItemId: string | null) {
    if (!ticketItemId) {
      return;
    }
    const discounts = await tx.ticketDiscount.findMany({
      where: { ticketId, ticketItemId, status: "applied" },
    });
    const itemDiscountTotal = discounts.reduce((sum, row) => sum + Number(row.amount), 0);
    await tx.ticketItem.update({
      where: { id: ticketItemId },
      data: { discountTotal: itemDiscountTotal },
    });
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
          billRequestedAt: null,
          billRequestedByUserId: null,
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
    this.ensureTicketSplittable(source);

    const sourceItems = source.items.map((item) => ({
      id: item.id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountTotal: Number(item.discountTotal),
      taxTotal: Number(item.taxTotal),
      lineTotal: Number(item.lineTotal),
    }));

    try {
      validateSplitLines(dto.items, sourceItems);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Gecersiz bolme istegi.");
    }

    const splitGroupId = source.splitGroupId ?? source.id;
    const result = await this.runSerializableTransaction(async (tx) =>
      this.executeSplitToTarget(tx, {
        source,
        lines: dto.items,
        actor,
        splitGroupId,
        ticketName: dto.ticketName ?? `${source.ticketName ?? "Adisyon"} / Bolum`,
        targetChannel: dto.targetChannel ?? source.channel,
        splitMethod: "item_quantity",
      }),
    );

    await this.createTicketEvent(ticketId, "ticket_split", {
      targetTicketId: result.target.id,
      items: dto.items,
      splitMethod: "item_quantity",
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: source.branchId,
      userId: actor.userId,
      module: "pos",
      action: "ticket.split",
      entityType: "ticket",
      entityId: ticketId,
      payload: {
        splitMethod: "item_quantity",
        targetTicketId: result.target.id,
        items: dto.items,
      },
      oldValues: {
        sourceTicketId: ticketId,
        sourceItemCount: source.items.length,
        sourceGrandTotal: Number(source.grandTotal),
      },
      newValues: {
        targetTicketId: result.target.id,
        targetGrandTotal: Number(result.target.grandTotal),
        movedLines: dto.items,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });

    this.posGateway.emitToBranch(source.branchId, "ticket.split", {
      sourceTicketId: ticketId,
      targetTicketId: result.target.id,
      splitGroupId,
    });
    this.posGateway.emitToTicket(ticketId, "pos.ticket.split", { targetTicketId: result.target.id });
    this.posGateway.emitToTicket(result.target.id, "pos.ticket.split", { sourceTicketId: ticketId });

    await this.broadcastTicketUpdate(ticketId);
    await this.broadcastTicketUpdate(result.target.id);

    return {
      source: await this.getTicketDetail(ticketId, actor),
      target: await this.getTicketDetail(result.target.id, actor),
      splitGroupId,
    };
  }

  async splitTicketByPerson(ticketId: string, dto: SplitTicketByPersonDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Adisyon bolme");
    const source = await this.getTicketOrThrow(ticketId, actor);
    this.ensureTicketSplittable(source);

    const sourceItems = source.items.map((item) => ({
      id: item.id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountTotal: Number(item.discountTotal),
      taxTotal: Number(item.taxTotal),
      lineTotal: Number(item.lineTotal),
    }));

    try {
      validatePersonAllocations(dto.persons, sourceItems);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Gecersiz kisi bazli bolme istegi.");
    }

    const splitGroupId = source.splitGroupId ?? source.id;
    const targets: Array<{ id: string; personLabel: string | null; grandTotal: number }> = [];

    await this.runSerializableTransaction(async (tx) => {
      for (const [index, person] of dto.persons.entries()) {
        const liveSource = await tx.ticket.findUniqueOrThrow({
          where: { id: ticketId },
          include: { items: true, payments: true, table: true, customer: true },
        });
        this.ensureTicketSplittable(liveSource);
        const label = person.label?.trim() || `Kisi ${index + 1}`;
        const created = await this.executeSplitToTarget(tx, {
          source: liveSource,
          lines: person.items,
          actor,
          splitGroupId,
          ticketName: `${liveSource.ticketName ?? "Adisyon"} / ${label}`,
          targetChannel: dto.targetChannel ?? liveSource.channel,
          splitMethod: "by_person",
          personLabel: label,
        });
        targets.push({
          id: created.target.id,
          personLabel: label,
          grandTotal: Number(created.target.grandTotal),
        });
      }
    });

    await this.createTicketEvent(ticketId, "ticket_split_by_person", {
      splitGroupId,
      persons: dto.persons.map((person, index) => ({
        label: person.label ?? `Kisi ${index + 1}`,
        items: person.items,
      })),
      targets,
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: source.branchId,
      userId: actor.userId,
      module: "pos",
      action: "ticket.split.by_person",
      entityType: "ticket",
      entityId: ticketId,
      payload: {
        splitGroupId,
        persons: dto.persons,
        targets,
      },
      oldValues: {
        sourceTicketId: ticketId,
        sourceGrandTotal: Number(source.grandTotal),
      },
      newValues: {
        targetTicketIds: targets.map((row) => row.id),
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });

    this.posGateway.emitToBranch(source.branchId, "ticket.split", {
      sourceTicketId: ticketId,
      targetTicketIds: targets.map((row) => row.id),
      splitGroupId,
    });
    await this.broadcastTicketUpdate(ticketId);
    for (const target of targets) {
      await this.broadcastTicketUpdate(target.id);
    }

    return {
      source: await this.getTicketDetail(ticketId, actor),
      targets: await Promise.all(targets.map((target) => this.getTicketDetail(target.id, actor))),
      splitGroupId,
    };
  }

  async mergeTickets(dto: MergeTicketDto, actor: PosActor, pathTicketId?: string) {
    this.ensureWaiterCanRun(actor, "Adisyon birlestirme");
    if (pathTicketId && pathTicketId !== dto.targetTicketId) {
      throw new BadRequestException("Birlestirme hedefi URL ile uyusmuyor.");
    }
    if (dto.sourceTicketId === dto.targetTicketId) {
      throw new BadRequestException("Kaynak ve hedef adisyon ayni olamaz.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.ticket.findUnique({
          where: { id: dto.sourceTicketId },
          include: { items: true, payments: true, table: true },
        }),
        tx.ticket.findUnique({
          where: { id: dto.targetTicketId },
          include: { items: true, payments: true, table: true },
        }),
      ]);

      if (!source || source.companyId !== actor.tenantId || !actor.branchIds.includes(source.branchId)) {
        throw new NotFoundException("Kaynak adisyon bulunamadi.");
      }
      if (!target || target.companyId !== actor.tenantId || !actor.branchIds.includes(target.branchId)) {
        throw new NotFoundException("Hedef adisyon bulunamadi.");
      }
      this.ensureTicketEditable(source);
      this.ensureTicketEditable(target);
      if (source.branchId !== target.branchId) {
        throw new BadRequestException("Sadece ayni subedeki adisyonlar birlestirilebilir.");
      }
      if (source.status === "CANCELLED") {
        throw new BadRequestException("Kaynak adisyon zaten birlestirilmis veya iptal edilmis.");
      }

      const movedItemCount = source.items.length;
      const movedPaymentCount = source.payments.length;

      await tx.ticketItem.updateMany({
        where: { ticketId: source.id },
        data: { ticketId: target.id },
      });
      await tx.payment.updateMany({
        where: { ticketId: source.id },
        data: { ticketId: target.id },
      });
      await tx.ticketDiscount.updateMany({
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

      if (source.tableId && source.tableId !== target.tableId) {
        await this.releaseTableWithinTransaction(tx, source.tableId);
      }

      if (target.tableId) {
        await tx.diningTable.update({
          where: { id: target.tableId },
          data: {
            status: "OCCUPIED",
            activeTicketId: target.id,
          },
        });
      }

      await this.recalculateTicketTotals(tx, source.id);
      const updatedTarget = await this.recalculateTicketTotals(tx, target.id);

      const mergedPayments = await tx.payment.findMany({ where: { ticketId: target.id } });
      const totalPaid = this.roundCurrency(mergedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0));
      const grandTotal = this.roundCurrency(Number(updatedTarget.grandTotal ?? 0));
      if (totalPaid > 0 && totalPaid < grandTotal - 0.01) {
        await tx.ticket.update({
          where: { id: target.id },
          data: { status: "PAYMENT_PENDING" },
        });
      }

      return {
        source,
        target,
        movedItemCount,
        movedPaymentCount,
        sourceTableId: source.tableId,
        targetTableId: target.tableId,
        auditBefore: {
          sourceTicketId: source.id,
          targetTicketId: target.id,
          sourceItemCount: source.items.length,
          targetItemCount: target.items.length,
          sourcePaymentCount: source.payments.length,
          targetPaymentCount: target.payments.length,
          sourceStatus: source.status,
          targetStatus: target.status,
          sourceGrandTotal: Number(source.grandTotal),
          targetGrandTotal: Number(target.grandTotal),
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.createTicketEvent(result.target.id, "ticket_merged", {
      sourceTicketId: dto.sourceTicketId,
      targetTicketId: dto.targetTicketId,
      movedItemCount: result.movedItemCount,
      movedPaymentCount: result.movedPaymentCount,
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: result.target.branchId,
      userId: actor.userId,
      module: "pos",
      action: "ticket.merge",
      entityType: "ticket",
      entityId: result.target.id,
      payload: {
        sourceTicketId: dto.sourceTicketId,
        targetTicketId: dto.targetTicketId,
        movedItemCount: result.movedItemCount,
        movedPaymentCount: result.movedPaymentCount,
      },
      oldValues: result.auditBefore,
      newValues: {
        sourceTicketId: dto.sourceTicketId,
        targetTicketId: dto.targetTicketId,
        sourceStatus: "CANCELLED",
        targetStatus: result.target.status,
        movedItemCount: result.movedItemCount,
        movedPaymentCount: result.movedPaymentCount,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });

    if (result.sourceTableId && result.sourceTableId !== result.targetTableId) {
      await this.broadcastTableStatus(result.sourceTableId);
    }
    if (result.targetTableId) {
      await this.broadcastTableStatus(result.targetTableId);
    }
    await this.broadcastTicketUpdate(result.source.id);
    await this.broadcastTicketUpdate(result.target.id);

    return {
      source: await this.getTicketDetail(result.source.id, actor),
      target: await this.getTicketDetail(result.target.id, actor),
    };
  }

  async transferTicket(ticketId: string, dto: TransferTicketDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Masa tasima");
    if (!dto.tableId) {
      throw new BadRequestException("Yeni masa secimi zorunlu.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: { table: true, items: true },
      });
      if (!ticket || ticket.companyId !== actor.tenantId || !actor.branchIds.includes(ticket.branchId)) {
        throw new NotFoundException("Adisyon bulunamadi.");
      }
      this.ensureTicketEditable(ticket);

      if (ticket.tableId === dto.tableId) {
        throw new BadRequestException("Adisyon zaten bu masada.");
      }

      const targetTable = await tx.diningTable.findUnique({ where: { id: dto.tableId } });
      if (!targetTable) {
        throw new NotFoundException("Masa bulunamadi.");
      }
      if (targetTable.branchId !== ticket.branchId) {
        throw new BadRequestException("Secilen masa farkli subeye ait.");
      }
      this.ensureBranchAccess(actor, targetTable.branchId);

      if (targetTable.activeTicketId && targetTable.activeTicketId !== ticketId) {
        throw new BadRequestException("Hedef masa baska bir adisyon tarafindan kullaniliyor.");
      }
      if (targetTable.status !== "AVAILABLE" && targetTable.activeTicketId !== ticketId) {
        throw new BadRequestException("Hedef masa musait degil.");
      }

      const previousTableId = ticket.tableId;

      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: { tableId: dto.tableId },
      });

      if (previousTableId && previousTableId !== dto.tableId) {
        await this.releaseTableWithinTransaction(tx, previousTableId);
      }

      await tx.diningTable.update({
        where: { id: dto.tableId },
        data: {
          status: "OCCUPIED",
          activeTicketId: ticketId,
        },
      });

      return {
        updatedTicket,
        previousTableId,
        targetTableId: dto.tableId,
        branchId: ticket.branchId,
        auditBefore: {
          tableId: ticket.tableId,
          tableName: ticket.table?.name ?? null,
          status: ticket.status,
          itemCount: ticket.items.length,
        },
        auditAfter: {
          tableId: dto.tableId,
          tableName: targetTable.name,
          status: updatedTicket.status,
          itemCount: ticket.items.length,
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.createTicketEvent(ticketId, "ticket_transferred", {
      tableId: dto.tableId,
      previousTableId: result.previousTableId ?? null,
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: result.branchId,
      userId: actor.userId,
      module: "pos",
      action: "ticket.transfer",
      entityType: "ticket",
      entityId: ticketId,
      payload: { tableId: dto.tableId, previousTableId: result.previousTableId ?? null },
      oldValues: result.auditBefore,
      newValues: result.auditAfter,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? actor.terminalId ?? null,
    });

    if (result.previousTableId) {
      await this.broadcastTableStatus(result.previousTableId);
    }
    await this.broadcastTableStatus(result.targetTableId);
    await this.broadcastTicketUpdate(ticketId);

    return this.getTicketDetail(ticketId, actor);
  }

  async voidTicket(ticketId: string, dto: { reason?: string }, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Adisyon iptal");
    let reason: string;
    try {
      reason = validateMutationReason(dto.reason);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Iptal gerekcesi zorunlu.");
    }
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
          voidReason: reason,
          billRequestedAt: null,
          billRequestedByUserId: null,
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
        reason,
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
        reason,
        voidReason: reason,
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
      const delivery = await this.deliverPrintJob(
        job.id,
        printer,
        dto.content ?? "",
        actor,
        printer.branchId,
        {
          ticketId: dto.ticketId ?? "",
          destinationCode: dto.documentType,
          documentType: dto.documentType,
        },
      );
      if (delivery.deliveryMode === "bridge") {
        return {
          success: true,
          jobId: job.id,
          printerId: printer.id,
          documentType: dto.documentType,
          queuedAt: new Date().toISOString(),
          requiresLocalPrint: true,
          status: "queued",
        };
      }
      await this.prisma.printerJob.update({
        where: { id: job.id },
        data: {
          status: "sent",
          completedAt: new Date(),
        },
      });
      return {
        success: true,
        jobId: job.id,
        printerId: printer.id,
        documentType: dto.documentType,
        queuedAt: new Date().toISOString(),
      };
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
    const printer = await this.ensurePrinterAccess(dto.printerId, actor);
    const branch = await this.prisma.branch.findUnique({ where: { id: printer.branchId } });
    const destination = printer.printDestinationId
      ? await this.prisma.printDestination.findUnique({ where: { id: printer.printDestinationId } })
      : null;
    const content =
      dto.content?.trim() ||
      buildPrinterTestContent({
        slipName: printer.displayName ?? destination?.name ?? "Test Fisi",
        printerName: printer.name,
        branchName: branch?.name,
        destinationName: destination?.name,
      });
    return this.dispatchPrinter(
      {
        ...dto,
        ticketId: dto.ticketId ?? undefined,
        content,
      },
      actor,
    );
  }

  async testPrinterConnection(dto: PrinterConnectionTestDto, actor: PosActor) {
    this.ensureWaiterCanRun(actor, "Yazici baglanti testi");
    const branchId = dto.branchId ?? actor.branchIds[0];
    if (!branchId) {
      throw new BadRequestException("Sube bilgisi gerekli.");
    }
    this.ensureBranchAccess(actor, branchId);
    const bridgeResult = await this.probeLocalPrintBridge(dto.printerName);
    return {
      printerName: dto.printerName,
      branchId,
      ...bridgeResult,
    };
  }

  async dispatchTicketPrintRouting(ticketId: string, dto: TicketPrintDispatchDto, actor: PosActor) {
    if (dto.trigger === "receipt") {
      this.ensureWaiterCanRun(actor, "Kasa fisi yazdirma");
    }
    const ticket = await this.getTicketOrThrow(ticketId, actor);
    const branch = await this.prisma.branch.findUnique({
      where: { id: ticket.branchId },
      include: { company: true },
    });
    const routingContext = await this.printRoutingService.loadBranchRoutingContext(ticket.branchId, actor.tenantId);
    const items = (ticket.items ?? []).map((item) => ({
      id: item.id,
      productId: String(item.productId ?? ""),
      productName: item.productName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      discountTotal: Number(item.discountTotal),
      notes: item.notes,
      modifiersJson: (item.modifiersJson as Record<string, unknown> | null) ?? null,
    }));
    const plan = this.printRoutingService.buildPlan({
      trigger: dto.trigger,
      items,
      ...routingContext,
    });
    if (!plan.groups.length) {
      throw new BadRequestException("Yazdirilacak fis bulunamadi.");
    }

    const results: Array<Record<string, unknown>> = [];
    for (const group of plan.groups) {
      const idempotencyKey = this.printRoutingService.buildIdempotencyKey({
        ticketId,
        destinationCode: group.destination.code,
        trigger: dto.trigger,
        printBatchId: dto.printBatchId,
      });
      const existing = await this.prisma.printerJob.findUnique({ where: { idempotencyKey } });
      if (existing && shouldSkipDuplicatePrint(existing.status)) {
        results.push({
          destinationCode: group.destination.code,
          destinationName: group.destination.name,
          jobId: existing.id,
          status: existing.status,
          skipped: true,
        });
        continue;
      }

      const printerMatch = await this.printRoutingService.findPrinterForDestination(ticket.branchId, group.destination.code);
      if (!printerMatch) {
        const failedJob = await this.prisma.printerJob.create({
          data: {
            companyId: actor.tenantId,
            branchId: ticket.branchId,
            ticketId,
            printDestinationId: null,
            destinationCode: group.destination.code,
            idempotencyKey,
            jobType: dto.trigger === "receipt" ? "receipt" : "kitchen",
            payload: {
              reason: "printer_not_configured",
              destinationCode: group.destination.code,
              requestedByUserId: actor.userId,
            },
            status: "failed",
            requestedByUserId: actor.userId,
            completedAt: new Date(),
          },
        });
        results.push({
          destinationCode: group.destination.code,
          destinationName: group.destination.name,
          jobId: failedJob.id,
          status: "failed",
          error: "Bu fislik icin yazici tanimi bulunamadi.",
        });
        continue;
      }

      const content = buildSlipContent(
        group.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          notes: item.notes,
        })),
        {
          businessName: branch?.company?.name ?? "ADISYON SISTEMI",
          branchName: branch?.name ?? "-",
          tableLabel: ticket.table?.name ?? "-",
          ticketLabel: ticket.ticketName ?? ticket.id,
          destinationName: group.destination.name,
          destinationCode: group.destination.code,
          printerName: printerMatch.printer.name,
          openedAt: ticket.openedAt,
          closedAt: ticket.closedAt,
          isCashRegister: group.destination.isCashRegister,
          subtotal: Number(ticket.subtotal),
          discountTotal: Number(ticket.discountTotal),
          taxTotal: Number(ticket.taxTotal),
          grandTotal: Number(ticket.grandTotal),
          payments: (ticket.payments ?? []).map((payment) => ({
            method: String(payment.method),
            amount: Number(payment.amount),
          })),
        },
      );

      const job = await this.prisma.printerJob.create({
        data: {
          companyId: actor.tenantId,
          branchId: ticket.branchId,
          printerId: printerMatch.printer.id,
          ticketId,
          printDestinationId: printerMatch.destination.id,
          destinationCode: group.destination.code,
          idempotencyKey,
          jobType: dto.trigger === "receipt" ? "receipt" : "kitchen",
          payload: {
            content,
            destinationCode: group.destination.code,
            printBatchId: dto.printBatchId,
            requestedByUserId: actor.userId,
          },
          status: "queued",
          requestedByUserId: actor.userId,
        },
      });

      try {
        const delivery = await this.deliverPrintJob(job.id, printerMatch.printer, content, actor, ticket.branchId, {
          ticketId,
          destinationCode: group.destination.code,
          documentType: dto.trigger === "receipt" ? "receipt" : "kitchen",
        });
        results.push({
          destinationCode: group.destination.code,
          destinationName: group.destination.name,
          jobId: job.id,
          printerId: printerMatch.printer.id,
          printerName: printerMatch.printer.name,
          content: delivery.requiresLocalPrint ? content : undefined,
          ...delivery,
        });
      } catch (error) {
        await this.prisma.printerJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            payload: {
              content,
              destinationCode: group.destination.code,
              printBatchId: dto.printBatchId,
              requestedByUserId: actor.userId,
              error: error instanceof Error ? error.message : "print_failed",
            } as Prisma.InputJsonValue,
          },
        });
        results.push({
          destinationCode: group.destination.code,
          destinationName: group.destination.name,
          jobId: job.id,
          status: "failed",
          error: error instanceof Error ? error.message : "print_failed",
        });
      }
    }

    return {
      ticketId,
      trigger: dto.trigger,
      printBatchId: dto.printBatchId,
      results,
    };
  }

  async acknowledgePrintJob(jobId: string, dto: PrinterBridgeAckDto, actor: PosActor) {
    const job = await this.prisma.printerJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== actor.tenantId || !actor.branchIds.includes(job.branchId)) {
      throw new NotFoundException("Yazdirma isi bulunamadi.");
    }
    await this.prisma.printerJob.update({
      where: { id: jobId },
      data: {
        status: dto.status,
        completedAt: new Date(),
        payload: {
          ...(typeof job.payload === "object" && job.payload ? (job.payload as Record<string, unknown>) : {}),
          bridgeAckByUserId: actor.userId,
          error: dto.error ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    return { success: dto.status === "sent", jobId, status: dto.status };
  }

  private async deliverPrintJob(
    jobId: string,
    printer: { id: string; name: string; connectionUri: string },
    content: string,
    actor: PosActor,
    branchId: string,
    meta: { ticketId: string; destinationCode: string; documentType: string },
  ) {
    const uri = String(printer.connectionUri ?? "").trim().toLowerCase();
    if (uri.startsWith("bridge://")) {
      this.posGateway.emitToBranch(branchId, "pos.print.job.ready", {
        jobId,
        printerId: printer.id,
        printerName: printer.name,
        ticketId: meta.ticketId,
        destinationCode: meta.destinationCode,
        documentType: meta.documentType,
        content,
        requestedByUserId: actor.userId,
      });
      return { status: "queued", deliveryMode: "bridge", requiresLocalPrint: true };
    }

    if (uri.startsWith("tcp://")) {
      await this.sendToNetworkPrinter(uri, content);
      await this.prisma.printerJob.update({
        where: { id: jobId },
        data: { status: "sent", completedAt: new Date() },
      });
      this.posGateway.emitToBranch(branchId, "pos.print.dispatched", {
        printerId: printer.id,
        printerJobId: jobId,
        ticketId: meta.ticketId,
        documentType: meta.documentType,
        destinationCode: meta.destinationCode,
        requestedByUserId: actor.userId,
      });
      return { status: "sent", deliveryMode: "network" };
    }

    if (process.platform === "win32") {
      const forcedPrinterName = process.env.POS_WINDOWS_PRINTER_NAME?.trim();
      await this.sendReceiptToWindowsPrinter(forcedPrinterName || printer.name, content);
      await this.prisma.printerJob.update({
        where: { id: jobId },
        data: { status: "sent", completedAt: new Date() },
      });
      this.posGateway.emitToBranch(branchId, "pos.print.dispatched", {
        printerId: printer.id,
        printerJobId: jobId,
        ticketId: meta.ticketId,
        documentType: meta.documentType,
        destinationCode: meta.destinationCode,
        requestedByUserId: actor.userId,
      });
      return { status: "sent", deliveryMode: "server-windows" };
    }

    throw new BadRequestException("Yazici erisimi unavailable. Local print bridge gerekli.");
  }

  private async probeLocalPrintBridge(printerName: string) {
    const bridgeUrl = process.env.POS_PRINT_BRIDGE_URL ?? "http://127.0.0.1:9247";
    try {
      const response = await fetch(`${bridgeUrl}/printers/${encodeURIComponent(printerName)}/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.POS_PRINT_BRIDGE_TOKEN ?? "dev-bridge-token"}`,
        },
      });
      if (!response.ok) {
        return { reachable: false, printerFound: false, status: "unavailable" as const };
      }
      const payload = (await response.json()) as { found?: boolean; status?: string };
      return {
        reachable: true,
        printerFound: Boolean(payload.found),
        status: (payload.status ?? (payload.found ? "online" : "offline")) as "online" | "offline" | "unknown" | "unavailable",
      };
    } catch {
      return { reachable: false, printerFound: false, status: "unknown" as const };
    }
  }

  private async sendToNetworkPrinter(connectionUri: string, content: string) {
    const parsed = new URL(connectionUri);
    const host = parsed.hostname;
    const port = Number(parsed.port || 9100);
    if (!host) {
      throw new BadRequestException("Gecersiz yazici baglanti adresi.");
    }
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host, port }, () => {
        socket.write(`${content.replace(/\r?\n/g, "\r\n")}\r\n\r\n\f`, "ascii", (error) => {
          socket.end();
          if (error) reject(error);
          else resolve();
        });
      });
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new BadRequestException("Ag yazicisina baglanilamadi."));
      });
      socket.on("error", (error) => reject(error));
    });
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
        items: {
          include: {
            addedByUser: { select: { id: true, fullName: true } },
          },
        },
        payments: true,
      },
    });
    if (!ticket || ticket.companyId !== actor.tenantId || !actor.branchIds.includes(ticket.branchId)) {
      throw new NotFoundException("Adisyon bulunamadi.");
    }
    const discounts = await this.prisma.ticketDiscount.findMany({ where: { ticketId } });
    return { ...ticket, discounts };
  }

  private ensureTicketEditable(ticket: { status: string }) {
    if (["PAID", "CANCELLED", "VOIDED"].includes(ticket.status)) {
      throw new BadRequestException("Kapali adisyon uzerinde islem yapilamaz.");
    }
  }

  private ensureTicketSplittable(ticket: { status: string; payments?: Array<{ amount: unknown }> }) {
    this.ensureTicketEditable(ticket);
    const paidTotal = this.roundCurrency((ticket.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0));
    if (paidTotal > 0) {
      throw new BadRequestException("Odeme alinmis adisyon bolunemez.");
    }
  }

  private async executeSplitToTarget(
    tx: Prisma.TransactionClient,
    input: {
      source: {
        id: string;
        companyId: string;
        branchId: string;
        customerId: string | null;
        tableId: string | null;
        coverCount: number;
        ticketName: string | null;
        channel: string;
        splitGroupId?: string | null;
      };
      lines: SplitLineInput[];
      actor: PosActor;
      splitGroupId: string;
      ticketName: string;
      targetChannel: string;
      splitMethod: string;
      personLabel?: string;
    },
  ) {
    const sourceItems = await tx.ticketItem.findMany({ where: { ticketId: input.source.id } });
    const itemMap = new Map(sourceItems.map((item) => [item.id, item]));

    if (!input.source.splitGroupId) {
      await tx.ticket.update({
        where: { id: input.source.id },
        data: { splitGroupId: input.splitGroupId },
      });
    }

    const target = await tx.ticket.create({
      data: {
        companyId: input.source.companyId,
        branchId: input.source.branchId,
        customerId: input.source.customerId,
        tableId: input.source.tableId,
        channel: input.targetChannel as any,
        ticketName: input.ticketName,
        coverCount: 1,
        status: "OPEN",
        parentTicketId: input.source.id,
        splitGroupId: input.splitGroupId,
        personLabel: input.personLabel ?? null,
      },
    });

    const requestedByItem = new Map<string, number>();
    for (const line of input.lines) {
      requestedByItem.set(line.itemId, (requestedByItem.get(line.itemId) ?? 0) + line.quantity);
    }

    for (const [itemId, requestedQty] of requestedByItem.entries()) {
      const item = itemMap.get(itemId);
      if (!item) {
        throw new NotFoundException("Bolunecek satir bulunamadi.");
      }

      const availableQty = Number(item.quantity);
      if (requestedQty > this.roundCurrency(availableQty) + 0.0001) {
        throw new BadRequestException("Bolunecek miktar mevcut miktardan buyuk olamaz.");
      }

      const snapshot = {
        id: item.id,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountTotal: Number(item.discountTotal),
        taxTotal: Number(item.taxTotal),
        lineTotal: Number(item.lineTotal),
      };
      const parts = computeSplitLineParts(snapshot, requestedQty);

      const newItem = await tx.ticketItem.create({
        data: {
          ticketId: target.id,
          productId: item.productId,
          productName: item.productName,
          quantity: parts.quantity,
          unitPrice: parts.unitPrice,
          discountTotal: parts.discountTotal,
          taxTotal: parts.taxTotal,
          lineTotal: parts.lineTotal,
          notes: item.notes,
          modifiersJson: (item.modifiersJson ?? undefined) as any,
          addedByUserId: item.addedByUserId,
        },
      });

      const itemDiscounts = await tx.ticketDiscount.findMany({
        where: { ticketId: input.source.id, ticketItemId: item.id },
      });
      for (const discount of itemDiscounts) {
        const ratio = requestedQty / Number(item.quantity);
        const movedAmount = this.roundCurrency(Number(discount.amount) * ratio);
        if (movedAmount <= 0) continue;
        await tx.ticketDiscount.create({
          data: {
            companyId: input.source.companyId,
            branchId: input.source.branchId,
            ticketId: target.id,
            ticketItemId: newItem.id,
            discountType: discount.discountType,
            label: discount.label,
            amount: movedAmount,
            approvalRequired: discount.approvalRequired,
            approvedByUserId: discount.approvedByUserId,
          },
        });
        const remainingDiscount = this.roundCurrency(Number(discount.amount) - movedAmount);
        if (remainingDiscount <= 0) {
          await tx.ticketDiscount.delete({ where: { id: discount.id } });
        } else {
          await tx.ticketDiscount.update({
            where: { id: discount.id },
            data: { amount: remainingDiscount },
          });
        }
      }

      if (parts.remainingQty <= 0) {
        await tx.ticketItem.delete({ where: { id: item.id } });
      } else {
        await tx.ticketItem.update({
          where: { id: item.id },
          data: {
            quantity: parts.remainingQty,
            discountTotal: parts.remainingDiscount,
            taxTotal: parts.remainingTax,
            lineTotal: parts.remainingLineTotal,
          },
        });
      }
    }

    await this.recalculateTicketTotals(tx, input.source.id);
    const updatedTarget = await this.recalculateTicketTotals(tx, target.id);

    await tx.ticketSplit.create({
      data: {
        companyId: input.source.companyId,
        branchId: input.source.branchId,
        sourceTicketId: input.source.id,
        targetTicketId: target.id,
        splitMethod: input.splitMethod,
        createdByUserId: input.actor.userId,
        payload: {
          lines: input.lines,
          personLabel: input.personLabel ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    return { target: updatedTarget };
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

  private async runSerializableTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(handler, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2028")) {
        throw new BadRequestException("Es zamanli islem nedeniyle bolme tekrar denenmeli.");
      }
      throw error;
    }
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
      tx.ticketDiscount.findMany({ where: { ticketId, status: "applied" } }),
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
        items: {
          include: {
            addedByUser: { select: { id: true, fullName: true } },
          },
        },
        payments: true,
      },
    });
    if (!ticket) return;

    const serialized = this.serializeTicket(ticket);
    const payload = {
      ticketId,
      status: ticket.status,
      coverCount: ticket.coverCount,
      openedAt: ticket.openedAt?.toISOString?.() ?? ticket.openedAt,
      billRequestedAt: ticket.billRequestedAt?.toISOString?.() ?? ticket.billRequestedAt ?? null,
      ticketName: ticket.ticketName,
      items: serialized.items,
      totals: {
        subtotal: Number(ticket.subtotal),
        discountTotal: Number(ticket.discountTotal),
        taxTotal: Number(ticket.taxTotal),
        grandTotal: Number(ticket.grandTotal),
        paidTotal: serialized.paidTotal,
        remainingAmount: serialized.remainingAmount,
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
      parentTicketId: ticket.parentTicketId ?? null,
      splitGroupId: ticket.splitGroupId ?? null,
      personLabel: ticket.personLabel ?? null,
      subtotal: Number(ticket.subtotal),
      discountTotal: Number(ticket.discountTotal),
      taxTotal: Number(ticket.taxTotal),
      grandTotal: Number(ticket.grandTotal),
      paidTotal: this.roundCurrency(totalPaid),
      remainingAmount: this.roundCurrency(Math.max(Number(ticket.grandTotal) - totalPaid, 0)),
      voidReason: ticket.voidReason ?? null,
      billRequestedAt: ticket.billRequestedAt?.toISOString?.() ?? ticket.billRequestedAt ?? null,
      billRequestedByUserId: ticket.billRequestedByUserId ?? null,
      items: (ticket.items ?? []).map((item: any) => this.serializeTicketItem(item)),
      discounts: (ticket.discounts ?? []).map((discount: any) => this.serializeTicketDiscount(discount)),
      payments: (ticket.payments ?? []).map((payment: any) => ({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: Number(payment.amount),
        referenceNumber: payment.referenceNumber,
        paidAt: payment.paidAt?.toISOString?.() ?? payment.paidAt,
      })),
      splitAccounts: ticket.splitAccounts ?? undefined,
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
      addedByUserId: item.addedByUserId ?? null,
      addedByName: item.addedByUser?.fullName ?? null,
    };
  }

  private serializeTicketDiscount(discount: any) {
    return {
      id: discount.id,
      ticketItemId: discount.ticketItemId,
      discountType: discount.discountType,
      discountKind: discount.discountKind ?? "DISCOUNT",
      label: discount.label,
      amount: Number(discount.amount),
      originalAmount: discount.originalAmount ? Number(discount.originalAmount) : null,
      percentage: discount.percentage ? Number(discount.percentage) : null,
      reason: discount.reason ?? null,
      status: discount.status ?? "applied",
      approvalRequired: Boolean(discount.approvalRequired),
      approvalRequestId: discount.approvalRequestId ?? null,
      createdAt: discount.createdAt?.toISOString?.() ?? discount.createdAt,
    };
  }
}
