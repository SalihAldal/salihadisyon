import { IsEnum, IsOptional, IsString } from "class-validator";

const EMPLOYEE_SHIFT_TYPES = ["WORK", "LEAVE", "OFF_DAY"] as const;

export class CreateEmployeeShiftDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsEnum(EMPLOYEE_SHIFT_TYPES)
  shiftType!: (typeof EMPLOYEE_SHIFT_TYPES)[number];

  @IsString()
  scheduledStartAt!: string;

  @IsString()
  scheduledEndAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
