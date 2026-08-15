import { Body, Controller, Delete, Get, Param, Patch, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { EvaluateFeatureFlagsDto } from "./dto/evaluate-feature-flags.dto";
import { UpdateFeatureFlagDto } from "./dto/update-feature-flag.dto";
import { FeatureFlagsService } from "./feature-flags.service";

@Controller("feature-flags")
@ScopeLevel("tenant")
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get("me")
  evaluateForCurrentUser(@Query() query: EvaluateFeatureFlagsDto, @Req() request: AppRequest) {
    return this.featureFlagsService.evaluateForActor(query, request.user!);
  }

  @Get()
  @RequirePermissions("feature_flags.view")
  list(@Req() request: AppRequest) {
    return this.featureFlagsService.listForAdmin(request.user!);
  }

  @Patch(":key")
  @RequirePermissions("feature_flags.manage")
  update(@Param("key") key: string, @Body() body: UpdateFeatureFlagDto, @Req() request: AppRequest) {
    return this.featureFlagsService.update(key, body, request.user!);
  }

  @Delete(":key")
  @RequirePermissions("feature_flags.manage")
  reset(@Param("key") key: string, @Req() request: AppRequest) {
    return this.featureFlagsService.reset(key, request.user!);
  }
}
