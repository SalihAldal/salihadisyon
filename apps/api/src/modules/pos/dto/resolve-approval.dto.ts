import { IsOptional, IsString, MinLength } from "class-validator";

export class ResolveApprovalDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  note?: string;
}
