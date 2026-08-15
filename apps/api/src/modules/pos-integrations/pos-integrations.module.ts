import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { PosIntegrationsController } from "./pos-integrations.controller";
import { PosIntegrationsService } from "./pos-integrations.service";

@Module({
  controllers: [PosIntegrationsController],
  providers: [PrismaService, AuditLogService, PosIntegrationsService],
  exports: [PosIntegrationsService],
})
export class PosIntegrationsModule {}
