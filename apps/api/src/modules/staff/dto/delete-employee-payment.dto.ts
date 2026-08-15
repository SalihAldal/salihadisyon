import { IsOptional, IsString } from "class-validator";

export class DeleteEmployeePaymentDto {
  @IsOptional()
  @IsString()
  note?: string;
}
