import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { SaveCategoryPrintRoutingDto, SaveProductPrintRoutingDto } from "./dto/print-routing.dto";
import { PrintIntegrationsService } from "./print-integrations.service";

@Controller("admin/print-integrations")
@ScopeLevel("tenant")
export class PrintIntegrationsController {
  constructor(private readonly printIntegrationsService: PrintIntegrationsService) {}

  @Get()
  @RequirePermissions("device.view")
  list(@Query("branchId") branchId: string, @Req() request: AppRequest) {
    const resolvedBranchId = branchId ?? request.scope!.branchIds[0];
    return this.printIntegrationsService.listIntegrations(this.getActor(request), resolvedBranchId);
  }

  @Post("bootstrap")
  @RequirePermissions("device.manage")
  bootstrap(@Query("branchId") branchId: string, @Req() request: AppRequest) {
    const resolvedBranchId = branchId ?? request.scope!.branchIds[0];
    return this.printIntegrationsService.ensureDefaultDestinations(this.getActor(request), resolvedBranchId);
  }

  @Put("categories/:categoryId/routing")
  @RequirePermissions("device.manage")
  saveCategoryRouting(
    @Param("categoryId") categoryId: string,
    @Body() body: SaveCategoryPrintRoutingDto,
    @Req() request: AppRequest,
  ) {
    return this.printIntegrationsService.saveCategoryRouting(this.getActor(request), categoryId, body.destinationIds);
  }

  @Put("products/:productId/routing")
  @RequirePermissions("device.manage")
  saveProductRouting(
    @Param("productId") productId: string,
    @Body() body: SaveProductPrintRoutingDto,
    @Req() request: AppRequest,
  ) {
    return this.printIntegrationsService.saveProductRouting(
      this.getActor(request),
      productId,
      body.useCategoryRouting,
      body.destinationIds ?? [],
    );
  }

  private getActor(request: AppRequest) {
    return {
      tenantId: request.scope!.tenantId,
      userId: request.user!.userId,
      branchIds: request.scope!.branchIds,
    };
  }
}
