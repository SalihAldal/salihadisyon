import { Module } from "@nestjs/common";
import { PosSettingsController } from "./pos-settings.controller";
import { PosSettingsService } from "./pos-settings.service";

@Module({
  controllers: [PosSettingsController],
  providers: [PosSettingsService],
  exports: [PosSettingsService],
})
export class PosSettingsModule {}
