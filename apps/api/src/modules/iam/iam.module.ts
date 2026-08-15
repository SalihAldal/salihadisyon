import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { IamController } from "./iam.controller";
import { IamService } from "./iam.service";

@Module({
  controllers: [IamController],
  providers: [PrismaService, IamService],
  exports: [IamService],
})
export class IamModule {}
