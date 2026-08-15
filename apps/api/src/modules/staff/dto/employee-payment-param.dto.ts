import { IsString } from "class-validator";

export class EmployeePaymentParamDto {
  @IsString()
  paymentId!: string;
}
