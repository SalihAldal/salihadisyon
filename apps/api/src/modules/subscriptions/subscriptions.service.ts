import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";
import { SubscriptionUsageService } from "./subscription-usage.service";

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly usageService: SubscriptionUsageService,
  ) {}

  async getOverview(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.view");
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId: actor.tenantId },
      include: { plan: true, usageLimits: true, billingRecords: { orderBy: { periodStart: "desc" }, take: 12 } },
    });

    if (!subscription) {
      throw new NotFoundException("Abonelik kaydi bulunamadi.");
    }

    const branchCount = await this.prisma.branch.count({ where: { companyId: actor.tenantId } });
    const userCount = await this.prisma.user.count({ where: { companyId: actor.tenantId } });
    await this.usageService.ensureUsageMetric(actor.tenantId, "branch_count", subscription.plan.branchLimit);
    await this.usageService.ensureUsageMetric(actor.tenantId, "user_count", subscription.plan.userLimit);

    const usageMap = new Map<string, { metricKey: string; currentValue: number; limitValue: number }>();
    usageMap.set("branch_count", { metricKey: "branch_count", currentValue: branchCount, limitValue: subscription.plan.branchLimit });
    usageMap.set("user_count", { metricKey: "user_count", currentValue: userCount, limitValue: subscription.plan.userLimit });
    for (const limit of subscription.usageLimits) {
      usageMap.set(limit.metricKey, {
        metricKey: limit.metricKey,
        currentValue: limit.currentValue,
        limitValue: limit.limitValue,
      });
    }

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startsAt: subscription.startsAt?.toISOString() ?? null,
        endsAt: subscription.endsAt?.toISOString() ?? null,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      },
      plan: {
        id: subscription.plan.id,
        code: subscription.plan.code,
        name: subscription.plan.name,
        priceMonthly: Number(subscription.plan.priceMonthly),
        priceYearly: Number(subscription.plan.priceYearly ?? 0),
        branchLimit: subscription.plan.branchLimit,
        userLimit: subscription.plan.userLimit,
        features: subscription.plan.featuresJson,
      },
      usage: Array.from(usageMap.values()),
      billing: subscription.billingRecords.map((record) => ({
        id: record.id,
        amount: Number(record.amount),
        currency: record.currency,
        periodStart: record.periodStart.toISOString(),
        periodEnd: record.periodEnd.toISOString(),
        paidAt: record.paidAt?.toISOString() ?? null,
        providerRef: record.providerRef,
      })),
    };
  }

  async getPlans(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.view");
    const plans = await this.prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: "asc" } });
    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: Number(plan.priceYearly ?? 0),
      branchLimit: plan.branchLimit,
      userLimit: plan.userLimit,
      features: plan.featuresJson,
    }));
  }

  async changePlan(planCode: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.manage");
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundException("Plan bulunamadi.");

    const subscription = await this.prisma.subscription.findUnique({ where: { companyId: actor.tenantId } });
    if (!subscription) throw new NotFoundException("Abonelik bulunamadi.");

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        status: "ACTIVE",
        startsAt: subscription.startsAt ?? new Date(),
      },
      include: { plan: true },
    });

    await this.usageService.ensureUsageMetric(actor.tenantId, "branch_count", plan.branchLimit);
    await this.usageService.ensureUsageMetric(actor.tenantId, "user_count", plan.userLimit);

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId: null,
      userId: actor.userId,
      module: "subscription",
      action: "plan.change",
      entityType: "subscription",
      entityId: updated.id,
      payload: { planCode },
    });

    return {
      success: true,
      subscriptionId: updated.id,
      plan: updated.plan.name,
    };
  }

  async getPlatformMeta(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.view");
    const [branches, products, customers, employees] = await Promise.all([
      this.prisma.branch.findMany({ where: { id: { in: actor.branchIds } }, orderBy: { name: "asc" } }),
      this.prisma.menuProduct.findMany({ where: { companyId: actor.tenantId }, orderBy: { name: "asc" }, take: 200 }),
      this.prisma.customer.findMany({ where: { companyId: actor.tenantId }, orderBy: { fullName: "asc" }, take: 200 }),
      this.prisma.employeeProfile.findMany({
        where: { branchId: { in: actor.branchIds } },
        include: { user: true, branch: true },
        orderBy: { employeeCode: "asc" },
        take: 200,
      }),
    ]);

    return {
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
      products: products.map((product) => ({ id: product.id, name: product.name })),
      customers: customers.map((customer) => ({ id: customer.id, name: customer.businessName ?? customer.fullName })),
      employees: employees.map((employee) => ({
        id: employee.id,
        name: employee.user?.fullName ?? employee.employeeCode,
        branchName: employee.branch.name,
      })),
    };
  }

  async listProductRatings(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.view");
    const ratings = await this.prisma.productRating.findMany({
      where: { companyId: actor.tenantId, branchId: { in: actor.branchIds } },
      include: { branch: true, product: true, customer: true },
      orderBy: { createdAt: "desc" },
    });

    return ratings.map((rating) => ({
      id: rating.id,
      branchName: rating.branch.name,
      productName: rating.product.name,
      customerName: rating.customer?.businessName ?? rating.customer?.fullName ?? "-",
      score: rating.score,
      comment: rating.comment,
      source: rating.source,
      createdAt: rating.createdAt.toISOString(),
      branchId: rating.branchId,
      productId: rating.productId,
      customerId: rating.customerId,
    }));
  }

  async upsertProductRating(id: string | null, data: Record<string, unknown>, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.manage");
    const branchId = String(data.branchId ?? "");
    this.ensureBranchAccess(actor, branchId);

    const payload = {
      companyId: actor.tenantId,
      branchId,
      productId: String(data.productId ?? ""),
      customerId: data.customerId ? String(data.customerId) : null,
      score: Number(data.score ?? 0),
      comment: data.comment ? String(data.comment) : null,
      source: data.source ? String(data.source) : "manual",
    };

    if (payload.score < 1 || payload.score > 5) {
      throw new BadRequestException("Puan 1 ile 5 arasinda olmali.");
    }

    if (id) {
      const current = await this.prisma.productRating.findUnique({ where: { id } });
      if (!current || current.companyId !== actor.tenantId) {
        throw new NotFoundException("Puan kaydi bulunamadi.");
      }
    }

    const item = id ? await this.prisma.productRating.update({ where: { id }, data: payload }) : await this.prisma.productRating.create({ data: payload });

    if (!id) {
      await this.usageService.adjustUsageMetric(actor.tenantId, "product_ratings", 1, 500);
    }

    return item;
  }

  async deleteProductRating(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.manage");
    const current = await this.prisma.productRating.findUnique({ where: { id } });
    if (!current || current.companyId !== actor.tenantId) {
      throw new NotFoundException("Puan kaydi bulunamadi.");
    }
    await this.prisma.productRating.delete({ where: { id } });
    await this.usageService.adjustUsageMetric(actor.tenantId, "product_ratings", -1, 500);
    return { success: true };
  }

  async listStaffDiscounts(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.view");
    const discounts = await this.prisma.staffDiscount.findMany({
      where: { companyId: actor.tenantId, branchId: { in: actor.branchIds } },
      include: { branch: true, employeeProfile: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    });

    return discounts.map((discount) => ({
      id: discount.id,
      title: discount.title,
      branchName: discount.branch.name,
      employeeName: discount.employeeProfile.user?.fullName ?? discount.employeeProfile.employeeCode,
      discountType: discount.discountType,
      value: Number(discount.value),
      dailyLimit: Number(discount.dailyLimit ?? 0),
      monthlyLimit: Number(discount.monthlyLimit ?? 0),
      approvalRequired: discount.approvalRequired,
      isActive: discount.isActive,
      branchId: discount.branchId,
      employeeProfileId: discount.employeeProfileId,
    }));
  }

  async upsertStaffDiscount(id: string | null, data: Record<string, unknown>, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.manage");
    const branchId = String(data.branchId ?? "");
    this.ensureBranchAccess(actor, branchId);

    const payload = {
      companyId: actor.tenantId,
      branchId,
      employeeProfileId: String(data.employeeProfileId ?? ""),
      title: String(data.title ?? ""),
      discountType: String(data.discountType ?? "percentage"),
      value: Number(data.value ?? 0),
      dailyLimit: data.dailyLimit ? Number(data.dailyLimit) : null,
      monthlyLimit: data.monthlyLimit ? Number(data.monthlyLimit) : null,
      approvalRequired: data.approvalRequired === true || data.approvalRequired === "true",
      isActive: data.isActive !== false && data.isActive !== "false",
    };

    if (id) {
      const current = await this.prisma.staffDiscount.findUnique({ where: { id } });
      if (!current || current.companyId !== actor.tenantId) {
        throw new NotFoundException("Indirim kaydi bulunamadi.");
      }
    }

    const item = id ? await this.prisma.staffDiscount.update({ where: { id }, data: payload }) : await this.prisma.staffDiscount.create({ data: payload });

    if (!id) {
      await this.usageService.adjustUsageMetric(actor.tenantId, "staff_discounts", 1, 50);
    }

    return item;
  }

  async deleteStaffDiscount(id: string, actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.manage");
    const current = await this.prisma.staffDiscount.findUnique({ where: { id } });
    if (!current || current.companyId !== actor.tenantId) {
      throw new NotFoundException("Indirim kaydi bulunamadi.");
    }
    await this.prisma.staffDiscount.delete({ where: { id } });
    await this.usageService.adjustUsageMetric(actor.tenantId, "staff_discounts", -1, 50);
    return { success: true };
  }

  async getGoPosLink(actor: AuthenticatedUser) {
    this.ensurePermission(actor, "subscription.view");
    const url = (process.env.POS_WEB_URL ?? "").trim();
    return {
      title: "Satis Ekranina Git",
      url: url || null,
      description: url
        ? "Canli satis operasyonu icin POS ekranina gecis linki"
        : "POS linki tanimli degil. `POS_WEB_URL` env degeri girilmelidir.",
      featuresRequired: ["pos_web_access"],
      enabled: Boolean(url),
    };
  }

  private ensurePermission(actor: AuthenticatedUser, permission: string) {
    if (!actor.permissions.includes(permission) && actor.role !== "super_admin") {
      throw new ForbiddenException("Bu modul icin yetkin yok.");
    }
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }
}
