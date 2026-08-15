import { IsOptional, IsString } from "class-validator";

export class DrawerOpenDto {
  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
