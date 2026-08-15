import { Transform, Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class OpenRegisterDto {
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
  openingCash!: number;
}
