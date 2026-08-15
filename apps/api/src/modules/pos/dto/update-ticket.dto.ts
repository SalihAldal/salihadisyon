import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  tableId?: string | null;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  ticketName?: string | null;

  @IsOptional()
  @IsIn(["TABLE", "SELF_SERVICE", "DELIVERY", "TAKEAWAY", "QR_MENU"])
  channel?: "TABLE" | "SELF_SERVICE" | "DELIVERY" | "TAKEAWAY" | "QR_MENU";

  @IsOptional()
  @IsIn(["DRAFT", "OPEN", "PREPARING", "SERVED", "PAYMENT_PENDING", "PAID", "CANCELLED", "VOIDED"])
  status?: "DRAFT" | "OPEN" | "PREPARING" | "SERVED" | "PAYMENT_PENDING" | "PAID" | "CANCELLED" | "VOIDED";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  coverCount?: number;
}
