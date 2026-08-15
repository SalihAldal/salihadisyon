import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { CreateEmployeePaymentDto } from "./dto/create-employee-payment.dto";
import { CreateEmployeeShiftDto } from "./dto/create-employee-shift.dto";
import { DeleteEmployeePaymentDto } from "./dto/delete-employee-payment.dto";
import { EmployeeIdParamDto } from "./dto/employee-id-param.dto";
import { EmployeeListQueryDto } from "./dto/employee-list-query.dto";
import { EmployeeNoteDto } from "./dto/employee-note.dto";
import { UpdateEmployeePaymentDto } from "./dto/update-employee-payment.dto";
import { UpdateEmployeeAccountSettingsDto } from "./dto/update-employee-account-settings.dto";
import { UpdateEmployeeOtherInfoDto } from "./dto/update-employee-other-info.dto";
import { UpdateEmployeePersonalInfoDto } from "./dto/update-employee-personal-info.dto";
import { EmployeesService } from "./employees.service";

@Controller("employees")
@ScopeLevel("tenant")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get(":id/detail")
  @RequirePermissions("staff.view")
  detail(@Param() params: EmployeeIdParamDto, @Req() request: AppRequest) {
    return this.employeesService.getDetail(params.id, request.user!);
  }

  @Put(":id/account-settings")
  @RequirePermissions("staff.manage")
  updateAccountSettings(@Param() params: EmployeeIdParamDto, @Body() body: UpdateEmployeeAccountSettingsDto, @Req() request: AppRequest) {
    return this.employeesService.updateAccountSettings(params.id, body, request.user!);
  }

  @Put(":id/personal-info")
  @RequirePermissions("staff.manage")
  updatePersonalInfo(@Param() params: EmployeeIdParamDto, @Body() body: UpdateEmployeePersonalInfoDto, @Req() request: AppRequest) {
    return this.employeesService.updatePersonalInfo(params.id, body, request.user!);
  }

  @Put(":id/other-info")
  @RequirePermissions("staff.manage")
  updateOtherInfo(@Param() params: EmployeeIdParamDto, @Body() body: UpdateEmployeeOtherInfoDto, @Req() request: AppRequest) {
    return this.employeesService.updateOtherInfo(params.id, body, request.user!);
  }

  @Get(":id/payments")
  @RequirePermissions("staff.view")
  payments(@Param() params: EmployeeIdParamDto, @Query() query: EmployeeListQueryDto, @Req() request: AppRequest) {
    return this.employeesService.getPayments(params.id, query, request.user!);
  }

  @Post(":id/payments")
  @RequirePermissions("accounting.manage")
  createPayment(@Param() params: EmployeeIdParamDto, @Body() body: CreateEmployeePaymentDto, @Req() request: AppRequest) {
    return this.employeesService.createPayment(params.id, body, request.user!);
  }

  @Patch(":id/payments/:paymentId")
  @RequirePermissions("accounting.manage")
  updatePayment(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() body: UpdateEmployeePaymentDto,
    @Req() request: AppRequest,
  ) {
    return this.employeesService.updatePayment(id, paymentId, body, request.user!);
  }

  @Delete(":id/payments/:paymentId")
  @RequirePermissions("accounting.manage")
  deletePayment(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() body: DeleteEmployeePaymentDto,
    @Req() request: AppRequest,
  ) {
    return this.employeesService.deletePayment(id, paymentId, body, request.user!);
  }

  @Get(":id/account-movements")
  @RequirePermissions("staff.view")
  accountMovements(@Param() params: EmployeeIdParamDto, @Query() query: EmployeeListQueryDto, @Req() request: AppRequest) {
    return this.employeesService.getAccountMovements(params.id, query, request.user!);
  }

  @Get(":id/shifts")
  @RequirePermissions("staff.view")
  shifts(@Param() params: EmployeeIdParamDto, @Query() query: EmployeeListQueryDto, @Req() request: AppRequest) {
    return this.employeesService.getShifts(params.id, query, request.user!);
  }

  @Get(":id/shifts/export")
  @RequirePermissions("staff.view")
  exportShifts(@Param() params: EmployeeIdParamDto, @Query() query: EmployeeListQueryDto, @Req() request: AppRequest) {
    return this.employeesService.exportShifts(params.id, query, request.user!);
  }

  @Post(":id/shifts")
  @RequirePermissions("attendance.manage")
  createShift(@Param() params: EmployeeIdParamDto, @Body() body: CreateEmployeeShiftDto, @Req() request: AppRequest) {
    return this.employeesService.createShift(params.id, body, request.user!);
  }

  @Patch(":id/passive")
  @RequirePermissions("staff.manage")
  passive(@Param() params: EmployeeIdParamDto, @Body() body: EmployeeNoteDto, @Req() request: AppRequest) {
    return this.employeesService.passiveEmployee(params.id, body, request.user!);
  }

  @Patch(":id/assign-owner")
  @RequirePermissions("staff.manage")
  assignOwner(@Param() params: EmployeeIdParamDto, @Body() body: EmployeeNoteDto, @Req() request: AppRequest) {
    return this.employeesService.assignOwner(params.id, body, request.user!);
  }
}
