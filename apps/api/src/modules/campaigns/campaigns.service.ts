import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import type { AuthenticatedUser } from "../../common/types/request-context";

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, branchId?: string) {
    if (branchId) {
      this.ensureBranchAccess(actor, branchId);
    }

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        branchId: branchId ? branchId : { in: actor.branchIds },
      },
      include: {
        branch: true,
      },
      orderBy: [{ startsAt: "desc" }, { priority: "desc" }],
      take: 200,
    });

    const now = new Date();
    return {
      items: campaigns.map((campaign) => ({
        id: campaign.id,
        branchId: campaign.branchId,
        branchName: campaign.branch.name,
        name: campaign.name,
        type: campaign.type,
        discountType: campaign.discountType,
        priority: campaign.priority,
        isAutomatic: campaign.isAutomatic,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        status: campaign.endsAt && campaign.endsAt < now ? "expired" : campaign.startsAt > now ? "scheduled" : "active",
      })),
    };
  }

  private ensureBranchAccess(actor: AuthenticatedUser, branchId: string) {
    if (!actor.branchIds.includes(branchId)) {
      throw new ForbiddenException("Bu sube icin yetkin yok.");
    }
  }
}
