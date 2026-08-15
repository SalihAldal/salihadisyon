import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listCategories(actor: AuthenticatedUser, branchId?: string) {
    if (branchId) {
      await this.ensureBranchAccess(actor, branchId);
    }

    const categories = await this.prisma.menuCategory.findMany({
      where: {
        companyId: actor.tenantId,
        OR: branchId ? [{ branchId: null }, { branchId }] : [{ branchId: null }, { branchId: { in: actor.branchIds } }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return {
      items: categories.map((category) => ({
        id: category.id,
        branchId: category.branchId,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
        sortOrder: category.sortOrder,
        isVisible: category.isVisible,
        showInQr: category.showInQr,
      })),
    };
  }

  async listProducts(
    actor: AuthenticatedUser,
    query: { branchId?: string; categoryId?: string; search?: string; isVisible?: string; isActive?: string },
  ) {
    if (query.branchId) {
      await this.ensureBranchAccess(actor, query.branchId);
    }

    const products = await this.prisma.menuProduct.findMany({
      where: {
        companyId: actor.tenantId,
        categoryId: query.categoryId,
        isVisible: query.isVisible === undefined ? undefined : query.isVisible === "true",
        isActive: query.isActive === undefined ? undefined : query.isActive === "true",
        OR: query.branchId ? [{ branchId: null }, { branchId: query.branchId }] : [{ branchId: null }, { branchId: { in: actor.branchIds } }],
        ...(query.search
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { sku: { contains: query.search, mode: "insensitive" } },
                    { description: { contains: query.search, mode: "insensitive" } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        branch: true,
        vatRate: true,
        variants: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
    });

    return {
      items: products.map((product) => ({
        id: product.id,
        branchId: product.branchId,
        categoryId: product.categoryId,
        categoryName: product.category.name,
        branchName: product.branch?.name ?? "Tum subeler",
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        description: product.description,
        basePrice: Number(product.basePrice),
        vatRateId: product.vatRateId,
        vatRateName: product.vatRate?.name ?? null,
        isActive: product.isActive,
        isVisible: product.isVisible,
        showInQr: product.showInQr,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          priceDiff: Number(variant.priceDiff),
        })),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      })),
      filters: ["branch", "category", "channel", "isVisible", "isActive", "search"],
      sort: ["name", "price", "updatedAt"],
    };
  }

  async createProduct(actor: AuthenticatedUser, input: Record<string, unknown>) {
    const categoryId = String(input.categoryId ?? "").trim();
    const name = String(input.name ?? "").trim();
    const branchId = input.branchId ? String(input.branchId) : null;
    const basePrice = Number(input.basePrice ?? 0);

    if (!categoryId || !name) {
      throw new BadRequestException("Kategori ve urun adi zorunlu.");
    }

    if (!Number.isFinite(basePrice) || basePrice < 0) {
      throw new BadRequestException("Gecerli bir fiyat gir.");
    }

    if (branchId) {
      await this.ensureBranchAccess(actor, branchId);
    }

    const category = await this.prisma.menuCategory.findFirst({
      where: {
        id: categoryId,
        companyId: actor.tenantId,
      },
    });

    if (!category) {
      throw new NotFoundException("Kategori bulunamadi.");
    }

    if (category.branchId && branchId && category.branchId !== branchId) {
      throw new ForbiddenException("Kategori farkli subeye ait.");
    }

    const product = await this.prisma.menuProduct.create({
      data: {
        companyId: actor.tenantId,
        branchId,
        categoryId,
        name,
        slug: this.slugify(name),
        sku: input.sku ? String(input.sku) : null,
        description: input.description ? String(input.description) : null,
        basePrice,
        vatRateId: input.vatRateId ? String(input.vatRateId) : null,
        isActive: input.isActive === undefined ? true : this.toBoolean(input.isActive),
        isVisible: input.isVisible === undefined ? true : this.toBoolean(input.isVisible),
        showInQr: input.showInQr === undefined ? true : this.toBoolean(input.showInQr),
      },
    });

    await this.auditLogService.create({
      companyId: actor.tenantId,
      branchId,
      userId: actor.userId,
      module: "menu",
      action: "product.create",
      entityType: "menu_product",
      entityId: product.id,
      payload: input,
      oldValues: null,
      newValues: {
        id: product.id,
        branchId: product.branchId,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        description: product.description,
        basePrice: Number(product.basePrice),
        vatRateId: product.vatRateId,
        isActive: product.isActive,
        isVisible: product.isVisible,
        showInQr: product.showInQr,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      deviceInfo: actor.deviceInfo ?? null,
    });

    return product;
  }

  private async ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }

  private toBoolean(value: unknown) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }
}
