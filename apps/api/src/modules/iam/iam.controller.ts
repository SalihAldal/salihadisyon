import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { IamService } from "./iam.service";

@Controller("iam")
@ScopeLevel("tenant")
export class IamController {
  constructor(private readonly iamService: IamService) {}

  @Get("users")
  @RequirePermissions("staff.view")
  listUsers(@Query("companyId") companyId: string | undefined, @Req() request: AppRequest) {
    return this.iamService.listUsers(companyId, request.user!);
  }

  @Get("roles")
  @RequirePermissions("staff.manage")
  listRoles(@Query("companyId") companyId: string | undefined, @Req() request: AppRequest) {
    return this.iamService.listRoles(companyId, request.user!);
  }

  @Get("permissions")
  @RequirePermissions("staff.manage")
  listPermissions() {
    return this.iamService.listPermissions();
  }
}
