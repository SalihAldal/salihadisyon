import { IsOptional, IsString } from "class-validator";

export class VoidTicketDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
