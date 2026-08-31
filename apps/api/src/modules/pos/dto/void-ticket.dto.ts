import { IsString, MinLength } from "class-validator";

export class VoidTicketDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
