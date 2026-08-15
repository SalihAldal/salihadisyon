import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { CampaignsService } from "./campaigns.service";

@Controller("campaigns")
@ScopeLevel("branch")
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @RequirePermissions("campaign.view")
  list(@Query("branchId") branchId: string | undefined, @Req() request: AppRequest) {
    return this.campaignsService.list(request.user!, branchId);
  }
}
