import { IsOptional, IsString } from "class-validator";

export class AttendanceOverviewDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}
