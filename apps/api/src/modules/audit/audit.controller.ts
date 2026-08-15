import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { AuditService } from "./audit.service";

@Controller("audit")
@ScopeLevel("tenant")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("logs")
  @RequirePermissions("reports.view")
  list(
    @Query("branchId") branchId: string | undefined,
    @Query("module") module: string | undefined,
    @Query("search") search: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() request: AppRequest,
  ) {
    return this.auditService.list(request.user!, {
      branchId,
      module,
      search,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
