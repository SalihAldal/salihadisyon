import { SetMetadata } from "@nestjs/common";

export const SUBSCRIPTION_REQUIREMENTS_KEY = "subscription_requirements";

export interface SubscriptionRequirement {
  feature?: string;
  usageMetric?: string;
}

export const RequireSubscription = (requirement: SubscriptionRequirement) =>
  SetMetadata(SUBSCRIPTION_REQUIREMENTS_KEY, requirement);
