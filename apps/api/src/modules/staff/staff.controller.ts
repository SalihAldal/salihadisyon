import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { CreateStaffResourceDto } from "./dto/create-staff-resource.dto";
import { ListStaffResourceDto } from "./dto/list-staff-resource.dto";
import { StaffResourceParamDto } from "./dto/staff-resource-param.dto";
import { UpdateStaffResourceDto } from "./dto/update-staff-resource.dto";
import { StaffService } from "./staff.service";

@Controller("staff")
@ScopeLevel("tenant")
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get(":resource/meta")
  getMeta(@Param() params: StaffResourceParamDto, @Req() request: AppRequest) {
    return this.staffService.getMeta(params.resource, request.user!);
  }

  @Get(":resource")
  list(@Param() params: StaffResourceParamDto, @Query() query: ListStaffResourceDto, @Req() request: AppRequest) {
    return this.staffService.list(params.resource, query, request.user!);
  }

  @Get(":resource/:id")
  detail(@Param() params: StaffResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.staffService.detail(params.resource, params.id, request.user!);
  }

  @Post(":resource")
  create(@Param() params: StaffResourceParamDto, @Body() body: CreateStaffResourceDto, @Req() request: AppRequest) {
    return this.staffService.create(params.resource, body, request.user!);
  }

  @Patch(":resource/:id")
  update(@Param() params: StaffResourceParamDto & { id: string }, @Body() body: UpdateStaffResourceDto, @Req() request: AppRequest) {
    return this.staffService.update(params.resource, params.id, body, request.user!);
  }

  @Delete(":resource/:id")
  remove(@Param() params: StaffResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.staffService.remove(params.resource, params.id, request.user!);
  }
}
