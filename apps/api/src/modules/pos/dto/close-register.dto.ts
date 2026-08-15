import { Transform, Type } from "class-transformer";
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class CashDenominationInputDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  denomination!: number;

  @Type(() => Number)
  @IsInt()
  @IsNumber()
  @Min(0)
  quantity!: number;
}

export class CloseRegisterDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  terminalId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedCash!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashDenominationInputDto)
  denominations?: CashDenominationInputDto[];
}
