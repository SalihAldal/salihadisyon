import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEmail, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from "class-validator";

export class UpdateEmployeeAccountSettingsDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  pinCode?: string;

  @IsOptional()
  @IsString()
  restaurantRole?: string;

  @IsOptional()
  @IsString()
  staffRoleId?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overtimeEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyFreeDrinkLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalBreakMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleKeys?: string[];
}
