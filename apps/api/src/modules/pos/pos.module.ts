import { Module } from "@nestjs/common";
import { PaymentRateLimitGuard } from "../../common/guards/payment-rate-limit.guard";
import { SecurityRateLimitService } from "../../common/security/security-rate-limit.service";
import { AdminPosController } from "./admin-pos.controller";
import { PosController } from "./pos.controller";
import { PrismaService } from "../../common/database/prisma.service";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { InventoryModule } from "../inventory/inventory.module";
import { PosAdminService } from "./pos-admin.service";
import { PosRegisterService } from "./pos-register.service";
import { PosReportsService } from "./pos-reports.service";
import { PosService } from "./pos.service";
import { PosIntegrationsModule } from "../pos-integrations/pos-integrations.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [PosIntegrationsModule, InventoryModule, RealtimeModule],
  controllers: [PosController, AdminPosController],
  providers: [
    PrismaService,
    AuditLogService,
    PosAdminService,
    PosRegisterService,
    PosReportsService,
    PosService,
    SecurityRateLimitService,
    PaymentRateLimitGuard,
  ],
  exports: [PosService, PosRegisterService, PosAdminService, PosReportsService, RealtimeModule],
})
export class PosModule {}
