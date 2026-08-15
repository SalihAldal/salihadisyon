import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class SplitTicketLineDto {
  @IsString()
  itemId!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

export class SplitTicketDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitTicketLineDto)
  items!: SplitTicketLineDto[];

  @IsOptional()
  @IsString()
  ticketName?: string;

  @IsOptional()
  @IsString()
  targetChannel?: string;
}
