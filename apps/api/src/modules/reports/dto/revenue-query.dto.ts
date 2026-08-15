import { IsDateString, IsIn, IsOptional, IsString, Max, Min } from "class-validator";

export class RevenueQueryDto {
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
  groupBy?: "day" | "week" | "month";

  @IsOptional()
  @Min(1)
  @Max(180)
  limit?: number;
}
