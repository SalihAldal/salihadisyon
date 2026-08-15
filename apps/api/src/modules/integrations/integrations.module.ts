import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [SubscriptionsModule],
  controllers: [IntegrationsController],
  providers: [PrismaService, AuditLogService, IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
