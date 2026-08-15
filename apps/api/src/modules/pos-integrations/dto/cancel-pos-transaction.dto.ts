import { IsOptional, IsString } from "class-validator";

export class CancelPosTransactionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
