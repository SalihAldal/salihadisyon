import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { CreateInventoryResourceDto } from "./dto/create-inventory-resource.dto";
import { InventoryResourceParamDto } from "./dto/inventory-resource-param.dto";
import { ListInventoryResourceDto } from "./dto/list-inventory-resource.dto";
import { UpdateInventoryResourceDto } from "./dto/update-inventory-resource.dto";
import { InventoryService } from "./inventory.service";

@Controller("inventory")
@ScopeLevel("tenant")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("overview")
  @RequirePermissions("inventory.view")
  getOverview(
    @Query("branchId") branchId: string | undefined,
    @Query("warehouseId") warehouseId: string | undefined,
    @Req() request: AppRequest,
  ) {
    return this.inventoryService.getOverview(request.user!, branchId, warehouseId);
  }

  @Post("sync-sales")
  @RequirePermissions("inventory.manage")
  syncSales(@Body() body: { branchId?: string }, @Req() request: AppRequest) {
    return this.inventoryService.syncSalesConsumption(request.user!, body.branchId);
  }

  @Get(":resource/meta")
  @RequirePermissions("inventory.view")
  getMeta(@Param() params: InventoryResourceParamDto, @Req() request: AppRequest) {
    return this.inventoryService.getMeta(params.resource, request.user!);
  }

  @Get(":resource/export")
  @RequirePermissions("inventory.export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  exportResource(@Param() params: InventoryResourceParamDto, @Query() query: ListInventoryResourceDto, @Req() request: AppRequest) {
    return this.inventoryService.exportResource(params.resource, query, request.user!);
  }

  @Get(":resource")
  @RequirePermissions("inventory.view")
  list(@Param() params: InventoryResourceParamDto, @Query() query: ListInventoryResourceDto, @Req() request: AppRequest) {
    return this.inventoryService.list(params.resource, query, request.user!);
  }

  @Get(":resource/:id")
  @RequirePermissions("inventory.view")
  detail(@Param() params: InventoryResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.inventoryService.detail(params.resource, params.id, request.user!);
  }

  @Post(":resource")
  @RequirePermissions("inventory.manage")
  create(@Param() params: InventoryResourceParamDto, @Body() body: CreateInventoryResourceDto, @Req() request: AppRequest) {
    return this.inventoryService.create(params.resource, body, request.user!);
  }

  @Patch(":resource/:id")
  @RequirePermissions("inventory.manage")
  update(@Param() params: InventoryResourceParamDto & { id: string }, @Body() body: UpdateInventoryResourceDto, @Req() request: AppRequest) {
    return this.inventoryService.update(params.resource, params.id, body, request.user!);
  }

  @Delete(":resource/:id")
  @RequirePermissions("inventory.manage")
  remove(@Param() params: InventoryResourceParamDto & { id: string }, @Req() request: AppRequest) {
    return this.inventoryService.remove(params.resource, params.id, request.user!);
  }
}
