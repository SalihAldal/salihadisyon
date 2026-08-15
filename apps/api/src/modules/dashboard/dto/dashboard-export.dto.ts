import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class DashboardExportDto {
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
  @IsIn(["csv"])
  format?: "csv";
}
