import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(["day", "week", "month"])
  granularity?: "day" | "week" | "month";
}
