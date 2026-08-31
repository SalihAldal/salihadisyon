import { Module } from "@nestjs/common";
import { PaymentRateLimitGuard } from "../../common/guards/payment-rate-limit.guard";
import { SecurityRateLimitService } from "../../common/security/security-rate-limit.service";
import { AdminPosController } from "./admin-pos.controller";
import { PrintIntegrationsController } from "./print-integrations.controller";
import { PosController } from "./pos.controller";
import { InventoryModule } from "../inventory/inventory.module";
import { PosAdminService } from "./pos-admin.service";
import { PosRegisterService } from "./pos-register.service";
import { PosReportsService } from "./pos-reports.service";
import { PosService } from "./pos.service";
import { PrintIntegrationsService } from "./print-integrations.service";
import { PrintRoutingService } from "./print-routing.service";
import { PosIntegrationsModule } from "../pos-integrations/pos-integrations.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [PosIntegrationsModule, InventoryModule, RealtimeModule],
  controllers: [PosController, AdminPosController, PrintIntegrationsController],
  providers: [
    PosAdminService,
    PosRegisterService,
    PosReportsService,
    PosService,
    PrintRoutingService,
    PrintIntegrationsService,
    SecurityRateLimitService,
    PaymentRateLimitGuard,
  ],
  exports: [PosService, PosRegisterService, PosAdminService, PosReportsService, PrintRoutingService, PrintIntegrationsService, RealtimeModule],
})
export class PosModule {}
