import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { CustomersService } from "./customers.service";

@Controller("customers")
@ScopeLevel("branch")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions("customer.view")
  list(
    @Query("branchId") branchId: string | undefined,
    @Query("search") search: string | undefined,
    @Req() request: AppRequest,
  ) {
    return this.customersService.list(request.user!, { branchId, search });
  }
}
