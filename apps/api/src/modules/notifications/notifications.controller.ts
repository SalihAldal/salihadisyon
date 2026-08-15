import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { RegisterPushTokenDto } from "./dto/register-push-token.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@ScopeLevel("user")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Query() query: { branchId?: string; unreadOnly?: string; limit?: string }, @Req() request: AppRequest) {
    return this.notificationsService.list(request.user!, query);
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @Req() request: AppRequest) {
    return this.notificationsService.markRead(id, request.user!);
  }

  @Post("read-all")
  markAllRead(@Body() body: { branchId?: string }, @Req() request: AppRequest) {
    return this.notificationsService.markAllRead(request.user!, body.branchId);
  }

  @Post("push-token")
  registerPushToken(@Body() body: RegisterPushTokenDto, @Req() request: AppRequest) {
    return this.notificationsService.registerPushToken(request.user!, body);
  }
}
