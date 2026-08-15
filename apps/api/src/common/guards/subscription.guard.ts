import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../database/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SUBSCRIPTION_REQUIREMENTS_KEY, type SubscriptionRequirement } from "../decorators/subscription.decorator";
import type { AppRequest } from "../types/request-context";

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const requirement = this.reflector.getAllAndOverride<SubscriptionRequirement | undefined>(SUBSCRIPTION_REQUIREMENTS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException("Gecerli abonelik baglami bulunamadi.");
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId: user.tenantId },
      include: { plan: true, usageLimits: true },
    });

    if (!subscription) {
      throw new ForbiddenException("Sirket icin aktif abonelik bulunamadi.");
    }

    if (subscription.status === "PASSIVE" || subscription.status === "SUSPENDED" || (subscription.endsAt && subscription.endsAt < new Date())) {
      throw new ForbiddenException("Abonelik suresi dolmus.");
    }

    const features = (subscription.plan.featuresJson ?? {}) as Record<string, unknown>;
    if (requirement.feature && features[requirement.feature] !== true) {
      throw new ForbiddenException(`Bu paket ${requirement.feature} ozelligini desteklemiyor.`);
    }

    if (requirement.usageMetric && ["POST"].includes(request.method)) {
      let currentValue: number | null = null;
      let limitValue: number | null = null;

      if (requirement.usageMetric === "branch_count") {
        currentValue = await this.prisma.branch.count({ where: { companyId: user.tenantId } });
        limitValue = subscription.plan.branchLimit;
      } else if (requirement.usageMetric === "user_count") {
        currentValue = await this.prisma.user.count({ where: { companyId: user.tenantId } });
        limitValue = subscription.plan.userLimit;
      } else {
        const metric = subscription.usageLimits.find((item) => item.metricKey === requirement.usageMetric);
        currentValue = metric?.currentValue ?? null;
        limitValue = metric?.limitValue ?? null;
      }

      if (currentValue !== null && limitValue !== null && currentValue >= limitValue) {
        throw new ForbiddenException(`${requirement.usageMetric} limiti dolmus.`);
      }
    }

    return true;
  }
}
