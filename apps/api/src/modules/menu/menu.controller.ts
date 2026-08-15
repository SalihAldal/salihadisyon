import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { MenuService } from "./menu.service";

@Controller("menu")
@ScopeLevel("branch")
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get("categories")
  @RequirePermissions("menu.view")
  listCategories(@Query("branchId") branchId: string | undefined, @Req() request: AppRequest) {
    return this.menuService.listCategories(request.user!, branchId);
  }

  @Get("products")
  @RequirePermissions("menu.view")
  listProducts(
    @Query("branchId") branchId: string | undefined,
    @Query("categoryId") categoryId: string | undefined,
    @Query("search") search: string | undefined,
    @Query("isVisible") isVisible: string | undefined,
    @Query("isActive") isActive: string | undefined,
    @Req() request: AppRequest,
  ) {
    return this.menuService.listProducts(
      request.user!,
      {
        branchId,
        categoryId,
        search,
        isVisible,
        isActive,
      },
    );
  }

  @Post("products")
  @RequirePermissions("menu.manage")
  createProduct(@Body() body: Record<string, unknown>, @Req() request: AppRequest) {
    return this.menuService.createProduct(request.user!, body);
  }
}
