import { IsObject } from "class-validator";

export class CreateInventoryResourceDto {
  @IsObject()
  data!: Record<string, unknown>;
}
