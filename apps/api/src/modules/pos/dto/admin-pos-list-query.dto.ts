import { IsOptional, IsString } from "class-validator";

export class AdminPosListQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  includeInactive?: string;
}
