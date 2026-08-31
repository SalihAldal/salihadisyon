import { Module } from "@nestjs/common";
import { InventoryConsumptionService } from "./inventory-consumption.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [RealtimeModule],
  controllers: [InventoryController],
  providers: [InventoryConsumptionService, InventoryService],
  exports: [InventoryConsumptionService, InventoryService],
})
export class InventoryModule {}
