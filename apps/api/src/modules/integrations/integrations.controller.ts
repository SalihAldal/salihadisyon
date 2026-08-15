import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import { RequireSubscription } from "../../common/decorators/subscription.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@ScopeLevel("tenant")
@RequireSubscription({ feature: "integrations" })
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get("overview")
  @RequirePermissions("integrations.view")
  getOverview(@Req() request: AppRequest) {
    return this.integrationsService.getOverview(request.user!);
  }

  @Get("providers")
  @RequirePermissions("integrations.view")
  listProviders(@Req() request: AppRequest) {
    return this.integrationsService.listProviders(request.user!);
  }

  @Get("credentials")
  @RequirePermissions("integrations.view")
  listCredentials(@Req() request: AppRequest) {
    return this.integrationsService.listCredentials(request.user!);
  }

  @Get("pos-links/meta")
  @RequirePermissions("integrations.view")
  getPosLinkMeta(@Req() request: AppRequest) {
    return this.integrationsService.getPosLinkMeta(request.user!);
  }

  @Get("pos-links")
  @RequirePermissions("integrations.view")
  listPosLinks(@Req() request: AppRequest) {
    return this.integrationsService.listPosLinks(request.user!);
  }

  @Post("credentials")
  @RequirePermissions("integrations.manage")
  @RequireSubscription({ feature: "integrations", usageMetric: "integration_credentials" })
  createCredential(@Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.integrationsService.createCredential(body.data, request.user!);
  }

  @Post("pos-links")
  @RequirePermissions("integrations.manage")
  @RequireSubscription({ feature: "integrations", usageMetric: "integration_credentials" })
  createPosLink(@Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.integrationsService.createPosLink(body.data, request.user!);
  }

  @Patch("credentials/:id")
  @RequirePermissions("integrations.manage")
  createUpdate(@Param("id") id: string, @Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.integrationsService.updateCredential(id, body.data, request.user!);
  }

  @Patch("pos-links/:id")
  @RequirePermissions("integrations.manage")
  updatePosLink(@Param("id") id: string, @Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.integrationsService.updatePosLink(id, body.data, request.user!);
  }

  @Delete("credentials/:id")
  @RequirePermissions("integrations.manage")
  deleteCredential(@Param("id") id: string, @Req() request: AppRequest) {
    return this.integrationsService.deleteCredential(id, request.user!);
  }

  @Delete("pos-links/:id")
  @RequirePermissions("integrations.manage")
  deletePosLink(@Param("id") id: string, @Req() request: AppRequest) {
    return this.integrationsService.deletePosLink(id, request.user!);
  }
}
