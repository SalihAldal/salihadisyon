import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Controller("companies")
@ScopeLevel("tenant")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermissions("subscription.manage")
  list(@Req() request: AppRequest) {
    return this.companiesService.list(request.user!);
  }

  @Get(":id")
  @RequirePermissions("subscription.manage")
  detail(@Param("id") id: string, @Req() request: AppRequest) {
    return this.companiesService.detail(id, request.user!);
  }

  @Post()
  @RequirePermissions("subscription.manage")
  create(@Body() body: CreateCompanyDto, @Req() request: AppRequest) {
    return this.companiesService.create(body, request.user!);
  }

  @Patch(":id")
  @RequirePermissions("subscription.manage")
  update(@Param("id") id: string, @Body() body: UpdateCompanyDto, @Req() request: AppRequest) {
    return this.companiesService.update(id, body, request.user!);
  }
}
