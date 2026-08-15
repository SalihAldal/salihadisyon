import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [SubscriptionsModule],
  controllers: [SupportController],
  providers: [PrismaService, AuditLogService, SupportService],
  exports: [SupportService],
})
export class SupportModule {}
