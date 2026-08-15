import { Transform, Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class UpdateTicketItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variantIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modifierOptionIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredChoiceOptionIds?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  note?: string;
}
