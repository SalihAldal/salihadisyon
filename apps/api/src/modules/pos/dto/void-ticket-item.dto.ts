import { IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

export class VoidTicketItemDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;
}
