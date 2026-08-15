import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "../../common/database/prisma.service";
import { PosGateway } from "../pos/pos.gateway";

@Module({
  imports: [JwtModule.register({})],
  providers: [PosGateway, PrismaService],
  exports: [PosGateway],
})
export class RealtimeModule {}
