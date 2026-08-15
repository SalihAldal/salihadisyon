import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";

@Injectable()
export class SubscriptionUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUsageMetric(companyId: string, metricKey: string, limitValue: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      return null;
    }

    return this.prisma.usageLimit.upsert({
      where: {
        subscriptionId_metricKey: {
          subscriptionId: subscription.id,
          metricKey,
        },
      },
      update: {
        limitValue,
      },
      create: {
        subscriptionId: subscription.id,
        metricKey,
        limitValue,
        currentValue: 0,
      },
    });
  }

  async adjustUsageMetric(companyId: string, metricKey: string, delta: number, fallbackLimit = 0) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      return null;
    }

    const current = await this.prisma.usageLimit.upsert({
      where: {
        subscriptionId_metricKey: {
          subscriptionId: subscription.id,
          metricKey,
        },
      },
      update: {},
      create: {
        subscriptionId: subscription.id,
        metricKey,
        currentValue: 0,
        limitValue: fallbackLimit,
      },
    });

    return this.prisma.usageLimit.update({
      where: { id: current.id },
      data: {
        currentValue: Math.max(0, current.currentValue + delta),
      },
    });
  }
}
