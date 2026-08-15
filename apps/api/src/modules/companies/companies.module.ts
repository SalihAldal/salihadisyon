import { Module } from "@nestjs/common";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { PrismaService } from "../../common/database/prisma.service";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  controllers: [CompaniesController],
  providers: [PrismaService, AuditLogService, CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
