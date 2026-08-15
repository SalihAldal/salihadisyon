import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class BranchRevenueQueryDto {
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
  @IsIn(["revenue", "ticketCount", "averageBasket"])
  sortBy?: "revenue" | "ticketCount" | "averageBasket";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc";

  @IsOptional()
  @IsString()
  search?: string;
}
