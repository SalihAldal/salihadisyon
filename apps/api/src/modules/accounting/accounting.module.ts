import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";

@Module({
  controllers: [AccountingController],
  providers: [PrismaService, AuditLogService, AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
