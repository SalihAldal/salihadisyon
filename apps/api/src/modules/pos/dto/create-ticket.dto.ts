import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateTicketDto {
  @IsIn(["TABLE", "SELF_SERVICE", "DELIVERY", "TAKEAWAY", "QR_MENU"])
  channel!: "TABLE" | "SELF_SERVICE" | "DELIVERY" | "TAKEAWAY" | "QR_MENU";

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  ticketName?: string;

  @IsInt()
  @Min(1)
  @Max(50)
  coverCount!: number;

  @IsOptional()
  @IsArray()
  initialTags?: string[];
}
