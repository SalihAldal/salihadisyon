import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentStatus } from "@prisma/client";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { toCsv } from "../../common/utils/csv";
import { CreateAccountingResourceDto } from "./dto/create-accounting-resource.dto";
import { ListAccountingResourceDto } from "./dto/list-accounting-resource.dto";
import { UpdateAccountingResourceDto } from "./dto/update-accounting-resource.dto";
import { accountingRegistry, type AccountingFieldConfig } from "./accounting.registry";
import type { AccountingResource } from "./accounting.resources";

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getOverview(actor: AuthenticatedUser, branchId?: string) {
    this.ensurePermission(actor, "accounting.view");
    const selectedBranchIds = branchId ? [branchId] : actor.branchIds;
    if (branchId) this.ensureBranchAccess(actor, branchId);

    const [accounts, completedPayments, invoiceTotal, fixedCostTotal, payrollTotal, otherPaymentTotal, cashVariance, activeFixedCosts, currentPeriodFixedCosts] = await Promise.all([
      this.prisma.account.count({ where: { branchId: { in: selectedBranchIds } } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.COMPLETED,
          ticket: { branchId: { in: selectedBranchIds } },
        },
      }),
      this.prisma.invoice.aggregate({ _sum: { grandTotal: true }, where: { branchId: { in: selectedBranchIds } } }),
      this.prisma.expense.aggregate({ _sum: { amount: true }, where: { branchId: { in: selectedBranchIds }, expenseType: "fixed_cost" } }),
      this.prisma.payrollPayment.aggregate({ _sum: { amount: true }, where: { branchId: { in: selectedBranchIds }, movementType: "PAYMENT", deletedAt: null } }),
      this.prisma.otherPayment.aggregate({ _sum: { amount: true }, where: { branchId: { in: selectedBranchIds } } }),
      this.prisma.cashClosure.aggregate({ _sum: { varianceAmount: true }, where: { branchId: { in: selectedBranchIds } } }),
      this.prisma.expense.findMany({
        where: {
          branchId: { in: selectedBranchIds },
          expenseType: "fixed_cost",
          isActive: true,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
      }),
      this.prisma.expense.findMany({
        where: {
          branchId: { in: selectedBranchIds },
          expenseType: "fixed_cost",
          expenseDate: {
            gte: this.startOfCurrentMonth(),
            lte: new Date(),
          },
        },
      }),
    ]);

    const recurringMonthlyEstimate = this.roundCurrency(
      activeFixedCosts.reduce((sum, item) => sum + this.calculateMonthlyEstimate(item.amount, item.recurrenceType), 0),
    );
    const fixedCostSummary = {
      activeCount: activeFixedCosts.length,
      recurringMonthlyEstimate,
      currentMonthActual: Number(currentPeriodFixedCosts.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2)),
      oneTimeCount: activeFixedCosts.filter((item) => item.recurrenceType === "once").length,
      recurringCount: activeFixedCosts.filter((item) => item.recurrenceType !== "once").length,
    };

    return {
      cards: [
        { key: "accounts", label: "Toplam Hesap", value: accounts },
        { key: "collections", label: "Tahsilat", value: Number(completedPayments._sum.amount ?? 0) },
        { key: "invoices", label: "Fatura Hacmi", value: Number(invoiceTotal._sum.grandTotal ?? 0) },
        { key: "costs", label: "Toplam Gider", value: Number(fixedCostTotal._sum.amount ?? 0) + Number(payrollTotal._sum.amount ?? 0) + Number(otherPaymentTotal._sum.amount ?? 0) },
      ],
      ledgerSnapshot: {
        fixedCosts: Number(fixedCostTotal._sum.amount ?? 0),
        payroll: Number(payrollTotal._sum.amount ?? 0),
        otherPayments: Number(otherPaymentTotal._sum.amount ?? 0),
        cashVariance: Number(cashVariance._sum.varianceAmount ?? 0),
      },
      fixedCostSummary,
    };
  }

  async getMeta(resource: AccountingResource, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "accounting.view");
    const config = accountingRegistry[resource];
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
        options: filter.key === "branchId" ? runtimeOptions.branches : filter.options,
      })),
    };
  }

  async list(resource: AccountingResource, query: ListAccountingResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "accounting.view");

    if (resource === "ticket-ledger") {
      return this.listTicketLedger(query, actor);
    }

    if (resource === "sold-products") {
      return this.listSoldProducts(query, actor);
    }

    const config = accountingRegistry[resource];
    const page = query.page ?? 1;
    const limit = query.export ? 5000 : query.limit ?? 20;
    const where = this.buildWhere(resource, query, actor);
    const delegate = this.getDelegate(config.delegate!);

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        include: config.include,
        orderBy: this.getOrderBy(resource),
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

  async detail(resource: AccountingResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "accounting.view");

    if (resource === "ticket-ledger") {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id, branchId: { in: actor.branchIds } },
        include: { branch: true, customer: true, items: true, payments: { include: { account: true } } },
      });
      if (!ticket) throw new NotFoundException("Adisyon bulunamadi.");
      return this.serializeItem(resource, ticket);
    }

    if (resource === "sold-products") {
      const item = await this.prisma.ticketItem.findFirst({
        where: { id, ticket: { branchId: { in: actor.branchIds } } },
        include: { product: true, ticket: { include: { branch: true, customer: true } } },
      });
      if (!item) throw new NotFoundException("Satis kalemi bulunamadi.");
      return this.serializeSoldProduct(item);
    }

    const config = accountingRegistry[resource];
    const item = await this.getDelegate(config.delegate!).findFirst({
      where: { id, ...this.buildWhere(resource, {}, actor) },
      include: config.include,
    });

    if (!item) {
      throw new NotFoundException("Kayit bulunamadi.");
    }

    return this.serializeItem(resource, item);
  }

  async create(resource: AccountingResource, dto: CreateAccountingResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "accounting.manage");
    const config = accountingRegistry[resource];
    if (config.readOnly || !config.delegate) throw new BadRequestException("Bu kaynak olusturulamaz.");

    const data = await this.buildMutationData(resource, dto.data, actor, false);
    const created = await this.createOrUpdateResource(resource, "create", undefined, data, actor);
    await this.writeAudit(resource, "create", created.id, data, actor);
    return created;
  }

  async update(resource: AccountingResource, id: string, dto: UpdateAccountingResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "accounting.manage");
    const config = accountingRegistry[resource];
    if (config.readOnly || !config.delegate) throw new BadRequestException("Bu kaynak guncellenemez.");

    await this.detail(resource, id, actor);
    const data = await this.buildMutationData(resource, dto.data, actor, true);
    const updated = await this.createOrUpdateResource(resource, "update", id, data, actor);
    await this.writeAudit(resource, "update", id, data, actor);
    return updated;
  }

  async remove(resource: AccountingResource, id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "accounting.manage");
    const config = accountingRegistry[resource];
    if (config.readOnly || !config.delegate) throw new BadRequestException("Bu kaynak silinemez.");

    if (resource === "invoices") {
      await this.prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    }

    const current = await this.detail(resource, id, actor);
    await this.getDelegate(config.delegate).delete({ where: { id } });
    await this.prisma.ledgerEntry.deleteMany({ where: { sourceType: resource, sourceId: id } });
    await this.writeAudit(resource, "delete", id, current, actor);
    return { success: true };
  }

  async exportResource(resource: AccountingResource, query: ListAccountingResourceDto, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "accounting.export");
    const config = accountingRegistry[resource];
    const result = await this.list(resource, { ...query, export: true, page: 1, limit: 5000 }, actor);
    const headers = config.columns.map((column) => column.label);
    const rows = result.items.map((item: Record<string, unknown>) =>
      config.columns.map((column) => {
        const value = this.getValueByPath(item as Record<string, unknown>, column.key);
        return typeof value === "object" && value !== null ? JSON.stringify(value) : (value as string | number | null | undefined);
      }),
    );

    return toCsv(headers, rows);
  }

  private async listTicketLedger(query: ListAccountingResourceDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.export ? 5000 : query.limit ?? 20;
    if (query.branchId) this.ensureBranchAccess(actor, query.branchId);

    const where: Record<string, unknown> = {
      branchId: { in: query.branchId ? [query.branchId] : actor.branchIds },
    };

    if (query.startDate || query.endDate) {
      where.closedAt = this.createDateFilter(query.startDate, query.endDate);
    }

    if (query.search) {
      where.OR = [
        { ticketName: { contains: query.search, mode: "insensitive" } },
        { customer: { fullName: { contains: query.search, mode: "insensitive" } } },
        { customer: { businessName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: { branch: true, customer: true, payments: { include: { account: true } } },
        orderBy: { closedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeItem("ticket-ledger", item)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  private async listSoldProducts(query: ListAccountingResourceDto, actor: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.export ? 5000 : query.limit ?? 20;
    if (query.branchId) this.ensureBranchAccess(actor, query.branchId);

    const where: Record<string, unknown> = {
      ticket: { branchId: { in: query.branchId ? [query.branchId] : actor.branchIds } },
    };

    if (query.startDate || query.endDate) {
      where.ticket = {
        ...(where.ticket as Record<string, unknown>),
        closedAt: this.createDateFilter(query.startDate, query.endDate),
      };
    }

    if (query.search) {
      where.OR = [
        { productName: { contains: query.search, mode: "insensitive" } },
        { ticket: { ticketName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.ticketItem.findMany({
        where,
        include: { ticket: { include: { branch: true } }, product: true },
        orderBy: { ticket: { closedAt: "desc" } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ticketItem.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeSoldProduct(item)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  private buildWhere(resource: AccountingResource, query: Partial<ListAccountingResourceDto>, actor: AuthenticatedUser) {
    const where: Record<string, unknown> = {};

    switch (resource) {
      case "accounts":
      case "invoices":
      case "cash-closures":
      case "fixed-costs":
      case "payroll":
      case "other-payments":
        where.branchId = { in: query.branchId ? [query.branchId] : actor.branchIds };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
      case "payments":
        where.ticket = { branchId: { in: query.branchId ? [query.branchId] : actor.branchIds } };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
      case "invoice-items":
        where.invoice = { branchId: { in: query.branchId ? [query.branchId] : actor.branchIds } };
        if (query.branchId) this.ensureBranchAccess(actor, query.branchId);
        break;
      case "vat-rates":
      case "suppliers":
      case "business-customers":
        where.companyId = actor.tenantId;
        break;
      case "supplier-vat":
        where.supplier = { companyId: actor.tenantId };
        break;
      case "customer-vat":
        where.customer = { companyId: actor.tenantId, customerType: "business" };
        break;
      case "unit-costs":
        where.product = { companyId: actor.tenantId };
        break;
    }

    if (resource === "business-customers") {
      where.customerType = "business";
    }

    if (resource === "fixed-costs") {
      where.expenseType = "fixed_cost";
      if (query.category) {
        where.category = query.category;
      }
      if (query.recurrenceType) {
        where.recurrenceType = query.recurrenceType;
      }
      if (query.isActive === "true" || query.isActive === "false") {
        where.isActive = query.isActive === "true";
      }
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

  private buildSearchWhere(resource: AccountingResource, search: string) {
    switch (resource) {
      case "payments":
        return {
          OR: [
            { referenceNumber: { contains: search, mode: "insensitive" } },
            { notes: { contains: search, mode: "insensitive" } },
            { ticket: { ticketName: { contains: search, mode: "insensitive" } } },
          ],
        };
      case "supplier-vat":
        return { OR: [{ supplier: { name: { contains: search, mode: "insensitive" } } }] };
      case "customer-vat":
        return {
          OR: [
            { customer: { fullName: { contains: search, mode: "insensitive" } } },
            { customer: { businessName: { contains: search, mode: "insensitive" } } },
          ],
        };
      case "invoice-items":
        return {
          OR: [
            { description: { contains: search, mode: "insensitive" } },
            { invoice: { invoiceNo: { contains: search, mode: "insensitive" } } },
          ],
        };
      default: {
        const fields = accountingRegistry[resource].searchFields ?? [];
        if (fields.length === 0) return {};
        return {
          OR: fields.map((field) => ({
            [field]: { contains: search, mode: "insensitive" },
          })),
        };
      }
    }
  }

  private getDateField(resource: AccountingResource) {
    switch (resource) {
      case "payments":
        return "paidAt";
      case "invoices":
        return "issueDate";
      case "cash-closures":
        return "closureDate";
      case "fixed-costs":
        return "expenseDate";
      case "payroll":
      case "other-payments":
        return "paymentDate";
      case "supplier-vat":
      case "customer-vat":
        return "periodStart";
      case "unit-costs":
        return "effectiveAt";
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

  private getOrderBy(resource: AccountingResource) {
    switch (resource) {
      case "accounts":
        return { code: "asc" };
      case "payments":
        return { paidAt: "desc" };
      case "vat-rates":
        return { rate: "asc" };
      case "suppliers":
        return { name: "asc" };
      case "business-customers":
        return { businessName: "asc" };
      case "invoice-items":
      case "invoices":
        return { issueDate: "desc" };
      case "unit-costs":
        return { effectiveAt: "desc" };
      case "cash-closures":
        return { closureDate: "desc" };
      case "fixed-costs":
        return { expenseDate: "desc" };
      case "payroll":
      case "other-payments":
        return { paymentDate: "desc" };
      default:
        return { id: "desc" };
    }
  }

  private async buildMutationData(resource: AccountingResource, input: Record<string, unknown>, actor: AuthenticatedUser, isUpdate: boolean) {
    const config = accountingRegistry[resource];
    const data: Record<string, unknown> = {};

    for (const field of config.fields) {
      if (!(field.key in input)) continue;
      data[field.key] = this.normalizeFieldValue(field.key, input[field.key], config);
    }

    for (const field of config.fields) {
      if (!isUpdate && field.required && (data[field.key] === undefined || data[field.key] === null || data[field.key] === "")) {
        throw new BadRequestException(`${field.label} zorunlu.`);
      }
    }

    if (resource === "business-customers") {
      data.companyId = actor.tenantId;
      data.customerType = "business";
      if (typeof data.branchId === "string" && data.branchId) this.ensureBranchAccess(actor, data.branchId);
    }

    if (resource === "suppliers" || resource === "vat-rates") {
      data.companyId = actor.tenantId;
    }

    if (resource === "fixed-costs") {
      data.expenseType = "fixed_cost";
      data.category = this.normalizeFixedCostCategory(data.category);
      data.recurrenceType = this.normalizeRecurrenceType(data.recurrenceType);
      if (data.startDate === undefined || data.startDate === null) {
        data.startDate = data.expenseDate ?? new Date();
      }
      if (data.isActive === undefined) {
        data.isActive = true;
      }
      if (data.endDate && data.startDate && new Date(String(data.endDate)) < new Date(String(data.startDate))) {
        throw new BadRequestException("Bitis tarihi baslangic tarihinden once olamaz.");
      }
      if (Number(data.amount ?? 0) <= 0) {
        throw new BadRequestException("Tutar sifirdan buyuk olmali.");
      }
    }

    if (resource === "cash-closures") {
      const expectedAmount = Number(data.expectedAmount ?? 0);
      const countedAmount = Number(data.countedAmount ?? 0);
      data.varianceAmount = countedAmount - expectedAmount;
    }

    if (resource === "invoices") {
      const rawItems = this.parseJsonArrayObject(input.itemsJson);
      const items = rawItems.map((item) => {
        const quantity = Number(item.quantity ?? 0);
        const unitPrice = Number(item.unitPrice ?? 0);
        const vatRate = Number(item.vatRate ?? 0);
        const lineTotal = Number((quantity * unitPrice).toFixed(2));
        return {
          description: String(item.description ?? ""),
          quantity,
          unitPrice,
          vatRate,
          lineTotal,
        };
      });

      const totalBase = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const totalVat = items.reduce((sum, item) => sum + item.lineTotal * (item.vatRate / 100), 0);
      data.totalBase = Number(totalBase.toFixed(2));
      data.totalVat = Number(totalVat.toFixed(2));
      data.grandTotal = Number((totalBase + totalVat).toFixed(2));
      data.items = items;
      delete data.itemsJson;
    }

    if (resource === "payments" && !data.paidAt && data.status === PaymentStatus.COMPLETED) {
      data.paidAt = new Date();
    }

    const branchId = this.extractBranchId(resource, data);
    if (branchId) this.ensureBranchAccess(actor, branchId);

    return data;
  }

  private normalizeFieldValue(key: string, value: unknown, config: typeof accountingRegistry[AccountingResource]) {
    if (value === "") return null;
    if (config.numberFields?.includes(key)) return value === null || value === undefined ? null : Number(value);
    if (config.booleanFields?.includes(key)) return value === true || value === "true";
    if (config.jsonFields?.includes(key)) return value;
    if (config.dateFields?.includes(key)) return value ? new Date(String(value)) : null;
    return value;
  }

  private async createOrUpdateResource(
    resource: AccountingResource,
    mode: "create" | "update",
    id: string | undefined,
    data: Record<string, unknown>,
    actor: AuthenticatedUser,
  ) {
    const config = accountingRegistry[resource];
    const delegate = this.getDelegate(config.delegate!);
    let entity: any;

    if (resource === "invoices") {
      const items = (data.items as Array<Record<string, unknown>>) ?? [];
      delete data.items;
      entity =
        mode === "create"
          ? await delegate.create({
              data: {
                ...data,
                items: {
                  create: items,
                },
              },
              include: config.include,
            })
          : await delegate.update({
              where: { id },
              data: {
                ...data,
                items: {
                  deleteMany: {},
                  create: items,
                },
              },
              include: config.include,
            });
    } else {
      entity =
        mode === "create"
          ? await delegate.create({ data, include: config.include })
          : await delegate.update({ where: { id }, data, include: config.include });
    }

    await this.syncLedgerEntries(resource, entity, actor);
    return this.serializeItem(resource, entity);
  }

  private async syncLedgerEntries(resource: AccountingResource, entity: any, actor: AuthenticatedUser) {
    if (!["payments", "invoices", "cash-closures", "fixed-costs", "payroll", "other-payments"].includes(resource)) {
      return;
    }

    const sourceId = entity.id as string;
    await this.prisma.ledgerEntry.deleteMany({ where: { sourceType: resource, sourceId } });

    if (resource === "payments") {
      const ticket = await this.prisma.ticket.findUnique({ where: { id: entity.ticketId } });
      if (!ticket || !entity.accountId || entity.status !== PaymentStatus.COMPLETED) return;
      await this.createLedgerEntry({
        accountId: entity.accountId,
        branchId: ticket.branchId,
        sourceType: resource,
        sourceId,
        debit: Number(entity.amount),
        credit: 0,
        entryDate: entity.paidAt ?? new Date(),
        description: `Odeme / ${entity.method}`,
        actor,
      });
      return;
    }

    if (resource === "invoices") {
      if (!entity.accountId) return;
      await this.createLedgerEntry({
        accountId: entity.accountId,
        branchId: entity.branchId,
        sourceType: resource,
        sourceId,
        debit: 0,
        credit: Number(entity.grandTotal),
        entryDate: entity.issueDate,
        description: `Fatura / ${entity.invoiceNo}`,
        actor,
      });
      return;
    }

    if (resource === "cash-closures") {
      if (!entity.accountId || Number(entity.varianceAmount) === 0) return;
      const variance = Number(entity.varianceAmount);
      await this.createLedgerEntry({
        accountId: entity.accountId,
        branchId: entity.branchId,
        sourceType: resource,
        sourceId,
        debit: variance > 0 ? variance : 0,
        credit: variance < 0 ? Math.abs(variance) : 0,
        entryDate: entity.closureDate,
        description: "Kasa kapanis farki",
        actor,
      });
      return;
    }

    const mapping = {
      "fixed-costs": { amount: Number(entity.amount), date: entity.expenseDate, description: entity.title },
      payroll: { amount: Number(entity.amount), date: entity.paymentDate, description: "Personel odemesi" },
      "other-payments": { amount: Number(entity.amount), date: entity.paymentDate, description: entity.title },
    } as const;

    const current = mapping[resource as "fixed-costs" | "payroll" | "other-payments"];
    if (!current || !entity.accountId) return;

    await this.createLedgerEntry({
      accountId: entity.accountId,
      branchId: entity.branchId,
      sourceType: resource,
      sourceId,
      debit: 0,
      credit: current.amount,
      entryDate: current.date,
      description: current.description,
      actor,
    });
  }

  private async createLedgerEntry(input: {
    accountId: string;
    branchId: string;
    sourceType: string;
    sourceId: string;
    debit: number;
    credit: number;
    entryDate: Date;
    description: string;
    actor: AuthenticatedUser;
  }) {
    await this.prisma.ledgerEntry.create({
      data: {
        accountId: input.accountId,
        branchId: input.branchId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        debit: input.debit,
        credit: input.credit,
        entryDate: input.entryDate,
        description: input.description,
      },
    });

    await this.auditLogService.create({
      companyId: input.actor.tenantId,
      branchId: input.branchId,
      userId: input.actor.userId,
      module: "accounting",
      action: "ledger.sync",
      entityType: input.sourceType,
      entityId: input.sourceId,
      payload: input,
    });
  }

  private parseJsonArrayObject(value: unknown) {
    if (!value) return [];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
      } catch {
        throw new BadRequestException("JSON array bekleniyor.");
      }
    }
    throw new BadRequestException("JSON array bekleniyor.");
  }

  private extractBranchId(resource: AccountingResource, data: Record<string, unknown>) {
    switch (resource) {
      case "accounts":
      case "invoices":
      case "cash-closures":
      case "fixed-costs":
      case "payroll":
      case "other-payments":
        return typeof data.branchId === "string" ? data.branchId : null;
      default:
        return null;
    }
  }

  private serializeItem(resource: AccountingResource, item: any) {
    const normalized = JSON.parse(JSON.stringify(item));
    if (resource === "invoices") {
      normalized.itemsJson = JSON.stringify(normalized.items ?? [], null, 2);
    }
    if (resource === "fixed-costs") {
      normalized.category = this.formatFixedCostCategory(normalized.category);
      normalized.recurrenceLabel = this.formatRecurrenceType(normalized.recurrenceType);
      normalized.activeStatusLabel = normalized.isActive ? "Aktif" : "Pasif";
      normalized.monthlyEstimate = this.calculateMonthlyEstimate(normalized.amount, normalized.recurrenceType);
      normalized.scheduleLabel = this.buildFixedCostScheduleLabel(normalized);
    }
    return normalized;
  }

  private normalizeFixedCostCategory(value: unknown) {
    const category = String(value ?? "").trim().toLowerCase();
    const allowed = new Set(["rent", "salary", "electricity", "water", "internet", "subscription", "dues", "general"]);
    if (!allowed.has(category)) {
      throw new BadRequestException("Gecersiz sabit maliyet kategorisi.");
    }
    return category;
  }

  private normalizeRecurrenceType(value: unknown) {
    const recurrenceType = String(value ?? "once").trim().toLowerCase();
    const allowed = new Set(["once", "daily", "weekly", "monthly", "quarterly", "yearly"]);
    if (!allowed.has(recurrenceType)) {
      throw new BadRequestException("Gecersiz tekrar tipi.");
    }
    return recurrenceType;
  }

  private formatFixedCostCategory(category: string) {
    const labels: Record<string, string> = {
      rent: "Kira",
      salary: "Maas",
      electricity: "Elektrik",
      water: "Su",
      internet: "Internet",
      subscription: "Abonelik",
      dues: "Aidat",
      general: "Genel Gider",
    };
    return labels[category] ?? category;
  }

  private formatRecurrenceType(recurrenceType: string) {
    const labels: Record<string, string> = {
      once: "Tek Seferlik",
      daily: "Gunluk",
      weekly: "Haftalik",
      monthly: "Aylik",
      quarterly: "3 Aylik",
      yearly: "Yillik",
    };
    return labels[recurrenceType] ?? recurrenceType;
  }

  private calculateMonthlyEstimate(amount: unknown, recurrenceType: string) {
    const numericAmount = Number(amount ?? 0);
    const multiplierMap: Record<string, number> = {
      once: 0,
      daily: 30,
      weekly: 4.33,
      monthly: 1,
      quarterly: 1 / 3,
      yearly: 1 / 12,
    };
    return this.roundCurrency(numericAmount * (multiplierMap[recurrenceType] ?? 0));
  }

  private buildFixedCostScheduleLabel(item: { startDate?: string | null; endDate?: string | null; recurrenceType?: string }) {
    const start = item.startDate ? new Date(item.startDate) : null;
    const end = item.endDate ? new Date(item.endDate) : null;
    const recurrence = this.formatRecurrenceType(String(item.recurrenceType ?? "once"));
    if (!start && !end) return recurrence;
    return `${recurrence} / ${start ? start.toISOString().slice(0, 10) : "-"}${end ? ` - ${end.toISOString().slice(0, 10)}` : ""}`;
  }

  private startOfCurrentMonth() {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private serializeSoldProduct(item: any) {
    const normalized = JSON.parse(JSON.stringify(item));
    return {
      ...normalized,
      branchName: normalized.ticket?.branch?.name ?? "-",
      closedAt: normalized.ticket?.closedAt ?? null,
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
      throw new ForbiddenException("Bu muhasebe islemi icin yetkin yok.");
    }
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private async getRuntimeOptions(
    keys: Array<"branches" | "accounts" | "suppliers" | "customers" | "invoices" | "products" | "employees" | "tickets" | "terminals">,
    actor: AuthenticatedUser,
  ) {
    const [branches, accounts, suppliers, customers, invoices, products, employees, tickets, terminals] = await Promise.all([
      keys.includes("branches") ? this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      keys.includes("accounts") ? this.prisma.account.findMany({ where: { branchId: { in: actor.branchIds } }, orderBy: { code: "asc" } }) : Promise.resolve([]),
      keys.includes("suppliers") ? this.prisma.supplier.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      keys.includes("customers")
        ? this.prisma.customer.findMany({ where: { companyId: actor.tenantId, customerType: "business" }, orderBy: { businessName: "asc" } })
        : Promise.resolve([]),
      keys.includes("invoices") ? this.prisma.invoice.findMany({ where: { branchId: { in: actor.branchIds } }, orderBy: { issueDate: "desc" }, take: 200 }) : Promise.resolve([]),
      keys.includes("products") ? this.prisma.menuProduct.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" }, take: 200 }) : Promise.resolve([]),
      keys.includes("employees")
        ? this.prisma.employeeProfile.findMany({ where: { branchId: { in: actor.branchIds } }, include: { user: true }, orderBy: { employeeCode: "asc" }, take: 200 })
        : Promise.resolve([]),
      keys.includes("tickets")
        ? this.prisma.ticket.findMany({ where: { branchId: { in: actor.branchIds } }, orderBy: { openedAt: "desc" }, take: 200 })
        : Promise.resolve([]),
      keys.includes("terminals")
        ? this.prisma.terminal.findMany({ where: { branchId: { in: actor.branchIds } }, orderBy: { name: "asc" } })
        : Promise.resolve([]),
    ]);

    return {
      branches: branches.map((branch) => ({ label: branch.name, value: branch.id })),
      accounts: accounts.map((account) => ({ label: `${account.code} / ${account.name}`, value: account.id })),
      suppliers: suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id })),
      customers: customers.map((customer) => ({ label: customer.businessName ?? customer.fullName, value: customer.id })),
      invoices: invoices.map((invoice) => ({ label: invoice.invoiceNo, value: invoice.id })),
      products: products.map((product) => ({ label: product.name, value: product.id })),
      employees: employees.map((employee) => ({ label: employee.user?.fullName ?? employee.employeeCode, value: employee.id })),
      tickets: tickets.map((ticket) => ({ label: ticket.ticketName ?? ticket.id, value: ticket.id })),
      terminals: terminals.map((terminal) => ({ label: terminal.name, value: terminal.id })),
    };
  }

  private resolveFieldOptions(field: AccountingFieldConfig, runtimeOptions: Awaited<ReturnType<AccountingService["getRuntimeOptions"]>>) {
    if (field.options?.length) return field.options;
    switch (field.key) {
      case "branchId":
        return runtimeOptions.branches;
      case "accountId":
        return runtimeOptions.accounts;
      case "supplierId":
        return runtimeOptions.suppliers;
      case "customerId":
        return runtimeOptions.customers;
      case "invoiceId":
        return runtimeOptions.invoices;
      case "productId":
        return runtimeOptions.products;
      case "employeeProfileId":
        return runtimeOptions.employees;
      case "ticketId":
        return runtimeOptions.tickets;
      case "terminalId":
        return runtimeOptions.terminals;
      default:
        return undefined;
    }
  }

  private async writeAudit(resource: AccountingResource, action: string, entityId: string, payload: unknown, actor: AuthenticatedUser) {
    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: null,
      userId: actor.userId,
      module: "accounting",
      action: `${resource}.${action}`,
      entityType: resource,
      entityId,
      payload,
    });
  }
}
