import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: { branchId?: string; search?: string }) {
    if (query.branchId) {
      this.ensureBranchAccess(actor, query.branchId);
    }

    const customers = await this.prisma.customer.findMany({
      where: {
        companyId: actor.tenantId,
        branchId: query.branchId ? query.branchId : undefined,
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: "insensitive" } },
                { businessName: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        branch: true,
        addresses: {
          where: { isDefault: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return {
      items: customers.map((customer) => ({
        id: customer.id,
        branchId: customer.branchId,
        branchName: customer.branch?.name ?? "Tum subeler",
        customerType: customer.customerType,
        fullName: customer.fullName,
        businessName: customer.businessName,
        phone: customer.phone,
        email: customer.email,
        taxNumber: customer.taxNumber,
        notes: customer.notes,
        defaultAddress: customer.addresses[0]?.addressLine ?? null,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      })),
    };
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }
}
