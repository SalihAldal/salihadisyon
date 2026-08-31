import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import {
  buildPrintIdempotencyKey,
  buildPrintRoutingPlan,
  type CategoryRoutingConfig,
  type PrintDestinationConfig,
  type PrintRoutingPlan,
  type PrintTrigger,
  type ProductRoutingConfig,
  type TicketItemForRouting,
} from "./print-routing.core";

@Injectable()
export class PrintRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async loadBranchRoutingContext(branchId: string, companyId: string) {
    const [destinations, categories, categoryLinks, products, productRoutings] = await Promise.all([
      this.prisma.printDestination.findMany({
        where: { branchId, companyId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.menuCategory.findMany({
        where: { companyId, OR: [{ branchId: null }, { branchId }] },
        select: { id: true, printerType: true },
      }),
      this.prisma.categoryPrintDestination.findMany({
        where: {
          category: { companyId, OR: [{ branchId: null }, { branchId }] },
          printDestination: { branchId, companyId, isActive: true },
        },
        include: { printDestination: true },
      }),
      this.prisma.menuProduct.findMany({
        where: { companyId, OR: [{ branchId: null }, { branchId }] },
        select: { id: true, categoryId: true },
      }),
      this.prisma.productPrintRouting.findMany({
        where: {
          product: { companyId, OR: [{ branchId: null }, { branchId }] },
        },
        include: {
          destinations: {
            include: { printDestination: true },
          },
        },
      }),
    ]);

    const destinationConfigs: PrintDestinationConfig[] = destinations.map((destination) => ({
      id: destination.id,
      code: destination.code,
      name: destination.name,
      isCashRegister: destination.isCashRegister,
      isActive: destination.isActive,
      sortOrder: destination.sortOrder,
    }));

    const categoryRoutingByCategoryId = new Map<string, CategoryRoutingConfig>();
    for (const category of categories) {
      const links = categoryLinks.filter((link) => link.categoryId === category.id);
      categoryRoutingByCategoryId.set(category.id, {
        categoryId: category.id,
        destinationCodes: links.map((link) => link.printDestination.code),
        printerType: category.printerType,
      });
    }

    const productRoutingByProductId = new Map<string, ProductRoutingConfig>();
    for (const routing of productRoutings) {
      productRoutingByProductId.set(routing.productId, {
        productId: routing.productId,
        useCategoryRouting: routing.useCategoryRouting,
        destinationCodes: routing.destinations.map((item) => item.printDestination.code),
      });
    }

    const productCategoryByProductId = new Map(products.map((product) => [product.id, product.categoryId] as const));

    return {
      destinations: destinationConfigs,
      categoryRoutingByCategoryId,
      productRoutingByProductId,
      productCategoryByProductId,
    };
  }

  buildPlan(input: {
    trigger: PrintTrigger;
    items: TicketItemForRouting[];
    destinations: PrintDestinationConfig[];
    categoryRoutingByCategoryId: Map<string, CategoryRoutingConfig>;
    productRoutingByProductId: Map<string, ProductRoutingConfig>;
    productCategoryByProductId: Map<string, string>;
  }): PrintRoutingPlan {
    return buildPrintRoutingPlan(input);
  }

  buildIdempotencyKey(input: {
    ticketId: string;
    destinationCode: string;
    trigger: PrintTrigger;
    printBatchId: string;
  }) {
    return buildPrintIdempotencyKey(input);
  }

  async findPrinterForDestination(branchId: string, destinationCode: string) {
    const destination = await this.prisma.printDestination.findFirst({
      where: { branchId, code: destinationCode.toUpperCase(), isActive: true },
      include: {
        printers: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!destination) return null;
    const printer = destination.printers[0] ?? null;
    return printer ? { destination, printer } : null;
  }
}
