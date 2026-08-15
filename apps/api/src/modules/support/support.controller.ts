import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import { RequireSubscription } from "../../common/decorators/subscription.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { SupportService } from "./support.service";

@Controller("support")
@ScopeLevel("tenant")
@RequireSubscription({ feature: "support" })
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get("meta")
  @RequirePermissions("support.view")
  getMeta(@Req() request: AppRequest) {
    return this.supportService.getMeta(request.user!);
  }

  @Get("tickets")
  @RequirePermissions("support.view")
  listTickets(@Req() request: AppRequest) {
    return this.supportService.listTickets(request.user!);
  }

  @Post("tickets")
  @RequirePermissions("support.view")
  @RequireSubscription({ feature: "support", usageMetric: "support_tickets" })
  createTicket(@Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.supportService.upsertTicket(null, body.data, request.user!);
  }

  @Patch("tickets/:id")
  @RequirePermissions("support.manage")
  updateTicket(@Param("id") id: string, @Body() body: { data: Record<string, unknown> }, @Req() request: AppRequest) {
    return this.supportService.upsertTicket(id, body.data, request.user!);
  }

  @Delete("tickets/:id")
  @RequirePermissions("support.manage")
  deleteTicket(@Param("id") id: string, @Req() request: AppRequest) {
    return this.supportService.deleteTicket(id, request.user!);
  }
}
