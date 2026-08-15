import { IsObject } from "class-validator";

export class CreateAccountingResourceDto {
  @IsObject()
  data!: Record<string, unknown>;
}
