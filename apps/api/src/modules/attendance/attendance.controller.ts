import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { RequirePermissions, ScopeLevel } from "../../common/decorators/permissions.decorator";
import type { AppRequest } from "../../common/types/request-context";
import { ApproveAttendanceDto } from "./dto/approve-attendance.dto";
import { AttendanceOverviewDto } from "./dto/attendance-overview.dto";
import { CreateQrTokenDto } from "./dto/create-qr-token.dto";
import { ScanQrDto } from "./dto/scan-qr.dto";
import { AttendanceService } from "./attendance.service";

@Controller("attendance")
@ScopeLevel("branch")
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get("overview")
  @RequirePermissions("attendance.view")
  getOverview(@Query() query: AttendanceOverviewDto, @Req() request: AppRequest) {
    return this.attendanceService.getOverview(query, request.user!);
  }

  @Post("qr/tokens")
  @RequirePermissions("attendance.manage")
  createQrToken(@Body() body: CreateQrTokenDto, @Req() request: AppRequest) {
    return this.attendanceService.createQrToken(body, request.user!);
  }

  @Post("employees/:employeeProfileId/qr")
  @RequirePermissions("attendance.manage")
  issueEmployeeQr(@Param("employeeProfileId") employeeProfileId: string, @Req() request: AppRequest) {
    return this.attendanceService.issueEmployeeQr(employeeProfileId, request.user!);
  }

  @Post("qr/scan")
  @Public()
  scanQr(@Body() body: ScanQrDto) {
    return this.attendanceService.scan(body);
  }

  @Post("shifts/:id/approve")
  @RequirePermissions("attendance.approve")
  approveShift(@Param("id") id: string, @Body() body: ApproveAttendanceDto, @Req() request: AppRequest) {
    return this.attendanceService.approveShift(id, body, request.user!);
  }

  @Post("breaks/:id/approve")
  @RequirePermissions("attendance.approve")
  approveBreak(@Param("id") id: string, @Body() body: ApproveAttendanceDto, @Req() request: AppRequest) {
    return this.attendanceService.approveBreak(id, body, request.user!);
  }

  @Post("events/:id/approve")
  @RequirePermissions("attendance.approve")
  approveEvent(@Param("id") id: string, @Body() body: ApproveAttendanceDto, @Req() request: AppRequest) {
    return this.attendanceService.approveEvent(id, body, request.user!);
  }
}
