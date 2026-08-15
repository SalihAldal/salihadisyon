import { IsObject } from "class-validator";

export class UpdateAccountingResourceDto {
  @IsObject()
  data!: Record<string, unknown>;
}
