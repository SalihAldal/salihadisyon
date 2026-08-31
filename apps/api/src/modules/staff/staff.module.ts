import { Module } from "@nestjs/common";
import { AccountingService } from "../accounting/accounting.service";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { GoalProgressService } from "./goal-progress.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  controllers: [StaffController, EmployeesController],
  providers: [GoalProgressService, AccountingService, StaffService, EmployeesService],
  exports: [StaffService, GoalProgressService, EmployeesService],
})
export class StaffModule {}
