import { IsObject } from "class-validator";

export class UpdateInventoryResourceDto {
  @IsObject()
  data!: Record<string, unknown>;
}
