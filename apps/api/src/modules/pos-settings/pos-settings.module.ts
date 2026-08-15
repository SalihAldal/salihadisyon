import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { PosSettingsController } from "./pos-settings.controller";
import { PosSettingsService } from "./pos-settings.service";

@Module({
  controllers: [PosSettingsController],
  providers: [PrismaService, AuditLogService, PosSettingsService],
  exports: [PosSettingsService],
})
export class PosSettingsModule {}
