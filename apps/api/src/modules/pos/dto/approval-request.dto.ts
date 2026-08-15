import { IsOptional, IsString } from "class-validator";

export class ApprovalRequestDto {
  @IsString()
  action!: string;

  @IsString()
  referenceType!: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
