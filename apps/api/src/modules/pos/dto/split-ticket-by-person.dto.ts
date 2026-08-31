import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class SplitTicketPersonLineDto {
  @IsString()
  itemId!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

class SplitTicketPersonDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitTicketPersonLineDto)
  items!: SplitTicketPersonLineDto[];
}

export class SplitTicketByPersonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitTicketPersonDto)
  persons!: SplitTicketPersonDto[];

  @IsOptional()
  @IsString()
  targetChannel?: string;
}
