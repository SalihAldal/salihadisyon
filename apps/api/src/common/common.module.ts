import { Global, Module } from "@nestjs/common";
import { AuditLogService } from "./audit/audit-log.service";
import { PrismaService } from "./database/prisma.service";
import { IdempotencyStoreService } from "./idempotency/idempotency-store.service";

@Global()
@Module({
  providers: [PrismaService, AuditLogService, IdempotencyStoreService],
  exports: [PrismaService, AuditLogService, IdempotencyStoreService],
})
export class CommonModule {}
