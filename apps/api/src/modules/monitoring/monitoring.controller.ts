import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { MonitoringAnalysisQueryDto } from "./dto/monitoring-analysis-query.dto";
import { MonitoringService } from "./monitoring.service";

@Controller("monitoring")
@ScopeLevel("tenant")
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get("errors")
  @RequirePermissions("monitoring.view")
  analyzeErrors(@Query() query: MonitoringAnalysisQueryDto, @Req() request: AppRequest) {
    return this.monitoringService.analyzeErrors(request.user!, query);
  }
}
