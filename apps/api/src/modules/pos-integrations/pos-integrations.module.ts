import { Module } from "@nestjs/common";
import { PosIntegrationsController } from "./pos-integrations.controller";
import { PosIntegrationsService } from "./pos-integrations.service";

@Module({
  controllers: [PosIntegrationsController],
  providers: [PosIntegrationsService],
  exports: [PosIntegrationsService],
})
export class PosIntegrationsModule {}
