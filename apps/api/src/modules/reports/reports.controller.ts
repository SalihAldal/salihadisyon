import { Controller, Get, Header, Param, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { BranchRevenueQueryDto } from "./dto/branch-revenue-query.dto";
import { ReportQueryDto } from "./dto/report-query.dto";
import { ReportResourceParamDto } from "./dto/report-resource-param.dto";
import { RevenueQueryDto } from "./dto/revenue-query.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
@ScopeLevel("tenant")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("revenue/overview")
  @RequirePermissions("ciro.view")
  getRevenueOverview(@Query() query: RevenueQueryDto, @Req() request: AppRequest) {
    return this.reportsService.getRevenueOverview(query, request.user!);
  }

  @Get("revenue/branches")
  @RequirePermissions("ciro.view")
  getBranchRevenue(@Query() query: BranchRevenueQueryDto, @Req() request: AppRequest) {
    return this.reportsService.getBranchRevenue(query, request.user!);
  }

  @Get("revenue/export")
  @RequirePermissions("ciro.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportRevenueOverview(@Query() query: RevenueQueryDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Content-Disposition", "attachment; filename=revenue-overview.csv");
    return this.reportsService.exportRevenueOverview(query, request.user!);
  }

  @Get("revenue/branches/export")
  @RequirePermissions("ciro.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportBranchRevenue(@Query() query: BranchRevenueQueryDto, @Req() request: AppRequest, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Content-Disposition", "attachment; filename=branch-revenue.csv");
    return this.reportsService.exportBranchRevenue(query, request.user!);
  }

  @Get("catalog")
  @RequirePermissions("reports.view")
  getCatalog(@Req() request: AppRequest) {
    return this.reportsService.getCatalog(request.user!);
  }

  @Get("summary")
  @RequirePermissions("reports.view")
  getSummary(@Query() query: ReportQueryDto, @Req() request: AppRequest) {
    return this.reportsService.getRegisterSummaryReport(query, request.user!);
  }

  @Get("payments")
  @RequirePermissions("reports.view")
  getPayments(@Query() query: ReportQueryDto, @Req() request: AppRequest) {
    return this.reportsService.getRegisterPaymentsReport(query, request.user!);
  }

  @Get("categories")
  @RequirePermissions("reports.view")
  getCategories(@Query() query: ReportQueryDto, @Req() request: AppRequest) {
    return this.reportsService.getCategorySummaryReport(query, request.user!);
  }

  @Get(":report/export")
  @RequirePermissions("reports.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportReport(
    @Param() params: ReportResourceParamDto,
    @Query() query: ReportQueryDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Content-Disposition", `attachment; filename=${params.report}.csv`);
    return this.reportsService.exportReport(params.report, query, request.user!);
  }

  @Get(":report")
  @RequirePermissions("reports.view")
  getReport(@Param() params: ReportResourceParamDto, @Query() query: ReportQueryDto, @Req() request: AppRequest) {
    return this.reportsService.getReport(params.report, query, request.user!);
  }
}
