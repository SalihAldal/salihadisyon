import { IsOptional, IsString } from "class-validator";

export class AdminPosConfigQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  terminalId?: string;
}
