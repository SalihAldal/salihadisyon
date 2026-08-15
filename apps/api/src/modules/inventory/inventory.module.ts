import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { InventoryConsumptionService } from "./inventory-consumption.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [RealtimeModule],
  controllers: [InventoryController],
  providers: [PrismaService, AuditLogService, InventoryConsumptionService, InventoryService],
  exports: [InventoryConsumptionService, InventoryService],
})
export class InventoryModule {}
