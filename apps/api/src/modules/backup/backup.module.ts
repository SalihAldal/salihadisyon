import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BackupController],
  providers: [PrismaService, AuditLogService, BackupService],
  exports: [BackupService],
})
export class BackupModule {}
