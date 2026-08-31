import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PosGateway } from "../pos/pos.gateway";

@Module({
  imports: [JwtModule.register({})],
  providers: [PosGateway],
  exports: [PosGateway],
})
export class RealtimeModule {}
