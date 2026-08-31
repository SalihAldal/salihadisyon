import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";

type AdminActor = {
  tenantId: string;
  userId: string;
  branchIds: string[];
};

@Injectable()
export class PrintIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureBranch(actor: AdminActor, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new BadRequestException("Bu sube icin yetkin yok.");
    }
  }

  async listIntegrations(actor: AdminActor, branchId: string) {
    this.ensureBranch(actor, branchId);
    const [destinations, printers, categories, categoryLinks] = await Promise.all([
      this.prisma.printDestination.findMany({
        where: { companyId: actor.tenantId, branchId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.printer.findMany({
        where: { branchId },
        include: { printDestination: true, branch: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.menuCategory.findMany({
        where: { companyId: actor.tenantId, OR: [{ branchId: null }, { branchId }] },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.categoryPrintDestination.findMany({
        where: {
          printDestination: { branchId, companyId: actor.tenantId },
        },
        include: { printDestination: true },
      }),
    ]);

    return {
      branchId,
      destinations: destinations.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        isCashRegister: item.isCashRegister,
        isActive: item.isActive,
        sortOrder: item.sortOrder,
      })),
      printers: printers.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        name: item.name,
        type: item.type,
        connectionUri: item.connectionUri,
        isActive: item.isActive,
        isKitchen: item.isKitchen,
        printDestinationId: item.printDestinationId,
        printDestinationCode: item.printDestination?.code ?? null,
        branchName: item.branch.name,
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        printerType: category.printerType,
        destinationIds: categoryLinks
          .filter((link) => link.categoryId === category.id)
          .map((link) => link.printDestinationId),
      })),
    };
  }

  async saveCategoryRouting(actor: AdminActor, categoryId: string, destinationIds: string[]) {
    const category = await this.prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.companyId !== actor.tenantId) {
      throw new NotFoundException("Kategori bulunamadi.");
    }
    const branchId = category.branchId ?? actor.branchIds[0];
    if (!branchId) {
      throw new BadRequestException("Kategori sube bilgisi eksik.");
    }
    this.ensureBranch(actor, branchId);

    const destinations = await this.prisma.printDestination.findMany({
      where: {
        id: { in: destinationIds },
        companyId: actor.tenantId,
        branchId,
        isActive: true,
      },
    });
    if (destinations.length !== destinationIds.length) {
      throw new BadRequestException("Gecersiz fislik secimi.");
    }

    await this.prisma.$transaction([
      this.prisma.categoryPrintDestination.deleteMany({ where: { categoryId } }),
      this.prisma.categoryPrintDestination.createMany({
        data: destinationIds.map((printDestinationId) => ({ categoryId, printDestinationId })),
      }),
    ]);

    return { success: true, categoryId, destinationIds };
  }

  async saveProductRouting(actor: AdminActor, productId: string, useCategoryRouting: boolean, destinationIds: string[] = []) {
    const product = await this.prisma.menuProduct.findUnique({ where: { id: productId } });
    if (!product || product.companyId !== actor.tenantId) {
      throw new NotFoundException("Urun bulunamadi.");
    }
    const branchId = product.branchId ?? actor.branchIds[0];
    if (!branchId) {
      throw new BadRequestException("Urun sube bilgisi eksik.");
    }
    this.ensureBranch(actor, branchId);

    const routing = await this.prisma.productPrintRouting.upsert({
      where: { productId },
      create: { productId, useCategoryRouting },
      update: { useCategoryRouting },
    });

    await this.prisma.productPrintDestination.deleteMany({ where: { productPrintRoutingId: routing.id } });

    if (!useCategoryRouting) {
      const destinations = await this.prisma.printDestination.findMany({
        where: {
          id: { in: destinationIds },
          companyId: actor.tenantId,
          branchId,
          isActive: true,
        },
      });
      if (destinations.length !== destinationIds.length) {
        throw new BadRequestException("Gecersiz fislik secimi.");
      }
      if (destinationIds.length > 0) {
        await this.prisma.productPrintDestination.createMany({
          data: destinationIds.map((printDestinationId) => ({
            productPrintRoutingId: routing.id,
            printDestinationId,
          })),
        });
      }
    }

    return { success: true, productId, useCategoryRouting, destinationIds };
  }

  async ensureDefaultDestinations(actor: AdminActor, branchId: string) {
    this.ensureBranch(actor, branchId);
    const existing = await this.prisma.printDestination.count({ where: { branchId, companyId: actor.tenantId } });
    if (existing > 0) {
      return { created: false };
    }
    const defaults = [
      { code: "KASA", name: "Kasa Fisi", isCashRegister: true, sortOrder: 1 },
      { code: "BAR", name: "Bar Fisi", isCashRegister: false, sortOrder: 2 },
      { code: "MUTFAK", name: "Mutfak Fisi", isCashRegister: false, sortOrder: 3 },
    ];
    await this.prisma.printDestination.createMany({
      data: defaults.map((item) => ({
        companyId: actor.tenantId,
        branchId,
        code: item.code,
        name: item.name,
        isCashRegister: item.isCashRegister,
        sortOrder: item.sortOrder,
        isActive: true,
      })),
    });
    return { created: true };
  }
}
