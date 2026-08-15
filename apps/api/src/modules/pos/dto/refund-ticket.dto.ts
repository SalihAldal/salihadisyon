import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class RefundTicketDto {
  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsString()
  reason!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  terminalId?: string;
}
