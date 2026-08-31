import { Module } from "@nestjs/common";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionUsageService } from "./subscription-usage.service";

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionUsageService, SubscriptionsService],
  exports: [SubscriptionUsageService, SubscriptionsService],
})
export class SubscriptionsModule {}
