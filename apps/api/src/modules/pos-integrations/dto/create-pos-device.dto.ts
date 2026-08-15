import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class CreatePosDeviceDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsString()
  @IsNotEmpty()
  serialNumber!: string;

  @IsOptional()
  @IsString()
  registryNumber?: string;

  @IsString()
  @IsIn(["NETWORK", "USB"])
  connectionType!: "NETWORK" | "USB";

  @IsOptional()
  @IsString()
  @Matches(
    /^(25[0-5]|2[0-4]\d|[01]?\d\d?)(\.(25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/,
    { message: "IP adresi gecersiz." },
  )
  ipAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  pinCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  capabilitiesJson?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown>;
}
