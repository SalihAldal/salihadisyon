import { IsBoolean, IsOptional, IsString } from "class-validator";

export class RestoreSystemBackupDto {
  @IsString()
  backupId!: string;

  @IsString()
  confirmationText!: string;

  @IsOptional()
  @IsBoolean()
  createSafetyBackup?: boolean;
}
