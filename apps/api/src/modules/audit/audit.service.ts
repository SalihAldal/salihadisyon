import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: { branchId?: string; module?: string; search?: string; limit?: number }) {
    if (query.branchId) {
      this.ensureBranchAccess(actor, query.branchId);
    }

    const logs = await this.prisma.auditLog.findMany({
      where: {
        companyId: actor.tenantId,
        branchId: query.branchId,
        module: query.module,
        ...(query.search
          ? {
              OR: [
                { action: { contains: query.search, mode: "insensitive" } },
                { entityType: { contains: query.search, mode: "insensitive" } },
                { entityId: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        user: true,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(query.limit ?? 100, 250),
    });

    return {
      items: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        branchId: log.branchId,
        module: log.module,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        payload: log.payload,
        oldValues: log.oldValues,
        newValues: log.newValues,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        deviceInfo: log.deviceInfo,
        createdAt: log.createdAt,
        user: log.user
          ? {
              id: log.user.id,
              fullName: log.user.fullName,
              email: log.user.email,
            }
          : null,
      })),
    };
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }
}
