import { IsOptional, IsString } from "class-validator";

export class AddTicketNoteDto {
  @IsOptional()
  @IsString()
  ticketItemId?: string;

  @IsOptional()
  @IsString()
  noteType?: string;

  @IsString()
  content!: string;
}
