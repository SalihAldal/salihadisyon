import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ApproveAttendanceDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
