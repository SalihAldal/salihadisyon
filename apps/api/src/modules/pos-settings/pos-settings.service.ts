import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasPermission } from "@adisyon/config";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { CreatePosSettingItemDto } from "./dto/create-pos-setting-item.dto";
import { ListPosSettingsDto } from "./dto/list-pos-settings.dto";
import { UpdatePosSettingItemDto } from "./dto/update-pos-setting-item.dto";
import { posSettingsRegistry, type PosSettingsFieldConfig } from "./pos-settings.registry";
import type { PosSettingsResource } from "./pos-settings.resources";

const companyScopedResources = new Set<PosSettingsResource>([
  "menu-management",
  "menu-products",
  "menu-categories",
  "customers",
  "optional-products",
  "required-choice-groups",
  "payment-methods",
  "back-screen-slider",
  "discount-types",
  "preset-notes",
  "settings",
]);

@Injectable()
export class PosSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getMeta(resource: PosSettingsResource, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "pos_settings.view");
    this.ensureResourcePermission(actor, resource, "view");
    const config = this.getConfig(resource);
    const runtimeOptions = await this.getRuntimeOptions(config.relationOptionKeys ?? [], actor);

    return {
      resource,
      title: config.title,
      description: config.description,
      fields: config.fields.map((field) => ({
        ...field,
        options: this.resolveFieldOptions(field, runtimeOptions),
      })),
      columns: config.columns,
      filters: config.filters.map((filter) => ({
        ...filter,
        options: this.resolveFilterOptions(filter, runtimeOptions),
      })),
    };
  }

  async list(resource: PosSettingsResource, query: ListPosSettingsDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "pos_settings.view");
    this.ensureResourcePermission(actor, resource, "view");
    const config = this.getConfig(resource);
    const where = await this.buildWhere(config, actor, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const delegate = this.getDelegate(config.delegate);

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        include: config.include,
        orderBy: config.orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      delegate.count({ where }),
    ]);

    return {
      items: items.map((item: unknown) => this.serializeItem(resource, item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async detail(resource: PosSettingsResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "pos_settings.view");
    this.ensureResourcePermission(actor, resource, "view");
    const config = this.getConfig(resource);
    const item = await this.getDelegate(config.delegate).findFirst({
      where: await this.buildWhere(config, actor, {}, id),
      include: config.include,
    });

    if (!item) {
      throw new NotFoundException("Kayit bulunamadi.");
    }

    return this.serializeItem(resource, item);
  }

  async create(resource: PosSettingsResource, dto: CreatePosSettingItemDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "pos_settings.manage");
    this.ensureResourcePermission(actor, resource, "manage", dto.data);
    const config = this.getConfig(resource);
    const data = await this.buildMutationData(resource, config, dto.data, actor, false);
    const delegate = this.getDelegate(config.delegate);
    const created = await delegate.create({
      data,
      include: config.include,
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: typeof data.branchId === "string" ? data.branchId : null,
      userId: actor.userId,
      module: "pos_settings",
      action: `${resource}.create`,
      entityType: resource,
      entityId: created.id,
      payload: dto.data,
      oldValues: null,
      newValues: this.serializeItem(resource, created),
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    return this.serializeItem(resource, created);
  }

  async update(resource: PosSettingsResource, id: string, dto: UpdatePosSettingItemDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "pos_settings.manage");
    const config = this.getConfig(resource);
    const current = await this.detail(resource, id, actor);
    this.ensureResourcePermission(actor, resource, "manage", dto.data, current);
    const data = await this.buildMutationData(resource, config, dto.data, actor, true, id);
    const delegate = this.getDelegate(config.delegate);
    const updated = await delegate.update({
      where: { id },
      data,
      include: config.include,
    });
    const updatedSerialized = this.serializeItem(resource, updated);

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: typeof current.branchId === "string" ? current.branchId : typeof data.branchId === "string" ? data.branchId : null,
      userId: actor.userId,
      module: "pos_settings",
      action: `${resource}.update`,
      entityType: resource,
      entityId: id,
      payload: dto.data,
      oldValues: current,
      newValues: updatedSerialized,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    if (["menu-management", "menu-products"].includes(resource) && this.isPriceMutation(dto.data, current)) {
      await this.auditLogService.create({
        companyId: actor.tenantId,
        branchId: typeof current.branchId === "string" ? current.branchId : typeof data.branchId === "string" ? data.branchId : null,
        userId: actor.userId,
        module: "pricing",
        action: "product.price.update",
        entityType: "menu_product",
        entityId: id,
        payload: {
          resource,
          fields: ["basePrice", "currentCost"],
        },
        oldValues: {
          basePrice: current.basePrice ?? null,
          currentCost: current.currentCost ?? null,
        },
        newValues: {
          basePrice: updatedSerialized.basePrice ?? null,
          currentCost: updatedSerialized.currentCost ?? null,
        },
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
        deviceInfo: actor.deviceInfo ?? null,
      });
    }

    return updatedSerialized;
  }

  async remove(resource: PosSettingsResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "pos_settings.manage");
    const config = this.getConfig(resource);
    const current = await this.detail(resource, id, actor);
    this.ensureResourcePermission(actor, resource, "manage", undefined, current);
    await this.getDelegate(config.delegate).delete({ where: { id } });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: typeof current.branchId === "string" ? current.branchId : null,
      userId: actor.userId,
      module: "pos_settings",
      action: `${resource}.delete`,
      entityType: resource,
      entityId: id,
      payload: current,
      oldValues: current,
      newValues: null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    return { success: true };
  }

  private getConfig(resource: PosSettingsResource) {
    return posSettingsRegistry[resource];
  }

  private getDelegate(delegateName: string) {
    return (this.prisma as Record<string, any>)[delegateName];
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!hasPermission(actor, permission)) {
      throw new ForbiddenException("Bu modulu yonetmek icin yetkin yok.");
    }
  }

  private ensureResourcePermission(
    actor: AuthenticatedUser,
    resource: PosSettingsResource,
    action: "view" | "manage",
    payload?: Record<string, unknown>,
    current?: Record<string, unknown>,
  ) {
    const resourcePermissionMap: Partial<Record<PosSettingsResource, { view?: string; manage?: string }>> = {
      "menu-management": { view: "product.manage", manage: "product.manage" },
      "menu-products": { view: "product.manage", manage: "product.manage" },
      "menu-categories": { view: "product.manage", manage: "product.manage" },
      "payment-methods": { view: "payment_method.view", manage: "payment_method.manage" },
      "defined-devices": { view: "device.view", manage: "device.manage" },
      terminals: { view: "device.view", manage: "device.manage" },
      printers: { view: "device.view", manage: "device.manage" },
    };

    const permissionKey = resourcePermissionMap[resource]?.[action];
    if (permissionKey && !hasPermission(actor, permissionKey)) {
      throw new ForbiddenException("Bu kaynaga erisim icin yetkin yok.");
    }

    if (
      ["menu-management", "menu-products"].includes(resource) &&
      action === "manage" &&
      this.isPriceMutation(payload, current) &&
      !hasPermission(actor, "product.price.manage")
    ) {
      throw new ForbiddenException("Urun fiyatini degistirme yetkin yok.");
    }
  }

  private isPriceMutation(payload?: Record<string, unknown>, current?: Record<string, unknown>) {
    if (!payload) {
      return false;
    }

    if (!current) {
      return payload.basePrice !== undefined || payload.currentCost !== undefined;
    }

    const nextBasePrice = payload.basePrice;
    const nextCurrentCost = payload.currentCost;
    return (
      (nextBasePrice !== undefined && String(nextBasePrice) !== String(current.basePrice ?? "")) ||
      (nextCurrentCost !== undefined && String(nextCurrentCost) !== String(current.currentCost ?? ""))
    );
  }

  private async buildWhere(
    config: ReturnType<PosSettingsService["getConfig"]>,
    actor: AuthenticatedUser,
    query: Partial<ListPosSettingsDto>,
    id?: string,
  ) {
    const where: Record<string, unknown> = {
      ...(config.staticWhere ?? {}),
    };

    if (id) {
      where.id = id;
    }

    if (companyScopedResources.has(config.key)) {
      where.companyId = actor.tenantId;
    }

    if (config.branchScoped) {
      if (query.branchId) {
        this.ensureBranchAccess(actor, query.branchId);
        where.branchId = query.branchId;
      } else {
        where.branchId = { in: actor.branchIds };
      }
    } else if (query.branchId) {
      this.ensureBranchAccess(actor, query.branchId);
      where.branchId = query.branchId;
    }

    if (query.search && config.searchFields.length > 0) {
      where.OR = config.searchFields.map((field) => ({
        [field]: {
          contains: query.search,
          mode: "insensitive",
        },
      }));
    }

    if (typeof query.isActive === "boolean") {
      where.isActive = query.isActive;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.parentId) {
      where.parentId = query.parentId;
    }

    for (const filter of config.filters) {
      const value = (query as Record<string, unknown>)[filter.key];
      if (value === undefined || value === null || value === "") {
        continue;
      }

      if (["branchId", "search", "status", "parentId", "isActive"].includes(filter.key)) {
        continue;
      }

      if (config.booleanFields?.includes(filter.key)) {
        where[filter.key] = value === true || value === "true";
        continue;
      }

      where[filter.key] = value;
    }

    if (["menu-management", "menu-products"].includes(config.key)) {
      if (query.stockTracking === "tracked") {
        where.stockItemId = { not: null };
      }
      if (query.stockTracking === "untracked") {
        where.stockItemId = null;
      }
    }

    return where;
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private async buildMutationData(
    resource: PosSettingsResource,
    config: ReturnType<PosSettingsService["getConfig"]>,
    input: Record<string, unknown>,
    actor: AuthenticatedUser,
    isUpdate: boolean,
    currentId?: string,
  ) {
    const data: Record<string, unknown> = {};
    const fieldMap = new Map(config.fields.map((field) => [field.key, field]));

    for (const [key, rawValue] of Object.entries(input)) {
      if (!fieldMap.has(key)) {
        continue;
      }

      data[key] = this.normalizeFieldValue(key, rawValue, config);
    }

    for (const field of config.fields) {
      if (field.required && !isUpdate) {
        const value = data[field.key];
        if (value === undefined || value === null || value === "") {
          throw new BadRequestException(`${field.label} zorunlu.`);
        }
      }
    }

    if (companyScopedResources.has(resource)) {
      data.companyId = actor.tenantId;
    }

    if (config.branchScoped && !data.branchId) {
      if (!actor.branchIds[0]) {
        throw new BadRequestException("Sube baglami gerekli.");
      }
      data.branchId = actor.branchIds[0];
    }

    if (typeof data.branchId === "string") {
      this.ensureBranchAccess(actor, data.branchId);
    }

    this.validateEnums(config, data);

    if (["menu-management", "menu-products"].includes(resource)) {
      const currentCost = data.currentCost;
      const stockTracked = data.stockTracked;
      const recipeEnabled = data.recipeEnabled;
      const recipeItems = Array.isArray(data.recipeItemsJson) ? (data.recipeItemsJson as Array<Record<string, unknown>>) : [];
      const categoryId = typeof data.categoryId === "string" ? data.categoryId : String(input.categoryId ?? "");
      const category = await this.prisma.menuCategory.findFirst({
        where: {
          id: categoryId,
          companyId: actor.tenantId,
        },
        include: {
          defaultVatRate: true,
        },
      });

      if (!category) {
        throw new NotFoundException("Kategori bulunamadi.");
      }

      if (category.branchId && typeof data.branchId === "string" && category.branchId !== data.branchId) {
        throw new ForbiddenException("Kategori farkli subeye ait.");
      }

      if (!isUpdate && (!data.name || !String(data.name).trim())) {
        throw new BadRequestException("Urun adi zorunlu.");
      }

      if (!isUpdate && (!categoryId || !String(categoryId).trim())) {
        throw new BadRequestException("Kategori secimi zorunlu.");
      }

      if (data.basePrice !== undefined && (!Number.isFinite(Number(data.basePrice)) || Number(data.basePrice) < 0)) {
        throw new BadRequestException("Satis fiyati 0 veya daha buyuk olmali.");
      }

      if (data.calories !== undefined && data.calories !== null && (!Number.isInteger(Number(data.calories)) || Number(data.calories) < 0)) {
        throw new BadRequestException("Kalori bilgisi 0 veya daha buyuk tam sayi olmali.");
      }

      if (stockTracked === true && !data.stockItemId) {
        throw new BadRequestException("Stok takipli urunde stok kalemi secmelisin.");
      }

      if (stockTracked === false) {
        data.stockItemId = null;
      }

      for (const [index, recipeItem] of recipeItems.entries()) {
        const inventoryItemId = String(recipeItem.inventoryItemId ?? "").trim();
        const quantity = Number(recipeItem.quantity ?? 0);
        if (!inventoryItemId) {
          throw new BadRequestException(`Recete satiri #${index + 1} icin hammadde secmelisin.`);
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException(`Recete satiri #${index + 1} icin miktar sifirdan buyuk olmali.`);
        }

        const inventoryItem = await this.prisma.inventoryItem.findFirst({
          where: {
            id: inventoryItemId,
            warehouse: {
              branchId: { in: actor.branchIds },
            },
          },
          include: {
            warehouse: true,
          },
        });
        if (!inventoryItem) {
          throw new NotFoundException(`Recete satiri #${index + 1} icin hammadde bulunamadi.`);
        }

        if (data.branchId && inventoryItem.warehouse.branchId !== data.branchId) {
          throw new BadRequestException(`Recete satiri #${index + 1} farkli sube deposuna bagli.`);
        }
      }

      if (data.isVatAuto === true && !data.vatRateId && category.defaultVatRateId) {
        data.vatRateId = category.defaultVatRateId;
      }

      delete data.currentCost;
      delete data.stockTracked;
      delete data.recipeEnabled;
      delete data.recipeItemsJson;

      const variants = Array.isArray(data.variantsJson) ? (data.variantsJson as Array<Record<string, unknown>>) : [];
      delete data.variantsJson;
      data.variants = {
        create: variants.map((variant, index) => ({
          name: String(variant.name ?? `Varyant ${index + 1}`),
          priceDiff: Number(variant.priceDiff ?? 0),
          sortOrder: Number(variant.sortOrder ?? index),
        })),
        ...(isUpdate ? { deleteMany: {} } : {}),
      };

      if (currentCost !== undefined && currentCost !== null && currentCost !== "") {
        const numericCost = Number(currentCost);
        if (!Number.isFinite(numericCost) || numericCost < 0) {
          throw new BadRequestException("Maliyet bilgisi 0 veya daha buyuk olmali.");
        }
        data.unitCosts = {
          create: {
            cost: numericCost,
          },
        };
      }

      const shouldPersistRecipe = recipeEnabled === true || recipeItems.length > 0;
      if (shouldPersistRecipe) {
        const recipePayload = {
          create: recipeItems.map((recipeItem) => ({
            inventoryItemId: String(recipeItem.inventoryItemId),
            quantity: Number(recipeItem.quantity),
          })),
        };
        data.recipe = isUpdate
          ? {
              upsert: {
                create: recipePayload,
                update: {
                  items: {
                    deleteMany: {},
                    ...recipePayload,
                  },
                },
              },
            }
          : {
              create: recipePayload,
            };
      } else if (isUpdate && currentId) {
        const existingProduct = await this.prisma.menuProduct.findUnique({
          where: { id: currentId },
          select: {
            recipe: {
              select: { id: true },
            },
          },
        });
        if (existingProduct?.recipe) {
          data.recipe = { delete: true };
        }
      }
    }

    if (resource === "optional-products") {
      const options = Array.isArray(data.optionsJson) ? (data.optionsJson as Array<Record<string, unknown>>) : [];
      delete data.optionsJson;
      data.options = {
        create: options.map((option, index) => {
          const inventoryItemId = option.inventoryItemId ? String(option.inventoryItemId) : null;
          const stockQuantity = option.stockQuantity == null || option.stockQuantity === "" ? null : Number(option.stockQuantity);
          if (inventoryItemId && (!Number.isFinite(stockQuantity) || Number(stockQuantity) <= 0)) {
            throw new BadRequestException(`Opsiyon #${index + 1} icin stok miktari sifirdan buyuk olmali.`);
          }
          if (!inventoryItemId && stockQuantity != null) {
            throw new BadRequestException(`Opsiyon #${index + 1} icin once stok kalemi secmelisin.`);
          }
          return {
            name: String(option.name ?? `Opsiyon ${index + 1}`),
            priceDiff: Number(option.priceDiff ?? 0),
            inventoryItemId,
            stockQuantity,
            sortOrder: Number(option.sortOrder ?? index),
          };
        }),
        ...(isUpdate ? { deleteMany: {} } : {}),
      };
    }

    if (resource === "required-choice-groups") {
      const options = Array.isArray(data.optionsJson) ? (data.optionsJson as Array<Record<string, unknown>>) : [];
      delete data.optionsJson;
      data.options = {
        create: options.map((option, index) => {
          const inventoryItemId = option.inventoryItemId ? String(option.inventoryItemId) : null;
          const stockQuantity = option.stockQuantity == null || option.stockQuantity === "" ? null : Number(option.stockQuantity);
          if (inventoryItemId && (!Number.isFinite(stockQuantity) || Number(stockQuantity) <= 0)) {
            throw new BadRequestException(`Secim #${index + 1} icin stok miktari sifirdan buyuk olmali.`);
          }
          if (!inventoryItemId && stockQuantity != null) {
            throw new BadRequestException(`Secim #${index + 1} icin once stok kalemi secmelisin.`);
          }
          return {
            name: String(option.name ?? "Secenek"),
            priceDiff: Number(option.priceDiff ?? 0),
            inventoryItemId,
            stockQuantity,
          };
        }),
        ...(isUpdate ? { deleteMany: {} } : {}),
      };
    }

    if (resource === "happy-hour") {
      data.type = "HAPPY_HOUR";
      data.isAutomatic = true;
    }

    if (resource === "timed-discounts") {
      data.type = "TIMED";
      data.isAutomatic = true;
    }

    return data;
  }

  private normalizeFieldValue(key: string, value: unknown, config: ReturnType<PosSettingsService["getConfig"]>) {
    if (value === "") {
      return null;
    }

    if (config.numberFields?.includes(key)) {
      return value === null || value === undefined ? null : Number(value);
    }

    if (config.booleanFields?.includes(key)) {
      return value === true || value === "true" || value === 1 || value === "1";
    }

    if (config.jsonFields?.includes(key)) {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          throw new BadRequestException(`${key} gecerli JSON olmali.`);
        }
      }
      return value;
    }

    if (config.dateFields?.includes(key)) {
      return value ? new Date(String(value)) : null;
    }

    return value;
  }

  private validateEnums(config: ReturnType<PosSettingsService["getConfig"]>, data: Record<string, unknown>) {
    for (const [field, values] of Object.entries(config.enumFields ?? {})) {
      if (data[field] !== undefined && data[field] !== null && !values.includes(String(data[field]))) {
        throw new BadRequestException(`${field} alani gecersiz.`);
      }
    }
  }

  private async getRuntimeOptions(keys: Array<"branches" | "categories" | "tableAreas" | "customers" | "vatRates" | "inventoryItems">, actor: AuthenticatedUser) {
    const uniqueKeys = [...new Set(keys)];
    const [branches, categories, tableAreas, customers, vatRates, inventoryItems] = await Promise.all([
      uniqueKeys.includes("branches")
        ? this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
      uniqueKeys.includes("categories")
        ? this.prisma.menuCategory.findMany({
            where: {
              companyId: actor.tenantId,
              OR: [{ branchId: null }, { branchId: { in: actor.branchIds } }],
            },
            include: {
              defaultVatRate: true,
            },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      uniqueKeys.includes("tableAreas")
        ? this.prisma.tableArea.findMany({ where: { branchId: { in: actor.branchIds } }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
      uniqueKeys.includes("customers")
        ? this.prisma.customer.findMany({ where: { companyId: actor.tenantId }, orderBy: { fullName: "asc" }, take: 100 })
        : Promise.resolve([]),
      uniqueKeys.includes("vatRates")
        ? this.prisma.vatRate.findMany({ where: { companyId: actor.tenantId }, orderBy: [{ rate: "asc" }, { name: "asc" }] })
        : Promise.resolve([]),
      uniqueKeys.includes("inventoryItems")
        ? this.prisma.inventoryItem.findMany({
            where: {
              warehouse: {
                branchId: { in: actor.branchIds },
              },
              isActive: true,
            },
            include: {
              warehouse: true,
              unit: true,
              stockEntries: {
                where: { unitCost: { not: null } },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
            orderBy: [{ name: "asc" }],
            take: 300,
          })
        : Promise.resolve([]),
    ]);

    return {
      branches: branches.map((branch) => ({ label: branch.name, value: branch.id })),
      categories: categories.map((category) => ({
        label: category.defaultVatRate?.name ? `${category.name} (${category.defaultVatRate.name})` : category.name,
        value: category.id,
        meta: {
          defaultVatRateId: category.defaultVatRateId,
        },
      })),
      tableAreas: tableAreas.map((area) => ({ label: area.name, value: area.id })),
      customers: customers.map((customer) => ({ label: customer.fullName, value: customer.id })),
      vatRates: vatRates.map((vatRate) => ({
        label: `${vatRate.name} (%${Number(vatRate.rate)})`,
        value: vatRate.id,
        meta: { rate: Number(vatRate.rate) },
      })),
      inventoryItems: inventoryItems.map((item) => ({
        label: `${item.name} / ${item.warehouse.name}`,
        value: item.id,
        meta: {
          warehouseId: item.warehouseId,
          unitSymbol: item.unit.symbol,
          currentStock: Number(item.currentStock),
          minimumLevel: Number(item.minimumLevel),
          latestUnitCost: Number(item.stockEntries[0]?.unitCost ?? 0),
        },
      })),
    };
  }

  private resolveFieldOptions(
    field: PosSettingsFieldConfig,
    runtimeOptions: Awaited<ReturnType<PosSettingsService["getRuntimeOptions"]>>,
  ) {
    if (field.options?.length) {
      return field.options;
    }

    const optionMap: Record<string, Array<{ label: string; value: string }>> = runtimeOptions;
    if (field.optionSource) {
      return optionMap[field.optionSource] ?? [];
    }
    return optionMap[field.key === "categoryId" ? "categories" : field.key === "areaId" ? "tableAreas" : field.key === "customerId" ? "customers" : "branches"] ?? [];
  }

  private resolveFilterOptions(
    filter: ReturnType<PosSettingsService["getConfig"]>["filters"][number],
    runtimeOptions: Awaited<ReturnType<PosSettingsService["getRuntimeOptions"]>>,
  ) {
    if (filter.options?.length) {
      return filter.options;
    }
    const filterKey = filter.key;
    if (filterKey === "categoryId") {
      return runtimeOptions.categories;
    }
    if (filterKey === "vatRateId") {
      return runtimeOptions.vatRates;
    }
    if (filterKey === "branchId") {
      return runtimeOptions.branches;
    }
    return undefined;
  }

  private serializeItem(resource: PosSettingsResource, item: any) {
    const normalized = JSON.parse(JSON.stringify(item));

    if (resource === "menu-management") {
      normalized.variantsJson = JSON.stringify(normalized.variants ?? [], null, 2);
      normalized.currentCost = normalized.unitCosts?.[0]?.cost ?? null;
      normalized.stockTracked = Boolean(normalized.stockItemId);
      normalized.stockTrackingLabel = normalized.stockItemId ? "Takipli" : "Takipsiz";
      normalized.recipeEnabled = Boolean(normalized.recipe);
      normalized.recipeStatus = normalized.recipe ? "Bagli" : "Yok";
      normalized.recipeItemsJson = (normalized.recipe?.items ?? []).map((recipeItem: any) => ({
        inventoryItemId: recipeItem.inventoryItemId,
        quantity: recipeItem.quantity,
      }));
      normalized.theoreticalCost = this.calculateRecipeTheoreticalCost(normalized.recipe?.items ?? []);
      normalized.vatRateLabel = normalized.vatRate?.name ?? "-";
      normalized.visibilityLabel = normalized.isVisible ? "Gorunur" : "Gizli";
    }

    if (resource === "optional-products" || resource === "required-choice-groups") {
      normalized.optionsJson = JSON.stringify(normalized.options ?? [], null, 2);
    }

    if (normalized.conditionsJson) {
      normalized.conditionsJson = JSON.stringify(normalized.conditionsJson, null, 2);
    }
    if (normalized.benefitsJson) {
      normalized.benefitsJson = JSON.stringify(normalized.benefitsJson, null, 2);
    }
    if (normalized.settingsJson) {
      normalized.settingsJson = JSON.stringify(normalized.settingsJson, null, 2);
    }
    if (normalized.valueJson) {
      normalized.valueJson = JSON.stringify(normalized.valueJson, null, 2);
    }

    return normalized;
  }

  private calculateRecipeTheoreticalCost(recipeItems: Array<any>) {
    const total = recipeItems.reduce((sum, item) => {
      const quantity = Number(item.quantity ?? 0);
      const unitCost = Number(item.inventoryItem?.stockEntries?.[0]?.unitCost ?? 0);
      return sum + quantity * unitCost;
    }, 0);
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }
}
