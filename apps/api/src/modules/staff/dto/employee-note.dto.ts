import { IsOptional, IsString } from "class-validator";

export class EmployeeNoteDto {
  @IsOptional()
  @IsString()
  note?: string;
}
