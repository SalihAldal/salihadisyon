import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateSystemBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
