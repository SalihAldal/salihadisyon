import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { AccountingService } from "./accounting.service";
import { CreateAccountingResourceDto } from "./dto/create-accounting-resource.dto";
import { AccountingResourceParamDto } from "./dto/accounting-resource-param.dto";
import { ListAccountingResourceDto } from "./dto/list-accounting-resource.dto";
import { UpdateAccountingResourceDto } from "./dto/update-accounting-resource.dto";

@Controller("accounting")
@ScopeLevel("tenant")
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get("overview")
  @RequirePermissions("accounting.view")
  getOverview(@Query("branchId") branchId: string | undefined, @Req() request: AppRequest) {
    return this.accountingService.getOverview(request.user!, branchId);
  }

  @Get(":resource/meta")
  @RequirePermissions("accounting.view")
  getMeta(@Param() params: AccountingResourceParamDto, @Req() request: AppRequest) {
    return this.accountingService.getMeta(params.resource, request.user!);
  }

  @Get(":resource/export")
  @RequirePermissions("accounting.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async exportResource(@Param() params: AccountingResourceParamDto, @Query() query: ListAccountingResourceDto, @Req() request: AppRequest) {
    return this.accountingService.exportResource(params.resource, query, request.user!);
  }

  @Get(":resource")
  @RequirePermissions("accounting.view")
  list(@Param() params: AccountingResourceParamDto, @Query() query: ListAccountingResourceDto, @Req() request: AppRequest) {
    return this.accountingService.list(params.resource, query, request.user!);
  }

  @Get(":resource/:id")
  @RequirePermissions("accounting.view")
  detail(@Param() params: AccountingResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.accountingService.detail(params.resource, params.id, request.user!);
  }

  @Post(":resource")
  @RequirePermissions("accounting.manage")
  create(@Param() params: AccountingResourceParamDto, @Body() body: CreateAccountingResourceDto, @Req() request: AppRequest) {
    return this.accountingService.create(params.resource, body, request.user!);
  }

  @Patch(":resource/:id")
  @RequirePermissions("accounting.manage")
  update(@Param() params: AccountingResourceParamDto & { id: string }, @Body() body: UpdateAccountingResourceDto, @Req() request: AppRequest) {
    return this.accountingService.update(params.resource, params.id, body, request.user!);
  }

  @Delete(":resource/:id")
  @RequirePermissions("accounting.manage")
  remove(@Param() params: AccountingResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.accountingService.remove(params.resource, params.id, request.user!);
  }
}
