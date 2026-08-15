import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

const EMPLOYEE_PAYMENT_MOVEMENT_TYPES = ["PAYMENT", "RECEIVABLE"] as const;
const EMPLOYEE_PAYMENT_METHODS = ["CASH", "CREDIT_CARD", "MEAL_CARD", "GIFT_CARD", "BANK_TRANSFER", "OTHER"] as const;

export class CreateEmployeePaymentDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsEnum(EMPLOYEE_PAYMENT_MOVEMENT_TYPES)
  movementType?: (typeof EMPLOYEE_PAYMENT_MOVEMENT_TYPES)[number];

  @IsOptional()
  @IsString()
  transactionType?: string;

  @IsOptional()
  @IsEnum(EMPLOYEE_PAYMENT_METHODS)
  paymentMethod?: (typeof EMPLOYEE_PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  documentUrl?: string;

  @IsOptional()
  @IsString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
