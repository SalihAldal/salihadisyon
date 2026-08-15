import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { AdminPosConfigQueryDto } from "./dto/admin-pos-config-query.dto";
import { AdminPosListQueryDto } from "./dto/admin-pos-list-query.dto";
import { PosService } from "./pos.service";

@Controller("admin")
@ScopeLevel("tenant")
export class AdminPosController {
  constructor(private readonly posService: PosService) {}

  @Get("pos/config")
  @RequirePermissions("pos_settings.view")
  getPosConfig(@Query() query: AdminPosConfigQueryDto, @Req() request: AppRequest) {
    return this.posService.getPosConfig(this.getActor(request), query.branchId, query.terminalId);
  }

  @Get("payment-methods")
  @RequirePermissions("pos_settings.view")
  getPaymentMethods(@Query() query: AdminPosListQueryDto, @Req() request: AppRequest) {
    return this.posService.listAdminPaymentMethods(this.getActor(request), query);
  }

  @Get("devices")
  @RequirePermissions("integrations.view")
  getDevices(@Query() query: AdminPosListQueryDto, @Req() request: AppRequest) {
    return this.posService.listAdminDevices(this.getActor(request), query);
  }

  private getActor(request: AppRequest) {
    return {
      tenantId: request.scope!.tenantId,
      userId: request.user!.userId,
      branchIds: request.scope!.branchIds,
      terminalId: request.user!.terminalId,
      permissions: request.user!.permissions,
      ipAddress: request.user!.ipAddress,
      userAgent: request.user!.userAgent,
      deviceInfo: request.user!.deviceInfo,
    };
  }
}
