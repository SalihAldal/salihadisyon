import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateQrTokenDto {
  @IsString()
  branchId!: string;

  @IsIn(["SHIFT_IN", "SHIFT_OUT", "BREAK_START", "BREAK_END"])
  action!: "SHIFT_IN" | "SHIFT_OUT" | "BREAK_START" | "BREAK_END";

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(240)
  expiresInMinutes?: number;
}
