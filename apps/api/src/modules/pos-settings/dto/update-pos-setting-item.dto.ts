import { IsObject } from "class-validator";

export class UpdatePosSettingItemDto {
  @IsObject()
  data!: Record<string, unknown>;
}
