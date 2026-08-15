import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { AssignPosDeviceDto } from "./dto/assign-pos-device.dto";
import { CancelPosTransactionDto } from "./dto/cancel-pos-transaction.dto";
import { CreatePosDeviceDto } from "./dto/create-pos-device.dto";
import { ListPosDeviceDto } from "./dto/list-pos-device.dto";
import { StartPosTransactionDto } from "./dto/start-pos-transaction.dto";
import { UpdatePosDeviceDto } from "./dto/update-pos-device.dto";
import { PosIntegrationsService } from "./pos-integrations.service";

@Controller("pos-integrations")
@ScopeLevel("branch")
export class PosIntegrationsController {
  constructor(private readonly service: PosIntegrationsService) {}

  @Get("meta")
  @RequirePermissions("integrations.view")
  getMeta(@Req() request: AppRequest) {
    return this.service.getMeta(request.user!);
  }

  @Get("devices")
  @RequirePermissions("integrations.view")
  listDevices(@Query() query: ListPosDeviceDto, @Req() request: AppRequest) {
    return this.service.listDevices(query, request.user!);
  }

  @Post("devices")
  @RequirePermissions("integrations.manage")
  createDevice(@Body() body: CreatePosDeviceDto, @Req() request: AppRequest) {
    return this.service.createDevice(body, request.user!);
  }

  @Get("devices/:id")
  @RequirePermissions("integrations.view")
  detail(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.getDeviceDetail(id, request.user!);
  }

  @Patch("devices/:id")
  @RequirePermissions("integrations.manage")
  updateDevice(@Param("id") id: string, @Body() body: UpdatePosDeviceDto, @Req() request: AppRequest) {
    return this.service.updateDevice(id, body, request.user!);
  }

  @Post("devices/:id/activate")
  @RequirePermissions("integrations.manage")
  activate(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.activateDevice(id, request.user!);
  }

  @Post("devices/:id/deactivate")
  @RequirePermissions("integrations.manage")
  deactivate(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.deactivateDevice(id, request.user!);
  }

  @Delete("devices/:id")
  @RequirePermissions("integrations.manage")
  remove(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.softDeleteDevice(id, request.user!);
  }

  @Post("devices/:id/test")
  @RequirePermissions("integrations.manage")
  test(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.testConnection(id, request.user!);
  }

  @Post("devices/:id/sync")
  @RequirePermissions("integrations.manage")
  sync(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.syncDeviceStatus(id, request.user!);
  }

  @Get("devices/:id/logs")
  @RequirePermissions("integrations.view")
  logs(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.listDeviceLogs(id, request.user!);
  }

  @Get("devices/:id/transactions")
  @RequirePermissions("integrations.view")
  transactions(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.listDeviceTransactions(id, request.user!);
  }

  @Post("assignments")
  @RequirePermissions("integrations.manage")
  assign(@Body() body: AssignPosDeviceDto, @Req() request: AppRequest) {
    return this.service.assignDevice(body, request.user!);
  }

  @Patch("assignments/:id/activate")
  @RequirePermissions("integrations.manage")
  activateAssignment(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.setAssignmentActive(id, true, request.user!);
  }

  @Patch("assignments/:id/deactivate")
  @RequirePermissions("integrations.manage")
  deactivateAssignment(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.setAssignmentActive(id, false, request.user!);
  }

  @Delete("assignments/:id")
  @RequirePermissions("integrations.manage")
  deleteAssignment(@Param("id") id: string, @Req() request: AppRequest) {
    return this.service.removeAssignment(id, request.user!);
  }

  @Get("terminal/:terminalId/default-device")
  @RequirePermissions("integrations.view")
  defaultDevice(@Param("terminalId") terminalId: string, @Req() request: AppRequest) {
    return this.service.getDefaultDeviceForTerminal(terminalId, request.user!);
  }

  @Post("transactions/sale")
  @RequirePermissions("payment.manage")
  startSale(@Body() body: StartPosTransactionDto, @Req() request: AppRequest) {
    return this.service.startSale(body, request.user!);
  }

  @Post("transactions/refund")
  @RequirePermissions("payment.manage")
  startRefund(@Body() body: StartPosTransactionDto, @Req() request: AppRequest) {
    return this.service.startRefund(body, request.user!);
  }

  @Post("transactions/:id/cancel")
  @RequirePermissions("payment.manage")
  cancel(@Param("id") id: string, @Body() _body: CancelPosTransactionDto, @Req() request: AppRequest) {
    return this.service.cancelTransaction(id, request.user!);
  }
}
