import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionUsageService } from "./subscription-usage.service";

@Module({
  controllers: [SubscriptionsController],
  providers: [PrismaService, AuditLogService, SubscriptionUsageService, SubscriptionsService],
  exports: [SubscriptionUsageService, SubscriptionsService],
})
export class SubscriptionsModule {}
