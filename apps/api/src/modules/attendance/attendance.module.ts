import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  controllers: [AttendanceController],
  providers: [PrismaService, AuditLogService, AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
