import { Module } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { StaffModule } from "../staff/staff.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [StaffModule],
  controllers: [ReportsController],
  providers: [PrismaService, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
