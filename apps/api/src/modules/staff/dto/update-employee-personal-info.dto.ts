import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class UpdateEmployeePersonalInfoDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  identityNumber?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  bloodType?: string;

  @IsOptional()
  @IsString()
  disabilityStatus?: string;

  @IsOptional()
  @IsString()
  educationStatus?: string;

  @IsOptional()
  @IsString()
  highestEducationLevel?: string;

  @IsOptional()
  @IsString()
  lastEducationSchool?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  childrenCount?: number;

  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
