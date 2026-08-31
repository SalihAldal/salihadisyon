import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, ValidateIf } from "class-validator";

export class ApplyTicketDiscountDto {
  @IsOptional()
  @IsString()
  ticketItemId?: string;

  @IsString()
  discountType!: string;

  @IsOptional()
  @IsIn(["DISCOUNT", "COMP"])
  discountKind?: "DISCOUNT" | "COMP";

  @IsString()
  label!: string;

  @IsString()
  reason!: string;

  @ValidateIf((dto) => dto.percentage === undefined || dto.percentage === null)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ValidateIf((dto) => dto.amount === undefined || dto.amount === null)
  @IsOptional()
  @IsNumber()
  @Min(0)
  percentage?: number;

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;
}
