import { IsString } from "class-validator";

export class MergeTicketDto {
  @IsString()
  sourceTicketId!: string;

  @IsString()
  targetTicketId!: string;
}
