import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { PosGateway } from "../pos/pos.gateway";

type InventoryConsumptionActor = {
  tenantId: string;
  userId: string;
  branchIds: string[];
};

type ReversalReason = "void" | "refund";

type TicketRecipeLine = {
  referenceId: string;
  inventoryItemId: string;
  warehouseId: string;
  inventoryItemName: string;
  unitSymbol: string;
  quantity: number;
  productName: string;
  unitCost: number;
  sourceType: "product_stock" | "recipe_item" | "modifier_option" | "required_choice_option";
  sourceLabel: string;
};

@Injectable()
export class InventoryConsumptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly posGateway: PosGateway,
  ) {}

  async validateTicketSaleAvailability(ticketId: string, actor: InventoryConsumptionActor) {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await this.loadTicket(tx, ticketId, actor);
      const recipeLines = await this.collectRecipeLines(tx, ticket);
      if (!recipeLines.length) {
        return;
      }
      await this.ensureStockAvailability(tx, recipeLines);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true };
  }

  async applySaleConsumptionWithinTransaction(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actor: InventoryConsumptionActor,
  ) {
    return this.prepareSaleConsumption(tx, ticketId, actor);
  }

  async reverseSaleConsumptionWithinTransaction(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actor: InventoryConsumptionActor,
    reason: ReversalReason,
    note?: string | null,
  ) {
    return this.prepareSaleReversal(tx, ticketId, actor, reason, note);
  }

  async syncSalesConsumption(actor: InventoryConsumptionActor, branchId?: string) {
    const branchIds = branchId ? [branchId] : actor.branchIds;
    const tickets = await this.prisma.ticket.findMany({
      where: {
        companyId: actor.tenantId,
        branchId: { in: branchIds },
        status: "PAID",
        items: {
          some: {
            productId: { not: null },
          },
        },
      },
      select: { id: true },
      orderBy: { closedAt: "asc" },
    });

    let syncedCount = 0;
    for (const ticket of tickets) {
      const result = await this.prisma.$transaction((tx) => this.prepareSaleConsumption(tx, ticket.id, actor), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      syncedCount += result.entryCount;
    }

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: branchId ?? null,
      userId: actor.userId,
      module: "inventory",
      action: "sales.sync",
      entityType: "ticket",
      entityId: null,
      payload: {
        branchIds,
        syncedCount,
        scannedTickets: tickets.length,
      },
    });

    return { success: true, syncedCount };
  }

  private async prepareSaleConsumption(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actor: InventoryConsumptionActor,
  ) {
    const ticket = await this.loadTicket(tx, ticketId, actor);
    if (ticket.status !== "PAID") {
      throw new BadRequestException("Stok dusumu sadece odemesi tamamlanan adisyonda uygulanir.");
    }

    const recipeLines = await this.collectRecipeLines(tx, ticket);
    if (!recipeLines.length) {
      return { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };
    }

    const existingEntries = await tx.stockEntry.findMany({
      where: {
        referenceType: "sale_ticket_item",
        referenceId: { in: recipeLines.map((line) => line.referenceId) },
      },
      select: { referenceId: true },
    });
    const existingRefs = new Set(existingEntries.map((entry) => entry.referenceId ?? ""));
    const pendingLines = recipeLines.filter((line) => !existingRefs.has(line.referenceId));

    if (!pendingLines.length) {
      return { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };
    }

    await this.ensureStockAvailability(tx, pendingLines);
    await this.applyMovementLines(tx, pendingLines, "sale");
    return {
      entryCount: pendingLines.length,
      inventoryItemCount: new Set(pendingLines.map((line) => line.inventoryItemId)).size,
      theoreticalCost: this.roundAmount(pendingLines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0)),
    };
  }

  private async prepareSaleReversal(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actor: InventoryConsumptionActor,
    reason: ReversalReason,
    note?: string | null,
  ) {
    const ticket = await this.loadTicket(tx, ticketId, actor);
    const recipeLines = await this.collectRecipeLines(tx, ticket);
    if (!recipeLines.length) {
      return { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };
    }

    const existingSales = await tx.stockEntry.findMany({
      where: {
        referenceType: "sale_ticket_item",
        referenceId: { in: recipeLines.map((line) => line.referenceId) },
      },
      select: { referenceId: true },
    });
    const consumedRefs = new Set(existingSales.map((entry) => entry.referenceId ?? ""));
    if (!consumedRefs.size) {
      return { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };
    }

    const reversalType = reason === "void" ? "sale_ticket_item_void" : "sale_ticket_item_refund";
    const existingReversals = await tx.stockEntry.findMany({
      where: {
        referenceType: reversalType,
        referenceId: { in: recipeLines.map((line) => line.referenceId) },
      },
      select: { referenceId: true },
    });
    const reversedRefs = new Set(existingReversals.map((entry) => entry.referenceId ?? ""));
    const pendingLines = recipeLines.filter((line) => consumedRefs.has(line.referenceId) && !reversedRefs.has(line.referenceId));

    if (!pendingLines.length) {
      return { entryCount: 0, inventoryItemCount: 0, theoreticalCost: 0 };
    }

    await this.applyMovementLines(tx, pendingLines, reversalType, note ?? null);
    return {
      entryCount: pendingLines.length,
      inventoryItemCount: new Set(pendingLines.map((line) => line.inventoryItemId)).size,
      theoreticalCost: this.roundAmount(pendingLines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0)),
    };
  }

  private async applyMovementLines(
    tx: Prisma.TransactionClient,
    lines: TicketRecipeLine[],
    referenceType: "sale" | "sale_ticket_item_void" | "sale_ticket_item_refund",
    extraNote?: string | null,
  ) {
    const aggregated = new Map<
      string,
      {
        quantity: number;
        warehouseId: string;
      }
    >();

    for (const line of lines) {
      const bucket = aggregated.get(line.inventoryItemId);
      if (bucket) {
        bucket.quantity += line.quantity;
      } else {
        aggregated.set(line.inventoryItemId, {
          quantity: line.quantity,
          warehouseId: line.warehouseId,
        });
      }
    }

    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        id: { in: [...aggregated.keys()] },
      },
      include: {
        warehouse: true,
      },
    });
    const itemMap = new Map(inventoryItems.map((item) => [item.id, item]));

    for (const [inventoryItemId, bucket] of aggregated.entries()) {
      const item = itemMap.get(inventoryItemId);
      if (!item) {
        throw new NotFoundException("Hammadde karti bulunamadi.");
      }

      const effect = referenceType === "sale" ? -bucket.quantity : bucket.quantity;
      const nextStock = Number(item.currentStock) + effect;
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: {
          currentStock: nextStock,
        },
      });
    }

    await tx.stockEntry.createMany({
      data: lines.map((line) => ({
        warehouseId: line.warehouseId,
        inventoryItemId: line.inventoryItemId,
        entryType: referenceType === "sale" ? "sale" : "sale_reversal",
        quantity: line.quantity,
        referenceType: referenceType === "sale" ? "sale_ticket_item" : referenceType,
        referenceId: line.referenceId,
        notes:
          referenceType === "sale"
            ? `${line.productName} satisindan otomatik stok dusumu (${line.sourceLabel})`
            : `${line.productName} ${referenceType === "sale_ticket_item_void" ? "iptali" : "iadesi"} nedeniyle stok geri alimi (${line.sourceLabel})${extraNote ? ` (${extraNote})` : ""}`,
      })),
    });

    const branchIds = [...new Set(inventoryItems.map((item) => String(item.warehouse.branchId)))];
    const payload = {
      source:
        referenceType === "sale"
          ? "sale"
          : referenceType === "sale_ticket_item_void"
            ? "sale_void"
            : "sale_refund",
      inventoryItemIds: [...aggregated.keys()],
      affectedItemCount: aggregated.size,
      movementCount: lines.length,
    };
    for (const branchId of branchIds) {
      this.posGateway.emitToBranch(branchId, "inventory.stock.changed", {
        branchId,
        ...payload,
      });
      this.posGateway.emitToBranch(branchId, "pos.inventory.stock.changed", {
        branchId,
        ...payload,
      });
    }

    for (const inventoryItemId of aggregated.keys()) {
      await this.refreshAlert(tx, inventoryItemId);
    }
  }

  private async ensureStockAvailability(tx: Prisma.TransactionClient, lines: TicketRecipeLine[]) {
    const aggregated = new Map<string, { quantity: number }>();
    for (const line of lines) {
      const bucket = aggregated.get(line.inventoryItemId);
      if (bucket) {
        bucket.quantity += line.quantity;
      } else {
        aggregated.set(line.inventoryItemId, { quantity: line.quantity });
      }
    }

    const inventoryItems = await tx.inventoryItem.findMany({
      where: { id: { in: [...aggregated.keys()] } },
    });
    const itemMap = new Map(inventoryItems.map((item) => [item.id, item]));

    for (const [inventoryItemId, bucket] of aggregated.entries()) {
      const item = itemMap.get(inventoryItemId);
      if (!item) {
        throw new NotFoundException("Hammadde karti bulunamadi.");
      }
      const nextStock = Number(item.currentStock) - bucket.quantity;
      if (nextStock < 0) {
        throw new BadRequestException(`${item.name} icin stok yetersiz.`);
      }
    }
  }

  private async loadTicket(tx: Prisma.TransactionClient, ticketId: string, actor: InventoryConsumptionActor) {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: {
        items: {
          include: {
            product: {
              include: {
                stockItem: {
                  include: {
                    warehouse: true,
                    unit: true,
                    stockEntries: {
                      where: { unitCost: { not: null } },
                      orderBy: { createdAt: "desc" },
                      take: 1,
                    },
                  },
                },
                recipe: {
                  include: {
                    items: {
                      include: {
                        inventoryItem: {
                          include: {
                            warehouse: true,
                            unit: true,
                            stockEntries: {
                              where: { unitCost: { not: null } },
                              orderBy: { createdAt: "desc" },
                              take: 1,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!ticket || ticket.companyId !== actor.tenantId) {
      throw new NotFoundException("Adisyon bulunamadi.");
    }
    if (!actor.branchIds.includes(ticket.branchId)) {
      throw new BadRequestException("Bu sube icin stok tuketimi yetkin yok.");
    }

    return ticket;
  }

  private async collectRecipeLines(
    tx: Prisma.TransactionClient,
    ticket: Awaited<ReturnType<InventoryConsumptionService["loadTicket"]>>,
  ) {
    const lines: TicketRecipeLine[] = [];
    const modifierOptionIds = new Set<string>();
    const requiredChoiceOptionIds = new Set<string>();

    for (const ticketItem of ticket.items) {
      const modifiers = (ticketItem.modifiersJson ?? {}) as Record<string, unknown>;
      for (const optionId of ((modifiers.modifierOptionIds as Array<unknown> | undefined) ?? []).map((item) => String(item))) {
        if (optionId) modifierOptionIds.add(optionId);
      }
      for (const optionId of ((modifiers.requiredChoiceOptionIds as Array<unknown> | undefined) ?? []).map((item) => String(item))) {
        if (optionId) requiredChoiceOptionIds.add(optionId);
      }
    }

    const modifierOptions = modifierOptionIds.size
      ? tx.modifierOption.findMany({
          where: { id: { in: [...modifierOptionIds] } },
          include: {
            inventoryItem: {
              include: {
                warehouse: true,
                unit: true,
                stockEntries: {
                  where: { unitCost: { not: null } },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        })
      : Promise.resolve([]);

    const requiredChoiceOptions = requiredChoiceOptionIds.size
      ? tx.requiredChoiceOption.findMany({
          where: { id: { in: [...requiredChoiceOptionIds] } },
          include: {
            inventoryItem: {
              include: {
                warehouse: true,
                unit: true,
                stockEntries: {
                  where: { unitCost: { not: null } },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        })
      : Promise.resolve([]);

    const [modifierOptionRows, requiredChoiceOptionRows] = await Promise.all([modifierOptions, requiredChoiceOptions]);
    const modifierOptionMap = new Map(modifierOptionRows.map((option) => [option.id, option]));
    const requiredChoiceOptionMap = new Map(requiredChoiceOptionRows.map((option) => [option.id, option]));

    for (const ticketItem of ticket.items) {
      if (ticketItem.product?.stockItem) {
        if (ticketItem.product.stockItem.warehouse.branchId !== ticket.branchId) {
          throw new BadRequestException(
            `${ticketItem.productName} icin bagli stok karti farkli sube deposunda. Urun stok baglantisini duzeltmeden satis tamamlanamaz.`,
          );
        }

        const directQuantity = Number(ticketItem.quantity);
        if (directQuantity > 0) {
          lines.push({
            referenceId: `${ticketItem.id}:product-stock:${ticketItem.product.id}`,
            inventoryItemId: ticketItem.product.stockItem.id,
            warehouseId: ticketItem.product.stockItem.warehouseId,
            inventoryItemName: ticketItem.product.stockItem.name,
            unitSymbol: ticketItem.product.stockItem.unit.symbol,
            quantity: directQuantity,
            productName: ticketItem.productName,
            unitCost: Number(ticketItem.product.stockItem.stockEntries[0]?.unitCost ?? 0),
            sourceType: "product_stock",
            sourceLabel: ticketItem.product.stockItem.name,
          });
        }
      }

      const recipeItems = ticketItem.product?.recipe?.items ?? [];
      for (const recipeItem of recipeItems) {
        if (recipeItem.inventoryItem.warehouse.branchId !== ticket.branchId) {
          throw new BadRequestException(
            `${ticketItem.productName} icin bagli hammadde farkli sube deposunda. Receteyi duzeltmeden satis tamamlanamaz.`,
          );
        }

        const quantity = Number(ticketItem.quantity) * Number(recipeItem.quantity);
        if (quantity <= 0) {
          continue;
        }

        lines.push({
          referenceId: `${ticketItem.id}:${recipeItem.id}`,
          inventoryItemId: recipeItem.inventoryItemId,
          warehouseId: recipeItem.inventoryItem.warehouseId,
          inventoryItemName: recipeItem.inventoryItem.name,
          unitSymbol: recipeItem.inventoryItem.unit.symbol,
          quantity,
          productName: ticketItem.productName,
          unitCost: Number(recipeItem.inventoryItem.stockEntries[0]?.unitCost ?? 0),
          sourceType: "recipe_item",
          sourceLabel: recipeItem.inventoryItem.name,
        });
      }

      const modifiers = (ticketItem.modifiersJson ?? {}) as Record<string, unknown>;
      for (const optionId of ((modifiers.modifierOptionIds as Array<unknown> | undefined) ?? []).map((item) => String(item))) {
        const option = modifierOptionMap.get(optionId);
        if (!option?.inventoryItem || Number(option.stockQuantity ?? 0) <= 0) continue;
        if (option.inventoryItem.warehouse.branchId !== ticket.branchId) {
          throw new BadRequestException(
            `${ticketItem.productName} icin secilen ${option.name} opsiyonu farkli sube deposuna bagli. Opsiyon stok baglantisini duzeltmeden satis tamamlanamaz.`,
          );
        }
        const optionQuantity = Number(ticketItem.quantity) * Number(option.stockQuantity ?? 0);
        if (optionQuantity <= 0) continue;
        lines.push({
          referenceId: `${ticketItem.id}:modifier-option:${option.id}`,
          inventoryItemId: option.inventoryItem.id,
          warehouseId: option.inventoryItem.warehouseId,
          inventoryItemName: option.inventoryItem.name,
          unitSymbol: option.inventoryItem.unit.symbol,
          quantity: optionQuantity,
          productName: ticketItem.productName,
          unitCost: Number(option.inventoryItem.stockEntries[0]?.unitCost ?? 0),
          sourceType: "modifier_option",
          sourceLabel: option.name,
        });
      }

      for (const optionId of ((modifiers.requiredChoiceOptionIds as Array<unknown> | undefined) ?? []).map((item) => String(item))) {
        const option = requiredChoiceOptionMap.get(optionId);
        if (!option?.inventoryItem || Number(option.stockQuantity ?? 0) <= 0) continue;
        if (option.inventoryItem.warehouse.branchId !== ticket.branchId) {
          throw new BadRequestException(
            `${ticketItem.productName} icin secilen ${option.name} zorunlu secimi farkli sube deposuna bagli. Secim stok baglantisini duzeltmeden satis tamamlanamaz.`,
          );
        }
        const optionQuantity = Number(ticketItem.quantity) * Number(option.stockQuantity ?? 0);
        if (optionQuantity <= 0) continue;
        lines.push({
          referenceId: `${ticketItem.id}:required-choice-option:${option.id}`,
          inventoryItemId: option.inventoryItem.id,
          warehouseId: option.inventoryItem.warehouseId,
          inventoryItemName: option.inventoryItem.name,
          unitSymbol: option.inventoryItem.unit.symbol,
          quantity: optionQuantity,
          productName: ticketItem.productName,
          unitCost: Number(option.inventoryItem.stockEntries[0]?.unitCost ?? 0),
          sourceType: "required_choice_option",
          sourceLabel: option.name,
        });
      }
    }

    return lines;
  }

  private async refreshAlert(tx: Prisma.TransactionClient, inventoryItemId: string) {
    const item = await tx.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { warehouse: true },
    });
    if (!item) return;

    const openAlert = await tx.stockAlert.findFirst({
      where: { inventoryItemId, status: "open" },
    });

    if (Number(item.currentStock) <= Number(item.minimumLevel)) {
      if (openAlert) {
        await tx.stockAlert.update({
          where: { id: openAlert.id },
          data: {
            threshold: item.minimumLevel,
            resolvedAt: null,
          },
        });
      } else {
        await tx.stockAlert.create({
          data: {
            branchId: item.warehouse.branchId,
            inventoryItemId,
            threshold: item.minimumLevel,
            status: "open",
          },
        });
      }
      return;
    }

    if (openAlert) {
      await tx.stockAlert.update({
        where: { id: openAlert.id },
        data: {
          status: "closed",
          resolvedAt: new Date(),
        },
      });
    }
  }

  private roundAmount(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
