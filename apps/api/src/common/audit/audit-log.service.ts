import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

export interface CreateAuditLogInput {
  companyId: string;
  branchId?: string | null;
  userId?: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: unknown;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  executor?: Prisma.TransactionClient | PrismaService;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuditLogInput) {
    try {
      const executor = input.executor ?? this.prisma;
      return await executor.auditLog.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId ?? null,
          userId: input.userId ?? null,
          module: input.module,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
          oldValues: (input.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
          newValues: (input.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          deviceInfo: input.deviceInfo ?? input.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.error("Audit log kaydi yazilamadi.", error instanceof Error ? error.stack : undefined);
      return null;
    }
  }
}
