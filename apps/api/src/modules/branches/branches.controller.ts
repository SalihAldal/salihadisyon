import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import { RequireSubscription } from "../../common/decorators/subscription.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { BranchesService } from "./branches.service";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { UpdateBranchDto } from "./dto/update-branch.dto";

@Controller("branches")
@ScopeLevel("tenant")
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @RequirePermissions("dashboard.view")
  list(@Query("companyId") companyId: string | undefined, @Req() request: AppRequest) {
    return this.branchesService.list(companyId, request.user!);
  }

  @Get(":id")
  @RequirePermissions("dashboard.view")
  detail(@Param("id") id: string, @Req() request: AppRequest) {
    return this.branchesService.detail(id, request.user!);
  }

  @Post()
  @RequirePermissions("staff.manage")
  @RequireSubscription({ usageMetric: "branch_count" })
  create(@Body() body: CreateBranchDto, @Req() request: AppRequest) {
    return this.branchesService.create(body, request.user!);
  }

  @Patch(":id")
  @RequirePermissions("staff.manage")
  update(@Param("id") id: string, @Body() body: UpdateBranchDto, @Req() request: AppRequest) {
    return this.branchesService.update(id, body, request.user!);
  }
}
