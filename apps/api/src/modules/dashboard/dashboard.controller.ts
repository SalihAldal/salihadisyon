import { Controller, Get, Header, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { DashboardService } from "./dashboard.service";
import { DashboardExportDto } from "./dto/dashboard-export.dto";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";

@Controller("dashboard")
@ScopeLevel("branch")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("overview")
  @RequirePermissions("dashboard.view")
  getOverview(@Query() query: DashboardQueryDto, @Req() request: AppRequest) {
    return this.dashboardService.getOverview(query, request.user!);
  }

  @Get("export")
  @RequirePermissions("dashboard.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportOverview(@Query() query: DashboardExportDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Content-Disposition", "attachment; filename=dashboard-export.csv");
    return this.dashboardService.exportOverview(query, request.user!);
  }
}
