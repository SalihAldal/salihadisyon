import { IsObject } from "class-validator";

export class CreateStaffResourceDto {
  @IsObject()
  data!: Record<string, unknown>;
}
