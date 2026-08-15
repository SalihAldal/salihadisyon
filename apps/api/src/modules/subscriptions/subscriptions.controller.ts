import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import { RequireSubscription } from "../../common/decorators/subscription.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { SubscriptionsService } from "./subscriptions.service";

@Controller("subscriptions")
@ScopeLevel("tenant")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("overview")
  @RequirePermissions("subscription.view")
  getOverview(@Req() request: AppRequest) {
    return this.subscriptionsService.getOverview(request.user!);
  }

  @Get("plans")
  @RequirePermissions("subscription.view")
  getPlans(@Req() request: AppRequest) {
    return this.subscriptionsService.getPlans(request.user!);
  }

  @Post("change-plan")
  @RequirePermissions("subscription.manage")
  changePlan(@Body() body: { planCode: string }, @Req() request: AppRequest) {
    return this.subscriptionsService.changePlan(body.planCode, request.user!);
  }

  @Get("platform-meta")
  @RequirePermissions("subscription.view")
  getPlatformMeta(@Req() request: AppRequest) {
    return this.subscriptionsService.getPlatformMeta(request.user!);
  }

  @Get("product-ratings")
  @RequirePermissions("subscription.view")
  @RequireSubscription({ feature: "product_ratings" })
  listProductRatings(@Req() request: AppRequest) {
    return this.subscriptionsService.listProductRatings(request.user!);
  }

  @Post("product-ratings")
  @RequirePermissions("subscription.manage")
  @RequireSubscription({ feature: "product_ratings", usageMetric: "product_ratings" })
  createProductRating(@Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.subscriptionsService.upsertProductRating(null, body.data, request.user!);
  }

  @Patch("product-ratings/:id")
  @RequirePermissions("subscription.manage")
  @RequireSubscription({ feature: "product_ratings" })
  updateProductRating(@Param("id") id: string, @Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.subscriptionsService.upsertProductRating(id, body.data, request.user!);
  }

  @Delete("product-ratings/:id")
  @RequirePermissions("subscription.manage")
  @RequireSubscription({ feature: "product_ratings" })
  deleteProductRating(@Param("id") id: string, @Req() request: AppRequest) {
    return this.subscriptionsService.deleteProductRating(id, request.user!);
  }

  @Get("staff-discounts")
  @RequirePermissions("subscription.view")
  @RequireSubscription({ feature: "staff_discounts" })
  listStaffDiscounts(@Req() request: AppRequest) {
    return this.subscriptionsService.listStaffDiscounts(request.user!);
  }

  @Post("staff-discounts")
  @RequirePermissions("subscription.manage")
  @RequireSubscription({ feature: "staff_discounts", usageMetric: "staff_discounts" })
  createStaffDiscount(@Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.subscriptionsService.upsertStaffDiscount(null, body.data, request.user!);
  }

  @Patch("staff-discounts/:id")
  @RequirePermissions("subscription.manage")
  @RequireSubscription({ feature: "staff_discounts" })
  updateStaffDiscount(@Param("id") id: string, @Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.subscriptionsService.upsertStaffDiscount(id, body.data, request.user!);
  }

  @Delete("staff-discounts/:id")
  @RequirePermissions("subscription.manage")
  @RequireSubscription({ feature: "staff_discounts" })
  deleteStaffDiscount(@Param("id") id: string, @Req() request: AppRequest) {
    return this.subscriptionsService.deleteStaffDiscount(id, request.user!);
  }

  @Get("go-pos-link")
  @RequirePermissions("subscription.view")
  @RequireSubscription({ feature: "pos_web_access" })
  getGoPosLink(@Req() request: AppRequest) {
    return this.subscriptionsService.getGoPosLink(request.user!);
  }
}
