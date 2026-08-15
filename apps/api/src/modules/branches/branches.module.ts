import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { BranchesController } from "./branches.controller";
import { BranchesService } from "./branches.service";

@Module({
  controllers: [BranchesController],
  providers: [PrismaService, AuditLogService, BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
