import { Transform, Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class PaymentSplitDto {
  @IsIn(["CASH", "CREDIT_CARD", "MEAL_CARD", "GIFT_CARD", "BANK_TRANSFER", "OTHER"])
  method!: "CASH" | "CREDIT_CARD" | "MEAL_CARD" | "GIFT_CARD" | "BANK_TRANSFER" | "OTHER";

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  referenceNumber?: string;
}

export class CollectPaymentDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  ticketId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  splits!: PaymentSplitDto[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  approvalRequestId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  terminalId?: string;
}
