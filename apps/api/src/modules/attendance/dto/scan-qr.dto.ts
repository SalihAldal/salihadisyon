import { IsOptional, IsString } from "class-validator";

export class ScanQrDto {
  @IsString()
  token!: string;

  @IsString()
  employeeQrToken!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
