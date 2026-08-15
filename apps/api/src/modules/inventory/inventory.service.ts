import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentStatus } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { toCsv } from "../../common/utils/csv";
import { PosGateway } from "../pos/pos.gateway";
import { InventoryConsumptionService } from "./inventory-consumption.service";
import { CreateInventoryResourceDto } from "./dto/create-inventory-resource.dto";
import { ListInventoryResourceDto } from "./dto/list-inventory-resource.dto";
import { UpdateInventoryResourceDto } from "./dto/update-inventory-resource.dto";
import { inventoryRegistry, type InventoryFieldConfig } from "./inventory.registry";
import type { InventoryResource } from "./inventory.resources";

const inboundEntryTypes = new Set(["purchase", "adjustment_in", "transfer_in"]);
inboundEntryTypes.add("sale_reversal");
const outboundEntryTypes = new Set(["sale", "waste", "adjustment_out", "transfer_out"]);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryConsumptionService: InventoryConsumptionService,
    private readonly posGateway: PosGateway,
  ) {}

  async getOverview(actor: AuthenticatedUser, branchId?: string, warehouseId?: string) {
    this.ensurePermission(actor, "inventory.view");
    if (branchId) this.ensureBranchAccess(actor, branchId);
    if (warehouseId) {
      await this.ensureWarehouseAccess(actor, warehouseId);
    }

    const warehouseWhere: Record<string, unknown> = {
      branchId: { in: branchId ? [branchId] : actor.branchIds },
      ...(warehouseId ? { id: warehouseId } : {}),
    };

    const itemWhere = {
      warehouse: {
        branchId: { in: branchId ? [branchId] : actor.branchIds },
        ...(warehouseId ? { id: warehouseId } : {}),
      },
    };

    const [warehouses, items, openAlerts, pendingTransfers, recentEntries] = await Promise.all([
      this.prisma.warehouse.count({ where: warehouseWhere }),
      this.prisma.inventoryItem.count({ where: itemWhere }),
      this.prisma.stockAlert.findMany({
        where: { branchId: { in: branchId ? [branchId] : actor.branchIds }, status: "open" },
        include: { inventoryItem: { include: { warehouse: true, unit: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      this.prisma.stockTransfer.count({
        where: {
          status: "pending",
          outgoingWarehouse: { branchId: { in: branchId ? [branchId] : actor.branchIds } },
        },
      }),
      this.prisma.stockEntry.findMany({
        where: {
          warehouse: {
            branchId: { in: branchId ? [branchId] : actor.branchIds },
            ...(warehouseId ? { id: warehouseId } : {}),
          },
        },
        include: { warehouse: true, inventoryItem: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      cards: [
        { key: "warehouses", label: "Depolar", value: warehouses },
        { key: "items", label: "Stoklu Urunler", value: items },
        { key: "alerts", label: "Minimum Stok Uyarisi", value: openAlerts.length },
        { key: "pendingTransfers", label: "Bekleyen Transfer", value: pendingTransfers },
      ],
      alerts: openAlerts.map((alert) => ({
        id: alert.id,
        productName: alert.inventoryItem.name,
        warehouseName: alert.inventoryItem.warehouse.name,
        currentStock: Number(alert.inventoryItem.currentStock),
        threshold: Number(alert.threshold),
        unit: alert.inventoryItem.unit.symbol,
      })),
      recentMovements: recentEntries.map((entry) => ({
        id: entry.id,
        productName: entry.inventoryItem.name,
        warehouseName: entry.warehouse.name,
        entryType: entry.entryType,
        effectQuantity: this.computeEffect(entry.entryType, Number(entry.quantity)),
        createdAt: entry.createdAt.toISOString(),
        notes: entry.notes,
      })),
    };
  }

  async getMeta(resource: InventoryResource, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "inventory.view");
    const config = inventoryRegistry[resource];
    const runtimeOptions = await this.getRuntimeOptions(config.relationOptionKeys ?? [], actor);

    return {
      resource,
      title: config.title,
      description: config.description,
      exportable: config.exportable,
      readOnly: Boolean(config.readOnly),
      fields: config.fields.map((field) => ({
        ...field,
        options: this.resolveFieldOptions(field, runtimeOptions),
      })),
      columns: config.columns,
      filters: config.filters.map((filter) => ({
        ...filter,
        options: filter.key === "branchId" ? runtimeOptions.branches : filter.key === "warehouseId" ? runtimeOptions.warehouses : filter.key === "status" ? [{ label: "pending", value: "pending" }, { label: "completed", value: "completed" }, { label: "cancelled", value: "cancelled" }] : undefined,
      })),
      actions: {
        syncSales: true,
      },
    };
  }

  async list(resource: InventoryResource, query: ListInventoryResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "inventory.view");

    if (resource === "stock-status") return this.listStockStatus(query, actor);
    if (resource === "stock-cards") return this.listStockCards(query, actor);

    const config = inventoryRegistry[resource];
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(resource, query, actor);
    const delegate = this.getDelegate(config.delegate!);
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        include: config.include,
        orderBy: this.getOrderBy(resource, query.sortBy, query.sortDirection),
        skip: (page - 1) * limit,
        take: limit,
      }),
      delegate.count({ where }),
    ]);

    return {
      items: items.map((item: unknown) => this.serializeItem(resource, item)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async detail(resource: InventoryResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "inventory.view");

    if (resource === "stock-status") {
      const item = await this.prisma.inventoryItem.findFirst({
        where: { id, warehouse: { branchId: { in: actor.branchIds } } },
        include: { warehouse: { include: { branch: true } }, category: true, unit: true, stockAlerts: true },
      });
      if (!item) throw new NotFoundException("Stok kaydi bulunamadi.");
      return this.serializeStockStatus(item);
    }

    if (resource === "stock-cards") {
      const entry = await this.prisma.stockEntry.findFirst({
        where: { id, warehouse: { branchId: { in: actor.branchIds } } },
        include: { warehouse: { include: { branch: true } }, inventoryItem: { include: { unit: true } } },
      });
      if (!entry) throw new NotFoundException("Stok karti bulunamadi.");
      return this.serializeStockCard(entry);
    }

    const config = inventoryRegistry[resource];
    const item = await this.getDelegate(config.delegate!).findFirst({
      where: { id, ...this.buildWhere(resource, {}, actor) },
      include: config.include,
    });
    if (!item) throw new NotFoundException("Kayit bulunamadi.");
    return this.serializeItem(resource, item);
  }

  async create(resource: InventoryResource, dto: CreateInventoryResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, resource === "stock-transfer" ? "inventory.transfer" : "inventory.manage");
    const config = inventoryRegistry[resource];
    if (config.readOnly || !config.delegate) throw new BadRequestException("Bu kaynak olusturulamaz.");

    const data = this.normalizeMutationData(resource, dto.data, actor);
    const created = await this.createOrUpdate(resource, "create", undefined, data, actor);
    await this.writeAudit(resource, "create", created.id, data, actor);
    return created;
  }

  async update(resource: InventoryResource, id: string, dto: UpdateInventoryResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, resource === "stock-transfer" ? "inventory.transfer" : "inventory.manage");
    const config = inventoryRegistry[resource];
    if (config.readOnly || !config.delegate) throw new BadRequestException("Bu kaynak guncellenemez.");
    await this.detail(resource, id, actor);

    const data = this.normalizeMutationData(resource, dto.data, actor);
    const updated = await this.createOrUpdate(resource, "update", id, data, actor);
    await this.writeAudit(resource, "update", id, data, actor);
    return updated;
  }

  async remove(resource: InventoryResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, resource === "stock-transfer" ? "inventory.transfer" : "inventory.manage");
    const config = inventoryRegistry[resource];
    if (config.readOnly || !config.delegate) throw new BadRequestException("Bu kaynak silinemez.");

    if (resource === "stock-entry") {
      const entry = await this.prisma.stockEntry.findFirst({
        where: {
          id,
          warehouse: { branchId: { in: actor.branchIds } },
        },
        include: { inventoryItem: true, warehouse: true },
      });
      if (!entry) throw new NotFoundException("Stok girisi bulunamadi.");
      if (entry.referenceType) throw new BadRequestException("Sistem tarafindan olusan hareket silinemez.");
      await this.applyStockChange(entry.inventoryItemId, -this.computeEffect(entry.entryType, Number(entry.quantity)));
      await this.prisma.stockEntry.delete({ where: { id } });
      await this.refreshAlert(entry.inventoryItemId);
      return { success: true };
    }

    if (resource === "waste-products") {
      const waste = await this.prisma.wasteRecord.findFirst({
        where: {
          id,
          inventoryItem: { warehouse: { branchId: { in: actor.branchIds } } },
        },
      });
      if (!waste) throw new NotFoundException("Atik kaydi bulunamadi.");
      await this.reverseWaste(waste.id, waste.inventoryItemId, Number(waste.quantity));
      await this.prisma.wasteRecord.delete({ where: { id } });
      return { success: true };
    }

    if (resource === "stock-transfer") {
      const transfer = await this.prisma.stockTransfer.findFirst({
        where: {
          id,
          outgoingWarehouse: { branchId: { in: actor.branchIds } },
        },
      });
      if (!transfer) throw new NotFoundException("Transfer bulunamadi.");
      if (transfer.status === "completed") {
        throw new BadRequestException("Tamamlanan transfer silinemez.");
      }
      await this.prisma.stockTransfer.delete({ where: { id } });
      return { success: true };
    }

    if (resource === "inventory-items") {
      await this.detail(resource, id, actor);
      await this.prisma.stockAlert.deleteMany({ where: { inventoryItemId: id } });
    }

    await this.detail(resource, id, actor);
    await this.getDelegate(config.delegate).delete({ where: { id } });
    return { success: true };
  }

  async exportResource(resource: InventoryResource, query: ListInventoryResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "inventory.export");
    const config = inventoryRegistry[resource];
    const result = await this.list(resource, { ...query, page: 1, limit: 5000 }, actor);
    const headers = config.columns.map((column) => column.label);
    const rows = result.items.map((item: Record<string, unknown>) =>
      config.columns.map((column) => {
        const value = this.getValueByPath(item, column.key);
        return typeof value === "object" && value !== null ? JSON.stringify(value) : (value as string | number | null | undefined);
      }),
    );
    return toCsv(headers, rows);
  }

  async syncSalesConsumption(actor: AuthenticatedUser, branchId?: string) {
    this.ensurePermission(actor, "inventory.manage");
    if (branchId) this.ensureBranchAccess(actor, branchId);
    return this.inventoryConsumptionService.syncSalesConsumption(actor, branchId);
  }

  private async listStockStatus(query: ListInventoryResourceDto, actor: AuthenticatedUser) {
    if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {
      warehouse: {
        branchId: { in: query.branchId ? [query.branchId] : actor.branchIds },
        ...(query.warehouseId ? { id: query.warehouseId } : {}),
      },
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { sku: { contains: query.search, mode: "insensitive" } },
        { barcode: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        include: { warehouse: { include: { branch: true } }, unit: true, category: true, stockAlerts: true },
        orderBy: this.getOrderBy("stock-status", query.sortBy, query.sortDirection) as any,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeStockStatus(item)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  private async listStockCards(query: ListInventoryResourceDto, actor: AuthenticatedUser) {
    if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = {
      warehouse: {
        branchId: { in: query.branchId ? [query.branchId] : actor.branchIds },
        ...(query.warehouseId ? { id: query.warehouseId } : {}),
      },
    };
    if (query.startDate || query.endDate) {
      where.createdAt = this.createDateFilter(query.startDate, query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.stockEntry.findMany({
        where,
        include: { warehouse: { include: { branch: true } }, inventoryItem: { include: { unit: true } } },
        orderBy: this.getOrderBy("stock-cards", query.sortBy, query.sortDirection) as any,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockEntry.count({ where }),
    ]);

    return {
      items: items.map((entry) => this.serializeStockCard(entry)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  private buildWhere(resource: InventoryResource, query: Partial<ListInventoryResourceDto>, actor: AuthenticatedUser) {
    const where: Record<string, unknown> = {};

    switch (resource) {
      case "warehouses":
        where.branchId = { in: query.branchId ? [query.branchId] : actor.branchIds };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
      case "stock-transfer":
        where.outgoingWarehouse = {
          branchId: { in: query.branchId ? [query.branchId] : actor.branchIds },
          ...(query.warehouseId ? { id: query.warehouseId } : {}),
        };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
      case "inventory-units":
      case "inventory-categories":
        where.companyId = actor.tenantId;
        break;
      case "inventory-items":
        where.warehouse = {
          branchId: { in: query.branchId ? [query.branchId] : actor.branchIds },
          ...(query.warehouseId ? { id: query.warehouseId } : {}),
        };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
      case "stock-entry":
        where.warehouse = {
          branchId: { in: query.branchId ? [query.branchId] : actor.branchIds },
          ...(query.warehouseId ? { id: query.warehouseId } : {}),
        };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
      case "waste-products":
        where.inventoryItem = {
          warehouse: {
            branchId: { in: query.branchId ? [query.branchId] : actor.branchIds },
            ...(query.warehouseId ? { id: query.warehouseId } : {}),
          },
        };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
    }

    if (query.status) {
      where.status = query.status;
    }

    const dateField = this.getDateField(resource);
    if (dateField && (query.startDate || query.endDate)) {
      where[dateField] = this.createDateFilter(query.startDate, query.endDate);
    }

    if (query.search) {
      Object.assign(where, this.buildSearchWhere(resource, query.search));
    }

    return where;
  }

  private buildSearchWhere(resource: InventoryResource, search: string) {
    const fields = inventoryRegistry[resource].searchFields ?? [];
    if (resource === "stock-transfer") {
      return {
        OR: [
          { inventoryItem: { name: { contains: search, mode: "insensitive" } } },
          { outgoingWarehouse: { name: { contains: search, mode: "insensitive" } } },
          { incomingWarehouse: { name: { contains: search, mode: "insensitive" } } },
        ],
      };
    }

    if (resource === "stock-entry") {
      return {
        OR: [
          { inventoryItem: { name: { contains: search, mode: "insensitive" } } },
          { notes: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    if (resource === "waste-products") {
      return {
        OR: [
          { inventoryItem: { name: { contains: search, mode: "insensitive" } } },
          { reason: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    return {
      OR: fields.map((field) => ({
        [field]: { contains: search, mode: "insensitive" },
      })),
    };
  }

  private getDateField(resource: InventoryResource) {
    switch (resource) {
      case "stock-transfer":
        return "transferDate";
      case "stock-entry":
        return "createdAt";
      case "waste-products":
        return "recordedAt";
      default:
        return null;
    }
  }

  private createDateFilter(startDate?: string, endDate?: string) {
    return {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  private getOrderBy(resource: InventoryResource, sortBy?: string, sortDirection?: "asc" | "desc") {
    const direction = sortDirection === "asc" ? "asc" : "desc";
    const custom = this.resolveCustomOrderBy(resource, sortBy, direction);
    if (custom) return custom;

    switch (resource) {
      case "warehouses":
        return { name: "asc" };
      case "stock-transfer":
        return { transferDate: "desc" };
      case "inventory-units":
      case "inventory-categories":
        return { name: "asc" };
      case "inventory-items":
        return { name: "asc" };
      case "stock-entry":
        return { createdAt: "desc" };
      case "stock-status":
        return [{ currentStock: "asc" }, { name: "asc" }];
      case "stock-cards":
        return { createdAt: "desc" };
      case "waste-products":
        return { recordedAt: "desc" };
      default:
        return { id: "desc" };
    }
  }

  private resolveCustomOrderBy(resource: InventoryResource, sortBy: string | undefined, sortDirection: "asc" | "desc") {
    if (!sortBy) return null;
    const allowed: Partial<Record<InventoryResource, string[]>> = {
      warehouses: ["name", "createdAt"],
      "stock-transfer": ["transferDate", "status", "quantity", "createdAt"],
      "inventory-units": ["name", "createdAt"],
      "inventory-categories": ["name", "createdAt"],
      "inventory-items": ["name", "currentStock", "minimumLevel", "createdAt"],
      "stock-entry": ["createdAt", "entryType", "quantity"],
      "stock-status": ["name", "currentStock", "minimumLevel", "createdAt"],
      "stock-cards": ["createdAt", "entryType", "quantity"],
      "waste-products": ["recordedAt", "quantity", "reason", "createdAt"],
    };

    if (!allowed[resource]?.includes(sortBy)) {
      return null;
    }

    return { [sortBy]: sortDirection };
  }

  private normalizeMutationData(resource: InventoryResource, input: Record<string, unknown>, actor: AuthenticatedUser) {
    const config = inventoryRegistry[resource];
    const data: Record<string, unknown> = {};

    for (const field of config.fields) {
      if (!(field.key in input)) continue;
      data[field.key] = this.normalizeFieldValue(field.key, input[field.key], config);
    }

    for (const field of config.fields) {
      if (field.required && (data[field.key] === undefined || data[field.key] === null || data[field.key] === "")) {
        throw new BadRequestException(`${field.label} zorunlu.`);
      }
    }

    if (resource === "inventory-units" || resource === "inventory-categories") {
      data.companyId = actor.tenantId;
    }

    if (resource === "warehouses" && typeof data.branchId === "string") this.ensureBranchAccess(actor, data.branchId);
    if (resource === "inventory-items" && typeof data.warehouseId === "string") {
      // branch access is inferred from warehouse
    }

    return data;
  }

  private normalizeFieldValue(key: string, value: unknown, config: typeof inventoryRegistry[InventoryResource]) {
    if (value === "") return null;
    if (config.numberFields?.includes(key)) return Number(value);
    if (config.booleanFields?.includes(key)) return value === true || value === "true";
    if (config.dateFields?.includes(key)) return value ? new Date(String(value)) : null;
    return value;
  }

  private async createOrUpdate(
    resource: InventoryResource,
    mode: "create" | "update",
    id: string | undefined,
    data: Record<string, unknown>,
    actor: AuthenticatedUser,
  ) {
    switch (resource) {
      case "stock-entry":
        return this.createOrUpdateStockEntry(mode, id, data, actor);
      case "waste-products":
        return this.createOrUpdateWaste(mode, id, data, actor);
      case "stock-transfer":
        return this.createOrUpdateTransfer(mode, id, data, actor);
      case "inventory-items": {
        const warehouse = await this.prisma.warehouse.findUnique({ where: { id: String(data.warehouseId) } });
        if (!warehouse) throw new NotFoundException("Depo bulunamadi.");
        this.ensureBranchAccess(actor, warehouse.branchId);
        const entity =
          mode === "create"
            ? await this.prisma.inventoryItem.create({ data: data as any, include: inventoryRegistry[resource].include })
            : await this.prisma.inventoryItem.update({ where: { id }, data: data as any, include: inventoryRegistry[resource].include });
        await this.refreshAlert(entity.id);
        return this.serializeItem(resource, entity);
      }
      default: {
        const config = inventoryRegistry[resource];
        const delegate = this.getDelegate(config.delegate!);
        const entity =
          mode === "create"
            ? await delegate.create({ data, include: config.include })
            : await delegate.update({ where: { id }, data, include: config.include });
        return this.serializeItem(resource, entity);
      }
    }
  }

  private async createOrUpdateStockEntry(mode: "create" | "update", id: string | undefined, data: Record<string, unknown>, _actor: AuthenticatedUser) {
    const quantity = Number(data.quantity);
    const entryType = String(data.entryType);
    if (quantity <= 0) throw new BadRequestException("Miktar sifirdan buyuk olmali.");

    const inventoryItem = await this.prisma.inventoryItem.findUnique({ where: { id: String(data.inventoryItemId) }, include: { warehouse: true } });
    if (!inventoryItem) throw new NotFoundException("Stoklu urun bulunamadi.");
    this.ensureBranchAccess(_actor, inventoryItem.warehouse.branchId);
    if (String(data.warehouseId) !== inventoryItem.warehouseId) {
      throw new BadRequestException("Stok girisi urunun ait oldugu depoya yapilabilir.");
    }

    if (mode === "update" && id) {
      const existing = await this.prisma.stockEntry.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Stok hareketi bulunamadi.");
      if (existing.referenceType) throw new BadRequestException("Sistem hareketi guncellenemez.");
      await this.applyStockChange(existing.inventoryItemId, -this.computeEffect(existing.entryType, Number(existing.quantity)));
      await this.refreshAlert(existing.inventoryItemId);
    }

    const entity =
      mode === "create"
        ? await this.prisma.stockEntry.create({ data: data as any, include: inventoryRegistry["stock-entry"].include })
        : await this.prisma.stockEntry.update({ where: { id }, data: data as any, include: inventoryRegistry["stock-entry"].include });

    await this.applyStockChange(entity.inventoryItemId, this.computeEffect(entryType, quantity));
    await this.refreshAlert(entity.inventoryItemId);
    return this.serializeItem("stock-entry", entity);
  }

  private async createOrUpdateWaste(mode: "create" | "update", id: string | undefined, data: Record<string, unknown>, _actor: AuthenticatedUser) {
    const inventoryItemId = String(data.inventoryItemId);
    const quantity = Number(data.quantity);
    if (quantity <= 0) throw new BadRequestException("Atik miktari sifirdan buyuk olmali.");
    const inventoryItem = await this.prisma.inventoryItem.findUnique({ where: { id: inventoryItemId }, include: { warehouse: true } });
    if (!inventoryItem) throw new NotFoundException("Stoklu urun bulunamadi.");
    this.ensureBranchAccess(_actor, inventoryItem.warehouse.branchId);

    if (mode === "update" && id) {
      const existing = await this.prisma.wasteRecord.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Atik kaydi bulunamadi.");
      await this.reverseWaste(existing.id, existing.inventoryItemId, Number(existing.quantity));
    }

    const entity =
      mode === "create"
        ? await this.prisma.wasteRecord.create({ data: data as any, include: inventoryRegistry["waste-products"].include })
        : await this.prisma.wasteRecord.update({ where: { id }, data: data as any, include: inventoryRegistry["waste-products"].include });

    await this.applyStockChange(inventoryItemId, this.computeEffect("waste", quantity));
    await this.prisma.stockEntry.create({
      data: {
        warehouseId: inventoryItem.warehouseId,
        inventoryItemId,
        entryType: "waste",
        quantity,
        referenceType: "waste_record",
        referenceId: entity.id,
        createdAt: entity.recordedAt,
        notes: entity.reason,
      },
    });
    await this.refreshAlert(inventoryItemId);
    return this.serializeItem("waste-products", entity);
  }

  private async reverseWaste(wasteId: string, inventoryItemId: string, quantity: number) {
    await this.applyStockChange(inventoryItemId, -this.computeEffect("waste", quantity));
    await this.prisma.stockEntry.deleteMany({
      where: {
        referenceType: "waste_record",
        referenceId: wasteId,
      },
    });
    await this.refreshAlert(inventoryItemId);
  }

  private async createOrUpdateTransfer(mode: "create" | "update", id: string | undefined, data: Record<string, unknown>, _actor: AuthenticatedUser) {
    const quantity = Number(data.quantity);
    if (quantity <= 0) throw new BadRequestException("Transfer miktari sifirdan buyuk olmali.");
    if (String(data.fromWarehouseId) === String(data.toWarehouseId)) {
      throw new BadRequestException("Cikis ve varis deposu ayni olamaz.");
    }
    const [fromWarehouse, toWarehouse, sourceItem] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: String(data.fromWarehouseId) } }),
      this.prisma.warehouse.findUnique({ where: { id: String(data.toWarehouseId) } }),
      this.prisma.inventoryItem.findUnique({ where: { id: String(data.inventoryItemId) } }),
    ]);
    if (!fromWarehouse || !toWarehouse || !sourceItem) {
      throw new NotFoundException("Transfer icin depo veya stok urunu bulunamadi.");
    }
    this.ensureBranchAccess(_actor, fromWarehouse.branchId);
    this.ensureBranchAccess(_actor, toWarehouse.branchId);
    if (sourceItem.warehouseId !== fromWarehouse.id) {
      throw new BadRequestException("Transfer edilen urun secilen cikis deposuna ait olmali.");
    }

    if (mode === "update" && id) {
      const existing = await this.prisma.stockTransfer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Transfer bulunamadi.");
      if (existing.status === "completed") {
        throw new BadRequestException("Tamamlanan transfer guncellenemez.");
      }
    }

    const entity =
      mode === "create"
        ? await this.prisma.stockTransfer.create({ data: data as any, include: inventoryRegistry["stock-transfer"].include })
        : await this.prisma.stockTransfer.update({ where: { id }, data: data as any, include: inventoryRegistry["stock-transfer"].include });

    if (entity.status === "completed") {
      await this.applyTransfer(entity.id);
    }

    return this.serializeItem("stock-transfer", entity);
  }

  private async applyTransfer(transferId: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: { inventoryItem: true, outgoingWarehouse: true, incomingWarehouse: true },
    });
    if (!transfer) throw new NotFoundException("Transfer bulunamadi.");

    const existingOut = await this.prisma.stockEntry.findFirst({
      where: { referenceType: "stock_transfer_out", referenceId: transfer.id },
    });
    if (existingOut) return;

    await this.applyStockChange(transfer.inventoryItemId, this.computeEffect("transfer_out", Number(transfer.quantity)));

    const targetItem = await this.findOrCreateTargetInventoryItem(transfer);
    await this.applyStockChange(targetItem.id, this.computeEffect("transfer_in", Number(transfer.quantity)));

    await this.prisma.stockEntry.createMany({
      data: [
        {
          warehouseId: transfer.fromWarehouseId,
          inventoryItemId: transfer.inventoryItemId,
          entryType: "transfer_out",
          quantity: transfer.quantity,
          referenceType: "stock_transfer_out",
          referenceId: transfer.id,
          createdAt: transfer.transferDate,
          notes: transfer.note,
        },
        {
          warehouseId: transfer.toWarehouseId,
          inventoryItemId: targetItem.id,
          entryType: "transfer_in",
          quantity: transfer.quantity,
          referenceType: "stock_transfer_in",
          referenceId: transfer.id,
          createdAt: transfer.transferDate,
          notes: transfer.note,
        },
      ],
    });

    await this.refreshAlert(transfer.inventoryItemId);
    await this.refreshAlert(targetItem.id);
  }

  private async findOrCreateTargetInventoryItem(transfer: any) {
    const sourceItem = transfer.inventoryItem;
    const targetWarehouse = transfer.toWarehouseId;
    let targetItem = await this.prisma.inventoryItem.findFirst({
      where: {
        warehouseId: targetWarehouse,
        OR: [
          sourceItem.sku ? { sku: sourceItem.sku } : undefined,
          { name: sourceItem.name },
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
    });

    if (!targetItem) {
      targetItem = await this.prisma.inventoryItem.create({
        data: {
          warehouseId: targetWarehouse,
          categoryId: sourceItem.categoryId,
          unitId: sourceItem.unitId,
          name: sourceItem.name,
          sku: sourceItem.sku,
          barcode: sourceItem.barcode,
          minimumLevel: sourceItem.minimumLevel,
          currentStock: 0,
          isActive: sourceItem.isActive,
          notes: sourceItem.notes,
        },
      });
    }

    return targetItem;
  }

  private async applyStockChange(inventoryItemId: string, effect: number) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { warehouse: true },
    });
    if (!item) throw new NotFoundException("Stok urunu bulunamadi.");
    const nextStock = Number(item.currentStock) + effect;
    if (nextStock < 0) {
      throw new BadRequestException(`${item.name} icin stok yetersiz.`);
    }
    const updated = await this.prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: nextStock },
      include: { warehouse: true },
    });
    const payload = {
      branchId: updated.warehouse.branchId,
      inventoryItemId: updated.id,
      warehouseId: updated.warehouseId,
      currentStock: Number(updated.currentStock),
      minimumLevel: Number(updated.minimumLevel),
      effect,
    };
    this.posGateway.emitToBranch(updated.warehouse.branchId, "inventory.stock.changed", payload);
    this.posGateway.emitToBranch(updated.warehouse.branchId, "pos.inventory.stock.changed", payload);
  }

  private computeEffect(entryType: string, quantity: number) {
    if (inboundEntryTypes.has(entryType)) return quantity;
    if (outboundEntryTypes.has(entryType)) return -quantity;
    return quantity;
  }

  private async refreshAlert(inventoryItemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      include: { warehouse: true },
    });
    if (!item) return;

    const openAlert = await this.prisma.stockAlert.findFirst({
      where: { inventoryItemId, status: "open" },
    });

    if (Number(item.currentStock) <= Number(item.minimumLevel)) {
      if (openAlert) {
        await this.prisma.stockAlert.update({
          where: { id: openAlert.id },
          data: {
            threshold: item.minimumLevel,
            resolvedAt: null,
          },
        });
      } else {
        await this.prisma.stockAlert.create({
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
      await this.prisma.stockAlert.update({
        where: { id: openAlert.id },
        data: {
          status: "closed",
          resolvedAt: new Date(),
        },
      });
    }
  }

  private serializeItem(resource: InventoryResource, item: any) {
    const normalized = JSON.parse(JSON.stringify(item));
    if (resource === "stock-entry") {
      normalized.effectQuantity = this.computeEffect(normalized.entryType, Number(normalized.quantity));
    }
    return normalized;
  }

  private serializeStockStatus(item: any) {
    const normalized = JSON.parse(JSON.stringify(item));
    const openAlert = (normalized.stockAlerts ?? []).find((alert: { status: string }) => alert.status === "open");
    return {
      ...normalized,
      branchName: normalized.warehouse?.branch?.name ?? "-",
      warehouseName: normalized.warehouse?.name ?? "-",
      alertStatus: openAlert ? "kritik" : Number(normalized.currentStock) <= Number(normalized.minimumLevel) ? "uyari" : "normal",
    };
  }

  private serializeStockCard(entry: any) {
    const normalized = JSON.parse(JSON.stringify(entry));
    return {
      ...normalized,
      effectQuantity: this.computeEffect(normalized.entryType, Number(normalized.quantity)),
    };
  }

  private getDelegate(name: string) {
    return (this.prisma as Record<string, any>)[name];
  }

  private getValueByPath(item: Record<string, unknown>, path: string) {
    return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), item);
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission) && actor.role !== "super_admin") {
      throw new ForbiddenException("Bu stok islemi icin yetkin yok.");
    }
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private async ensureWarehouseAccess(actor: AuthenticatedUser, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) {
      throw new NotFoundException("Depo bulunamadi.");
    }
    this.ensureBranchAccess(actor, warehouse.branchId);
    return warehouse;
  }

  private async getRuntimeOptions(
    keys: Array<"branches" | "warehouses" | "units" | "categories" | "inventoryItems" | "products">,
    actor: AuthenticatedUser,
  ) {
    const [branches, warehouses, units, categories, inventoryItems, products] = await Promise.all([
      keys.includes("branches") ? this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      keys.includes("warehouses")
        ? this.prisma.warehouse.findMany({ where: { branchId: { in: actor.branchIds } }, include: { branch: true }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
      keys.includes("units") ? this.prisma.inventoryUnit.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      keys.includes("categories") ? this.prisma.inventoryCategory.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      keys.includes("inventoryItems")
        ? this.prisma.inventoryItem.findMany({
            where: { warehouse: { branchId: { in: actor.branchIds } } },
            include: { warehouse: true, unit: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      keys.includes("products") ? this.prisma.menuProduct.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    ]);

    return {
      branches: branches.map((branch) => ({ label: branch.name, value: branch.id })),
      warehouses: warehouses.map((warehouse) => ({ label: `${warehouse.name} / ${warehouse.branch.name}`, value: warehouse.id })),
      units: units.map((unit) => ({ label: `${unit.name} (${unit.symbol})`, value: unit.id })),
      categories: categories.map((category) => ({ label: category.name, value: category.id })),
      inventoryItems: inventoryItems.map((item) => ({ label: `${item.name} / ${item.warehouse.name}`, value: item.id })),
      products: products.map((product) => ({ label: product.name, value: product.id })),
    };
  }

  private resolveFieldOptions(field: InventoryFieldConfig, runtimeOptions: Awaited<ReturnType<InventoryService["getRuntimeOptions"]>>) {
    if (field.options?.length) return field.options;
    if (field.key === "branchId") return runtimeOptions.branches;
    if (field.key === "warehouseId" || field.key === "fromWarehouseId" || field.key === "toWarehouseId") return runtimeOptions.warehouses;
    if (field.key === "unitId") return runtimeOptions.units;
    if (field.key === "categoryId") return runtimeOptions.categories;
    if (field.key === "inventoryItemId") return runtimeOptions.inventoryItems;
    return undefined;
  }

  private async writeAudit(resource: InventoryResource, action: string, entityId: string, payload: unknown, actor: AuthenticatedUser) {
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: null,
      userId: actor.userId,
      module: "inventory",
      action: `${resource}.${action}`,
      entityType: resource,
      entityId,
      payload,
    });
  }
}
