import { IsOptional, IsString } from "class-validator";

export class RegisterPushTokenDto {
  @IsString()
  pushToken!: string;

  @IsString()
  deviceType!: string;

  @IsString()
  platform!: string;

  @IsOptional()
  @IsString()
  fingerprint?: string;
}
