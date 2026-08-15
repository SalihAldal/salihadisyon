import { Module } from "@nestjs/common";
import { StaffModule } from "../staff/staff.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [StaffModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
