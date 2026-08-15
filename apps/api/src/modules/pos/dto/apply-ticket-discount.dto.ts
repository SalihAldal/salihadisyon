import { IsBoolean, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class ApplyTicketDiscountDto {
  @IsOptional()
  @IsString()
  ticketItemId?: string;

  @IsString()
  discountType!: string;

  @IsString()
  label!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  approvalRequired?: boolean;
}
