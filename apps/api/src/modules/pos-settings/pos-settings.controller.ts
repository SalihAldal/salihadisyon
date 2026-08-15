import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { CreatePosSettingItemDto } from "./dto/create-pos-setting-item.dto";
import { ListPosSettingsDto } from "./dto/list-pos-settings.dto";
import { ResourceParamDto } from "./dto/resource-param.dto";
import { UpdatePosSettingItemDto } from "./dto/update-pos-setting-item.dto";
import { PosSettingsService } from "./pos-settings.service";

@Controller("pos-settings")
@ScopeLevel("tenant")
export class PosSettingsController {
  constructor(private readonly posSettingsService: PosSettingsService) {}

  @Get(":resource/meta")
  @RequirePermissions("pos_settings.view")
  getMeta(@Param() params: ResourceParamDto, @Req() request: AppRequest) {
    return this.posSettingsService.getMeta(params.resource, request.user!);
  }

  @Get(":resource")
  @RequirePermissions("pos_settings.view")
  list(@Param() params: ResourceParamDto, @Query() query: ListPosSettingsDto, @Req() request: AppRequest) {
    return this.posSettingsService.list(params.resource, query, request.user!);
  }

  @Get(":resource/:id")
  @RequirePermissions("pos_settings.view")
  detail(@Param() params: ResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.posSettingsService.detail(params.resource, params.id, request.user!);
  }

  @Post(":resource")
  @RequirePermissions("pos_settings.manage")
  create(@Param() params: ResourceParamDto, @Body() body: CreatePosSettingItemDto, @Req() request: AppRequest) {
    return this.posSettingsService.create(params.resource, body, request.user!);
  }

  @Patch(":resource/:id")
  @RequirePermissions("pos_settings.manage")
  update(@Param() params: ResourceParamDto & { id: string }, @Body() body: UpdatePosSettingItemDto, @Req() request: AppRequest) {
    return this.posSettingsService.update(params.resource, params.id, body, request.user!);
  }

  @Delete(":resource/:id")
  @RequirePermissions("pos_settings.manage")
  remove(@Param() params: ResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.posSettingsService.remove(params.resource, params.id, request.user!);
  }
}
