import { IsObject } from "class-validator";

export class CreatePosSettingItemDto {
  @IsObject()
  data!: Record<string, unknown>;
}
