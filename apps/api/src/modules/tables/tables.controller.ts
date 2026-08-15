import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { TablesService } from "./tables.service";

@Controller("tables")
@ScopeLevel("branch")
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get("layout")
  @RequirePermissions("table.view")
  layout(@Query("branchId") branchId: string | undefined, @Req() request: AppRequest) {
    return this.tablesService.layout(request.user!, branchId);
  }
}
