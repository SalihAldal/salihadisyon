import { IsEmail, IsOptional, IsString, Matches, MinLength, ValidateIf } from "class-validator";

export class LoginDto {
  @ValidateIf((dto: LoginDto) => !dto.pinCode)
  @IsEmail()
  email!: string;

  @ValidateIf((dto: LoginDto) => !dto.pinCode)
  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  deviceLabel?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  pinCode?: string;
}
